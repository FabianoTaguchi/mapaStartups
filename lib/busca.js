// Provedores de busca: SearXNG (gratuito, local) ou Serper.dev (Google, pago).
import { config } from './config.js';

const PERIODOS_SEARXNG = { 'qdr:d': 'day', 'qdr:w': 'week', 'qdr:m': 'month', 'qdr:y': 'year' };
const IDIOMAS_SEARXNG = { lang_pt: 'pt-BR', lang_en: 'en', lang_es: 'es' };
const IDIOMAS_SERPER = { lang_pt: 'pt-br', lang_en: 'en', lang_es: 'es' };
const PAISES_SERPER = { countryBR: 'br', countryPT: 'pt', countryUS: 'us' };

async function buscarSearxng(consulta, filtros, num) {
  const params = new URLSearchParams({ q: consulta, format: 'json' });
  if (IDIOMAS_SEARXNG[filtros.idioma]) params.set('language', IDIOMAS_SEARXNG[filtros.idioma]);
  if (PERIODOS_SEARXNG[filtros.periodo]) params.set('time_range', PERIODOS_SEARXNG[filtros.periodo]);

  let resp;
  try {
    resp = await fetch(`${config.searxngUrl}/search?${params}`, { signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error(`SearXNG não respondeu em ${config.searxngUrl}. Ele está rodando? (docker compose up -d)`);
  }
  if (resp.status === 403) {
    throw new Error('O SearXNG recusou o formato JSON. Habilite "formats: [html, json]" no settings.yml.');
  }
  if (!resp.ok) throw new Error(`SearXNG respondeu ${resp.status}.`);
  const dados = await resp.json();
  return (dados.results || [])
    .slice(0, num)
    .map((r) => ({ titulo: r.title, link: r.url, trecho: r.content || '' }));
}

async function buscarSerper(consulta, filtros, num) {
  if (!config.serperKey) throw new Error('SERPER_API_KEY não definida no .env.');
  const corpo = { q: consulta, num };
  if (IDIOMAS_SERPER[filtros.idioma]) corpo.hl = IDIOMAS_SERPER[filtros.idioma];
  if (PAISES_SERPER[filtros.pais]) corpo.gl = PAISES_SERPER[filtros.pais];
  if (filtros.periodo) corpo.tbs = filtros.periodo;

  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': config.serperKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!resp.ok) throw new Error(`Serper respondeu ${resp.status}: ${await resp.text()}`);
  const dados = await resp.json();
  return (dados.organic || []).map((r) => ({ titulo: r.title, link: r.link, trecho: r.snippet || '' }));
}

export function buscar(consulta, filtros = {}, num = 10) {
  if (config.provedorBusca === 'serper') return buscarSerper(consulta, filtros, num);
  return buscarSearxng(consulta, filtros, num);
}

export async function statusBusca() {
  if (config.provedorBusca === 'serper') {
    return { provedor: 'Serper.dev (Google)', ok: Boolean(config.serperKey), detalhe: config.serperKey ? '' : 'SERPER_API_KEY ausente' };
  }
  try {
    await fetch(config.searxngUrl, { signal: AbortSignal.timeout(3000) });
    return { provedor: 'SearXNG', ok: true, detalhe: '' };
  } catch {
    return { provedor: 'SearXNG', ok: false, detalhe: `não encontrado em ${config.searxngUrl}` };
  }
}
