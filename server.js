// Servidor do Mapa Startups: serve a interface e expõe /api/resumir, que
// busca a consulta no Google (via Serper.dev) e usa o Claude para extrair
// um mini-resumo de cada startup/projeto encontrado.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const PORTA = Number(process.env.PORT) || 3000;
const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const MAX_PAGINAS_VISITADAS = Number(process.env.MAX_PAGINAS_VISITADAS) || 5;
const MAX_CONTINUACOES = 5;
const RAIZ = path.dirname(fileURLToPath(import.meta.url));

const client = new Anthropic();

const ResumoSchema = z.object({
  itens: z.array(z.object({
    nome: z.string().describe('Nome da startup ou do projeto'),
    responsavel: z.string().nullable().describe('Fundador(es), CEO ou coordenador; null se não encontrado'),
    area: z.string().nullable().describe('Área de atuação / setor'),
    website: z.string().nullable().describe('Site oficial da startup/projeto'),
    resumo: z.string().describe('Uma ou duas frases sobre o que a startup/projeto faz'),
    fonte: z.string().describe('URL onde a informação foi encontrada'),
  })),
});

const SISTEMA = `Você ajuda a mapear startups e projetos de inovação a partir de resultados de busca.
Para cada startup ou projeto citado nos resultados, extraia: nome, responsável (fundador, CEO ou coordenador), área de atuação, website oficial, um resumo de uma ou duas frases e a URL de onde tirou a informação.
Use a ferramenta web_fetch para abrir as páginas mais promissoras quando o trecho do resultado não trouxer o responsável, a área ou o site oficial.
Nunca invente dados: se uma informação não aparecer nas fontes, use null.
Ignore resultados que não citem uma startup ou projeto específico (listas genéricas, vagas, notícias sem nome de empresa). Não repita a mesma startup.
Escreva em português.`;

// ---------- Busca no Google (Serper.dev) ----------

const IDIOMAS = { lang_pt: 'pt-br', lang_en: 'en', lang_es: 'es' };
const PAISES = { countryBR: 'br', countryPT: 'pt', countryUS: 'us' };

async function buscarNoGoogle(consulta, filtros = {}, num = 10) {
  const corpo = { q: consulta, num };
  if (IDIOMAS[filtros.idioma]) corpo.hl = IDIOMAS[filtros.idioma];
  if (PAISES[filtros.pais]) corpo.gl = PAISES[filtros.pais];
  if (filtros.periodo) corpo.tbs = filtros.periodo;

  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!resp.ok) throw new Error(`Serper respondeu ${resp.status}: ${await resp.text()}`);
  const dados = await resp.json();
  return (dados.organic || []).map((r) => ({ titulo: r.title, link: r.link, trecho: r.snippet || '' }));
}

// ---------- Extração com Claude ----------

async function resumirComClaude(consulta, resultados) {
  const tools = [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: MAX_PAGINAS_VISITADAS }];
  let pedido;
  if (resultados) {
    const lista = resultados
      .map((r, i) => `${i + 1}. ${r.titulo}\n   ${r.link}\n   ${r.trecho}`)
      .join('\n\n');
    pedido = `Consulta feita no Google: ${consulta}\n\nResultados:\n\n${lista}`;
  } else {
    // Sem chave do Serper: o próprio Claude faz a busca na web.
    tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 3 });
    pedido = `Pesquise na web por: ${consulta}\n\nDepois extraia as startups/projetos encontrados.`;
  }

  const formato = betaZodOutputFormat(ResumoSchema);
  const messages = [{ role: 'user', content: pedido }];
  for (let i = 0; i <= MAX_CONTINUACOES; i++) {
    // create() em vez de parse(): respostas intermediárias (pause_turn) não são JSON.
    const resposta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SISTEMA,
      output_config: { effort: 'medium', format: { type: formato.type, schema: formato.schema } },
      tools,
      messages,
    });

    if (resposta.stop_reason === 'pause_turn') {
      // Busca/leitura de páginas ainda em andamento no servidor: retoma.
      messages.splice(1, messages.length - 1, { role: 'assistant', content: resposta.content });
      continue;
    }
    if (resposta.stop_reason === 'refusal') {
      throw new Error('O modelo recusou esta consulta.');
    }
    const texto = resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return formato.parse(texto).itens;
    } catch {
      throw new Error(`Resposta sem resumo estruturado (stop_reason: ${resposta.stop_reason}).`);
    }
  }
  throw new Error('A pesquisa demorou demais e foi interrompida.');
}

// ---------- HTTP ----------

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const ARQUIVOS_PUBLICOS = new Set(['/index.html', '/style.css', '/app.js']);

function enviarJson(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
}

async function lerCorpo(req) {
  let texto = '';
  for await (const parte of req) {
    texto += parte;
    if (texto.length > 100_000) throw new Error('Corpo da requisição muito grande');
  }
  return JSON.parse(texto || '{}');
}

async function tratarResumir(req, res) {
  let corpo;
  try {
    corpo = await lerCorpo(req);
  } catch {
    return enviarJson(res, 400, { erro: 'JSON inválido.' });
  }
  const consulta = String(corpo.consulta || '').trim();
  if (!consulta) return enviarJson(res, 400, { erro: 'Informe a consulta.' });

  try {
    const usarGoogle = Boolean(process.env.SERPER_API_KEY);
    const resultados = usarGoogle
      ? await buscarNoGoogle(consulta, corpo.filtros, Number(corpo.maxResultados) || 10)
      : null;
    const itens = resultados && !resultados.length ? [] : await resumirComClaude(consulta, resultados);
    enviarJson(res, 200, { consulta, origem: usarGoogle ? 'google' : 'claude-web-search', itens });
  } catch (erro) {
    console.error(`[${consulta}]`, erro);
    let mensagem = erro.message;
    if (erro instanceof Anthropic.AuthenticationError) mensagem = 'Chave da API do Claude inválida ou ausente (ANTHROPIC_API_KEY).';
    else if (erro instanceof Anthropic.RateLimitError) mensagem = 'Limite de uso da API do Claude atingido; tente novamente em instantes.';
    else if (erro instanceof Anthropic.APIError) mensagem = `Erro na API do Claude (${erro.status}): ${erro.message}`;
    enviarJson(res, 502, { erro: mensagem });
  }
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/status' && req.method === 'GET') {
    return enviarJson(res, 200, {
      claude: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      google: Boolean(process.env.SERPER_API_KEY),
    });
  }
  if (url.pathname === '/api/resumir' && req.method === 'POST') {
    return tratarResumir(req, res);
  }

  const caminho = url.pathname === '/' ? '/index.html' : url.pathname;
  if (req.method !== 'GET' || !ARQUIVOS_PUBLICOS.has(caminho)) {
    res.writeHead(404).end('Não encontrado');
    return;
  }
  const conteudo = await fs.readFile(path.join(RAIZ, caminho));
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(caminho)] });
  res.end(conteudo);
});

servidor.listen(PORTA, () => {
  console.log(`Mapa Startups em http://localhost:${PORTA}`);
  if (!process.env.SERPER_API_KEY) {
    console.log('Aviso: SERPER_API_KEY não definida; as buscas usarão a pesquisa web do próprio Claude em vez do Google.');
  }
});
