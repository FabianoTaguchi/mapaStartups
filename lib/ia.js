// Provedores de IA para extrair os resumos: Ollama (gratuito, local) ou Claude (pago).
import { z } from 'zod';
import { config } from './config.js';
import { ResumoSchema, INSTRUCOES, descreverResultados } from './schema.js';
import { lerPaginas, lerPaginasEFilhas } from './paginas.js';

// ---------- Ollama ----------

const esquemaJson = z.toJSONSchema(ResumoSchema);

async function resumirComOllama(consulta, resultados) {
  const paginas = await lerPaginas(resultados.map((r) => r.link), config.maxPaginas);
  const textoPaginas = paginas
    .map((p) => `--- Página: ${p.url}\n${p.texto}`)
    .join('\n\n');
  const pedido = `${descreverResultados(consulta, resultados)}\n\n` +
    (textoPaginas ? `Conteúdo das principais páginas:\n\n${textoPaginas}\n\n` : '') +
    'Responda apenas com o JSON pedido.';

  let resp;
  try {
    resp = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModelo,
        stream: true, // evita timeout enquanto o modelo gera a resposta
        format: esquemaJson,
        options: { temperature: 0, num_ctx: config.ollamaContexto },
        messages: [
          { role: 'system', content: INSTRUCOES },
          { role: 'user', content: pedido },
        ],
      }),
    });
  } catch {
    throw new Error(`Ollama não respondeu em ${config.ollamaUrl}. Abra o aplicativo Ollama ou rode "ollama serve".`);
  }
  if (resp.status === 404) {
    throw new Error(`Modelo "${config.ollamaModelo}" não encontrado no Ollama. Rode: ollama pull ${config.ollamaModelo}`);
  }
  if (!resp.ok) throw new Error(`Ollama respondeu ${resp.status}: ${await resp.text()}`);

  // A resposta vem em linhas JSON (NDJSON), cada uma com um pedaço do texto.
  let texto = '';
  let resto = '';
  const decoder = new TextDecoder();
  for await (const parte of resp.body) {
    resto += decoder.decode(parte, { stream: true });
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const linha of linhas) {
      if (!linha.trim()) continue;
      const evento = JSON.parse(linha);
      if (evento.error) throw new Error(`Ollama: ${evento.error}`);
      texto += evento.message?.content || '';
    }
  }
  if (resto.trim()) texto += JSON.parse(resto).message?.content || '';

  try {
    return ResumoSchema.parse(JSON.parse(texto)).itens;
  } catch {
    throw new Error('O modelo local devolveu uma resposta fora do formato esperado. Tente de novo ou use um modelo maior.');
  }
}

async function statusOllama() {
  const base = { provedor: `Ollama (${config.ollamaModelo})` };
  let resp;
  try {
    resp = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  } catch (erro) {
    const codigo = erro.cause?.code || erro.name;
    const motivo = codigo === 'ECONNREFUSED'
      ? 'nada escutando nessa porta; abra o aplicativo Ollama ou rode "ollama serve"'
      : `sem resposta (${codigo}); confira OLLAMA_URL no .env`;
    return { ...base, ok: false, detalhe: `${config.ollamaUrl}: ${motivo}` };
  }
  let dados;
  try {
    dados = await resp.json();
  } catch {
    return { ...base, ok: false, detalhe: `${config.ollamaUrl} respondeu ${resp.status}, mas não parece ser o Ollama` };
  }
  const nomes = (dados.models || []).map((m) => m.name);
  const temModelo = nomes.some((n) => n === config.ollamaModelo || n === `${config.ollamaModelo}:latest`);
  if (temModelo) return { ...base, ok: true, detalhe: '' };
  const disponiveis = nomes.length ? ` (modelos instalados: ${nomes.join(', ')})` : '';
  return { ...base, ok: false, detalhe: `modelo não baixado; rode: ollama pull ${config.ollamaModelo}${disponiveis}` };
}

// ---------- Claude ----------

const MAX_CONTINUACOES = 5;
let clienteClaude;

async function resumirComClaude(consulta, resultados) {
  // Carregado só quando usado, para quem fica no modo gratuito não precisar da chave.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod');
  clienteClaude ??= new Anthropic();
  const formato = betaZodOutputFormat(ResumoSchema);

  // Baixa o corpo das páginas aqui, em vez de depender só do web_fetch: é no corpo e
  // nos links das listagens que aparecem os nomes das startups e os dados delas.
  // O segundo salto abre a página de cada startup citada, onde fica o fundador.
  const paginas = await lerPaginasEFilhas(resultados.map((r) => r.link), config.maxPaginas, config.maxPaginasFilhas);
  const textoPaginas = paginas.map((p) => `--- Página: ${p.url}\n${p.texto}`).join('\n\n');

  const messages = [{
    role: 'user',
    content: `${descreverResultados(consulta, resultados)}\n\n` +
      (textoPaginas ? `Conteúdo das páginas lidas (título, descrição, links e corpo), incluindo páginas das próprias startups:\n\n${textoPaginas}\n\n` : '') +
      'Use essas páginas e, se ainda faltar o responsável, a área ou o site oficial, a ferramenta web_fetch para abrir outras.',
  }];
  for (let i = 0; i <= MAX_CONTINUACOES; i++) {
    // create() em vez de parse(): respostas intermediárias (pause_turn) não são JSON.
    const resposta = await clienteClaude.beta.messages.create({
      model: config.claudeModelo,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUCOES,
      output_config: { effort: 'medium', format: { type: formato.type, schema: formato.schema } },
      tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: config.maxPaginas }],
      messages,
    });

    if (resposta.stop_reason === 'pause_turn') {
      // Leitura de páginas ainda em andamento no servidor: retoma.
      messages.splice(1, messages.length - 1, { role: 'assistant', content: resposta.content });
      continue;
    }
    if (resposta.stop_reason === 'refusal') throw new Error('O modelo recusou esta consulta.');
    const texto = resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return formato.parse(texto).itens;
    } catch {
      throw new Error(`Resposta sem resumo estruturado (stop_reason: ${resposta.stop_reason}).`);
    }
  }
  throw new Error('A pesquisa demorou demais e foi interrompida.');
}

export async function traduzirErroClaude(erro) {
  if (config.provedorIa !== 'claude') return erro.message;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  if (erro instanceof Anthropic.AuthenticationError) return 'Chave da API do Claude inválida ou ausente (ANTHROPIC_API_KEY).';
  if (erro instanceof Anthropic.RateLimitError) return 'Limite de uso da API do Claude atingido; tente novamente em instantes.';
  if (erro instanceof Anthropic.APIError) return `Erro na API do Claude (${erro.status}): ${erro.message}`;
  return erro.message;
}

// ---------- Interface comum ----------

export function resumir(consulta, resultados) {
  if (config.provedorIa === 'claude') return resumirComClaude(consulta, resultados);
  return resumirComOllama(consulta, resultados);
}

export async function statusIa() {
  if (config.provedorIa === 'claude') {
    const ok = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
    return { provedor: `Claude (${config.claudeModelo})`, ok, detalhe: ok ? '' : 'ANTHROPIC_API_KEY ausente' };
  }
  return statusOllama();
}
