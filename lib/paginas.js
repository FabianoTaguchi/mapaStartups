// Baixa páginas dos resultados e extrai o texto, para a IA ler.
const LIMITE_BYTES = 1_000_000;
const LIMITE_CARACTERES = 10_000; // texto final enviado à IA, por página
const LIMITE_LINKS = 4_000; // espaço reservado, dentro do limite acima, à lista de links

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

function decodificar(texto) {
  return texto.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTIDADES[e.toLowerCase()] ?? m;
    const codigo = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    try { return String.fromCodePoint(codigo); } catch { return ' '; }
  });
}

// Tira as tags e devolve o texto em uma linha só.
const semTags = (html) => decodificar(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Rótulos de menu, rede social e botão: não são nome de startup/projeto.
const RUIDO = new Set([
  'home', 'inicio', 'sobre', 'sobre nos', 'contato', 'blog', 'noticias', 'login', 'entrar', 'cadastro',
  'cadastrar', 'assine', 'newsletter', 'mais', 'ver mais', 'leia mais', 'saiba mais', 'anterior',
  'proximo', 'next', 'prev', 'previous', 'menu', 'buscar', 'pesquisar', 'compartilhar', 'facebook',
  'facebook f', 'instagram', 'linkedin', 'twitter', 'x', 'youtube', 'whatsapp', 'telegram',
  'politica de privacidade', 'termos de uso', 'cookies', 'aceitar', 'fechar', 'voltar', 'topo',
  'ir para o conteudo', 'inscricao', 'inscrever', 'saiba como', 'conheca',
]);

const normalizar = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Tira sobras de acessibilidade e de template ("(opens in a new tab)", "{{curso.nome}}").
const sobras = (t) => t
  .replace(/\(?\s*opens in a new tab\s*\)?/gi, '')
  .replace(/\{\{[^}]*\}\}/g, '')
  .replace(/^powered by\s+/i, '')
  .trim();

// Links da página: nos sites de listagem é ali que estão os nomes das startups e
// os endereços delas. Resolve links relativos e descarta menus e redes sociais.
function extrairLinks(html, base) {
  const vistos = new Set();
  const links = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = new URL(m[1], base || undefined); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    const rotulo = sobras(semTags(m[2]));
    if (rotulo.length < 3 || rotulo.length > 140) continue;
    const chave = normalizar(rotulo).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!chave || RUIDO.has(chave)) continue;
    if (vistos.has(url.href)) continue;
    vistos.add(url.href);
    links.push({ rotulo, url: url.href });
  }
  return links;
}

// Analisa o HTML: devolve o texto para a IA e os links achados (usados no segundo
// salto, para chegar até a página de cada startup citada nas listagens).
function analisar(html, base = '') {
  const titulo = semTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const descricao = semTags((html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '');
  const limpo = html.replace(/<(script|style|noscript|svg|head|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');
  const links = extrairLinks(limpo, base);
  const corpo = semTags(limpo);

  const partes = [];
  if (titulo) partes.push(`Título: ${titulo}`);
  if (descricao) partes.push(`Descrição: ${descricao}`);
  if (links.length) {
    const lista = links.map((l) => `- ${l.rotulo} — ${l.url}`).join('\n').slice(0, LIMITE_LINKS);
    partes.push(`Links da página:\n${lista}`);
  }
  if (corpo) partes.push(`Conteúdo:\n${corpo}`);
  return { texto: partes.join('\n\n').slice(0, LIMITE_CARACTERES), links };
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
    return { url, ...analisar(html, url) };
  } catch {
    return null;
  }
}

export async function lerPaginas(urls, max) {
  const paginas = await Promise.all(urls.slice(0, max).map(lerPagina));
  return paginas.filter(Boolean);
}

// Segundo salto: depois das páginas dos resultados, abre as páginas das startups
// citadas nelas (os cards das listagens) — é onde costumam estar o fundador e o
// site oficial, que o trecho da busca não traz.
export async function lerPaginasEFilhas(urls, max, maxFilhas) {
  const principais = await lerPaginas(urls, max);
  const vistas = new Set(principais.map((p) => p.url));
  const candidatas = [];
  for (const p of principais) {
    for (const l of p.links) {
      if (vistas.has(l.url)) continue;
      vistas.add(l.url);
      candidatas.push(l.url);
    }
  }
  const filhas = await lerPaginas(candidatas, maxFilhas);
  return [...principais, ...filhas];
}
