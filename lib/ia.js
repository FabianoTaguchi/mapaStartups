// Provedores de IA para extrair os resumos: Ollama (gratuito, local) ou Claude (pago).
import http from 'node:http';
import https from 'node:https';
import { z } from 'zod';
import { config } from './config.js';
import { ResumoSchema, INSTRUCOES, descreverResultados } from './schema.js';
import { lerPaginas, lerPaginasEFilhas } from './paginas.js';

// ---------- Ollama ----------

const esquemaJson = z.toJSONSchema(ResumoSchema);

// A geração local roda na CPU e pode levar vários minutos. O fetch nativo do Node
// corta a requisição em 5 minutos, antes mesmo de receber os cabeçalhos, o que
// aparecia como "Ollama não respondeu" com o Ollama funcionando. Por isso a chamada
// é feita direto pelo http, com um prazo bem maior.
const TEMPO_LIMITE_OLLAMA = 20 * 60 * 1000;

// Devolve { status, texto } com o corpo inteiro já lido. O prazo cobre a
// requisição toda (gerar + responder) e, quando estoura, a falha do stream que
// vem depois é descartada por já haver uma rejeição.
function requisitarOllama(caminho, corpo) {
  return new Promise((resolver, rejeitar) => {
    const alvo = new URL(config.ollamaUrl + caminho);
    const transporte = alvo.protocol === 'https:' ? https : http;
    const prazo = setTimeout(() => {
      req.destroy();
      const erro = new Error('tempo limite');
      erro.codigo = 'TEMPO_LIMITE';
      rejeitar(erro);
    }, TEMPO_LIMITE_OLLAMA);
    const req = transporte.request({
      protocol: alvo.protocol,
      hostname: alvo.hostname,
      port: alvo.port || (alvo.protocol === 'https:' ? 443 : 80),
      path: alvo.pathname + alvo.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (resp) => {
      lerTexto(resp).then(
        (texto) => { clearTimeout(prazo); resolver({ status: resp.statusCode, texto }); },
        (erro) => { clearTimeout(prazo); rejeitar(erro); },
      );
    });
    req.on('error', (erro) => { clearTimeout(prazo); rejeitar(erro); });
    req.end(JSON.stringify(corpo));
  });
}

async function lerTexto(resp) {
  const pedacos = [];
  for await (const p of resp) pedacos.push(p);
  return Buffer.concat(pedacos).toString('utf8');
}

// Traduz a falha de conexão para algo acionável, em vez de um "não respondeu" genérico.
function traduzirFalhaOllama(erro) {
  const codigo = erro.codigo || erro.code || erro.name;
  if (codigo === 'TEMPO_LIMITE') {
    const minutos = Math.round(TEMPO_LIMITE_OLLAMA / 60000);
    return `O Ollama passou de ${minutos} minutos sem responder. A busca local é lenta na CPU: ` +
      'use um modelo menor (OLLAMA_MODEL=qwen2.5:3b), reduza OLLAMA_NUM_CTX ou diminua as páginas por busca.';
  }
  if (codigo === 'ECONNREFUSED') {
    return `O Ollama não está atendendo em ${config.ollamaUrl}. Abra o aplicativo Ollama ou rode "ollama serve".`;
  }
  return `A conexão com o Ollama (${config.ollamaUrl}) falhou: ${erro.message}.`;
}

async function resumirComOllama(consulta, resultados) {
  const paginas = await lerPaginas(resultados.map((r) => r.link), config.maxPaginas);
  const descricao = descreverResultados(consulta, resultados);
  // O Ollama corta em silêncio o que passa do contexto (num_ctx). Divide o espaço
  // entre as páginas (~3 caracteres por token, reservando espaço para instruções e resposta).
  const orcamento = Math.max(2_000, (config.ollamaContexto - 4_000) * 3 - descricao.length);
  const porPagina = Math.floor(orcamento / Math.max(1, paginas.length));
  const textoPaginas = paginas
    .map((p) => `--- Página: ${p.url}\n${p.texto.slice(0, porPagina)}`)
    .join('\n\n');
  const pedido = `${descricao}\n\n` +
    (textoPaginas ? `Conteúdo das principais páginas:\n\n${textoPaginas}\n\n` : '') +
    'Responda apenas com o JSON pedido.';

  let resp;
  try {
    resp = await requisitarOllama('/api/chat', {
      model: config.ollamaModelo,
      stream: true,
      format: esquemaJson,
      // Mantém o modelo na memória entre buscas: sem isso o Ollama o descarrega
      // depois de alguns minutos e a busca seguinte paga o carregamento de novo.
      keep_alive: '30m',
      options: { temperature: 0, num_ctx: config.ollamaContexto },
      messages: [
        { role: 'system', content: INSTRUCOES },
        { role: 'user', content: pedido },
      ],
    });
  } catch (erro) {
    throw new Error(traduzirFalhaOllama(erro));
  }
  if (resp.status === 404) {
    throw new Error(`Modelo "${config.ollamaModelo}" não encontrado no Ollama. Rode: ollama pull ${config.ollamaModelo}`);
  }
  if (resp.status >= 400) throw new Error(`Ollama respondeu ${resp.status}: ${resp.texto}`);

  // A resposta vem em linhas JSON (NDJSON), cada uma com um pedaço do texto.
  let texto = '';
  for (const linha of resp.texto.split('\n')) {
    if (!linha.trim()) continue;
    const evento = JSON.parse(linha);
    if (evento.error) throw new Error(`Ollama: ${evento.error}`);
    texto += evento.message?.content || '';
  }

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
