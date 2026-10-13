// Servidor do Mapa Startups: serve a interface e expõe /api/resumir, que
// busca a consulta (SearXNG ou Serper/Google) e usa uma IA (Ollama local ou
// Claude) para extrair um mini-resumo de cada startup/projeto encontrado.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './lib/config.js';
import { buscar, statusBusca } from './lib/busca.js';
import { resumir, statusIa, traduzirErroClaude } from './lib/ia.js';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));

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
    const resultados = await buscar(consulta, corpo.filtros, Number(corpo.maxResultados) || 10);
    const itens = resultados.length ? await resumir(consulta, resultados) : [];
    enviarJson(res, 200, { consulta, itens });
  } catch (erro) {
    console.error(`[${consulta}]`, erro);
    enviarJson(res, 502, { erro: await traduzirErroClaude(erro) });
  }
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/status' && req.method === 'GET') {
    const [busca, ia] = await Promise.all([statusBusca(), statusIa()]);
    return enviarJson(res, 200, { busca, ia });
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

// O Ollama local pode levar minutos por busca: não derrubar a conexão antes.
servidor.requestTimeout = 0;

servidor.listen(config.porta, async () => {
  console.log(`Mapa Startups em http://localhost:${config.porta}`);
  const [busca, ia] = await Promise.all([statusBusca(), statusIa()]);
  for (const [rotulo, s] of [['Busca', busca], ['IA', ia]]) {
    console.log(`${rotulo}: ${s.provedor} — ${s.ok ? 'ok' : `PROBLEMA: ${s.detalhe}`}`);
  }
});
