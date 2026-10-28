// Provedores de busca: SearXNG (gratuito, local) ou Serper.dev (Google, pago).
import { config } from './config.js';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;

function datasValidas(filtros) {
  return {
    inicio: DATA_ISO.test(filtros.dataInicio || '') ? filtros.dataInicio : '',
    fim: DATA_ISO.test(filtros.dataFim || '') ? filtros.dataFim : '',
  };
}

// Período personalizado do Google: cdr:1,cd_min:M/D/AAAA,cd_max:M/D/AAAA
function periodoGoogle(filtros) {
  const { inicio, fim } = datasValidas(filtros);
  if (!inicio && !fim) return '';
  const formatar = (iso) => {
    const [a, m, d] = iso.split('-');
    return `${Number(m)}/${Number(d)}/${a}`;
  };
  return ['cdr:1', inicio && `cd_min:${formatar(inicio)}`, fim && `cd_max:${formatar(fim)}`].filter(Boolean).join(',');
}

// O SearXNG só aceita intervalos fixos até hoje: usa o menor que cobre a data inicial.
function periodoSearxng(filtros) {
  const { inicio } = datasValidas(filtros);
  if (!inicio) return '';
  const dias = (Date.now() - Date.parse(inicio)) / DIA_MS;
  if (dias <= 1) return 'day';
  if (dias <= 7) return 'week';
  if (dias <= 31) return 'month';
  if (dias <= 366) return 'year';
  return '';
}

async function buscarSearxng(consulta, filtros, num) {
  const params = new URLSearchParams({ q: consulta, format: 'json' });
  const periodo = periodoSearxng(filtros);
  if (periodo) params.set('time_range', periodo);

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
  const tbs = periodoGoogle(filtros);
  if (tbs) corpo.tbs = tbs;

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
