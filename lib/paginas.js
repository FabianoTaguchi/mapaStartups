// Baixa páginas dos resultados e extrai o texto, para a IA local ler.
const LIMITE_BYTES = 1_000_000;
const LIMITE_CARACTERES = 4000;

// Evita que um resultado de busca faça o servidor acessar a rede interna.
function enderecoPermitido(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return !(
    h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '::1' ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^f[cd]/.test(h) || /^fe80:/.test(h)
  );
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function htmlParaTexto(html) {
  const titulo = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const descricao = (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '';
  const corpo = html
    .replace(/<(script|style|noscript|svg|head|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) => {
      if (e[0] !== '#') return ENTIDADES[e.toLowerCase()] ?? m;
      const codigo = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      try { return String.fromCodePoint(codigo); } catch { return ' '; }
    })
    .replace(/\s+/g, ' ')
    .trim();
  return [titulo.trim(), descricao.trim(), corpo].filter(Boolean).join('\n');
}

async function lerPagina(url) {
  if (!enderecoPermitido(url)) return null;
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (MapaStartups)', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    });
    if (!resp.ok || !/text\/html/i.test(resp.headers.get('content-type') || '')) return null;
    const html = (await resp.text()).slice(0, LIMITE_BYTES);
    return { url, texto: htmlParaTexto(html).slice(0, LIMITE_CARACTERES) };
  } catch {
    return null;
  }
}

export async function lerPaginas(urls, max) {
  const paginas = await Promise.all(urls.slice(0, max).map(lerPagina));
  return paginas.filter(Boolean);
}
