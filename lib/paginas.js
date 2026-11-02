// Baixa páginas dos resultados e extrai o texto, para a IA ler.
// Se a página vier vazia (montada por JavaScript) ou bloqueada, tenta de novo com um
// navegador de verdade (Playwright), quando ele estiver instalado.
import { config } from './config.js';

const LIMITE_BYTES = 1_000_000;
const MAX_REDIRECIONAMENTOS = 5;
// Abaixo disso, a página provavelmente é montada por JavaScript ou é um bloqueio.
const TEXTO_MINIMO = 400;
const MAX_ABAS = 3; // páginas abertas ao mesmo tempo no navegador

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const CABECALHOS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
};

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

const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Tira sobras de acessibilidade e de template ("(opens in a new tab)", "{{curso.nome}}").
const sobras = (t) => t
  .replace(/\(?\s*opens in a new tab\s*\)?/gi, '')
  .replace(/\{\{[^}]*\}\}/g, '')
  .replace(/^powered by\s+/i, '')
  .trim();

// Um <header>/<aside> é menu do site quando tem <nav> ou muitos links. Nos cards das
// listagens, o <header> costuma guardar justamente o nome da startup: esse fica.
const ehMenu = (bloco) => /<nav\b|role=["']navigation/i.test(bloco) || (bloco.match(/<a\b/gi) || []).length >= 6;

function limpar(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(header|aside)\b[\s\S]*?<\/\1>/gi, (bloco) => (ehMenu(bloco) ? ' ' : bloco))
    .replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, ' ');
}

// Links da página: nos sites de listagem é ali que estão os nomes das startups e
// os endereços delas. Resolve links relativos e descarta menus e redes sociais.
function extrairLinks(html, base) {
  const vistos = new Set();
  const links = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = new URL(decodificar(m[1]), base || undefined); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = '';
    const rotulo = sobras(semTags(m[2]));
    if (rotulo.length < 3 || rotulo.length > 140) continue;
    const chave = normalizar(rotulo).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!chave || RUIDO.has(chave)) continue;
    if (vistos.has(url.href) || url.href === base) continue;
    vistos.add(url.href);
    links.push({ rotulo, url: url.href });
  }
  return links;
}

// Analisa o HTML: devolve o texto para a IA e os links achados (usados no segundo
// salto, para chegar até a página de cada startup citada nas listagens).
function analisar(html, base = '') {
  const limite = config.maxCaracteresPagina;
  const titulo = semTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const descricao = semTags((html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '');
  const limpo = limpar(html);
  const links = extrairLinks(limpo, base);
  const corpo = semTags(limpo);

  const partes = [];
  if (titulo) partes.push(`Título: ${titulo}`);
  if (descricao) partes.push(`Descrição: ${descricao}`);
  if (links.length) {
    // Até 40% do espaço para os links; o resto, para o texto.
    const lista = links.map((l) => `- ${l.rotulo} — ${l.url}`).join('\n').slice(0, Math.floor(limite * 0.4));
    partes.push(`Links da página:\n${lista}`);
  }
  if (corpo) partes.push(`Conteúdo:\n${corpo}`);
  return { texto: partes.join('\n\n').slice(0, limite), links, tamanhoCorpo: corpo.length };
}

const BLOQUEIO = /cf-chl|challenge-platform|cf-turnstile|g-recaptcha|hcaptcha|Just a moment\.\.\.|Attention Required|Access denied|captcha/i;

// Usa o charset do cabeçalho ou do <meta>: sites em ISO-8859-1 viravam texto quebrado.
function decodificarCorpo(bytes, tipo) {
  let charset = /charset=["']?([\w-]+)/i.exec(tipo)?.[1];
  if (!charset) {
    const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(inicio)?.[1];
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function lerCorpoLimitado(resp) {
  const partes = [];
  let total = 0;
  for await (const parte of resp.body) {
    partes.push(parte);
    total += parte.length;
    if (total >= LIMITE_BYTES) break;
  }
  const bytes = new Uint8Array(Math.min(total, LIMITE_BYTES));
  let pos = 0;
  for (const parte of partes) {
    const pedaco = parte.subarray(0, bytes.length - pos);
    bytes.set(pedaco, pos);
    pos += pedaco.length;
    if (pos >= bytes.length) break;
  }
  return bytes;
}

// fetch comum. Segue os redirecionamentos à mão para conferir cada endereço.
async function baixar(url) {
  let atual = url;
  for (let i = 0; i <= MAX_REDIRECIONAMENTOS; i++) {
    if (!enderecoPermitido(atual)) return { motivo: 'endereço não permitido' };
    let resp;
    try {
      resp = await fetch(atual, { headers: CABECALHOS, redirect: 'manual', signal: AbortSignal.timeout(config.tempoLimitePagina) });
    } catch (erro) {
      const codigo = erro.cause?.code || erro.name;
      return { motivo: codigo === 'TimeoutError' ? 'tempo esgotado' : `falha de conexão (${codigo})` };
    }
    const destino = resp.headers.get('location');
    if (resp.status >= 300 && resp.status < 400 && destino) {
      resp.body?.cancel().catch(() => {});
      atual = new URL(destino, atual).href;
      continue;
    }
    const tipo = resp.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(tipo)) {
      resp.body?.cancel().catch(() => {});
      return { status: resp.status, motivo: `não é HTML (${tipo.split(';')[0] || 'sem tipo'})`, naoHtml: true };
    }
    const html = decodificarCorpo(await lerCorpoLimitado(resp), tipo);
    return { status: resp.status, url: atual, html };
  }
  return { motivo: 'redirecionamentos demais' };
}

// ---------- Navegador (opcional) ----------

let navegador; // Promise<Browser | null>
let abasAbertas = 0;
const filaAbas = [];

function abrirNavegador() {
  if (config.usarNavegador === 'nao') return Promise.resolve(null);
  navegador ??= import('playwright')
    .then(({ chromium }) => chromium.launch())
    .catch((erro) => {
      const faltaPacote = erro.code === 'ERR_MODULE_NOT_FOUND';
      console.warn(faltaPacote
        ? '[páginas] Sites montados por JavaScript não serão lidos: instale o navegador com "npm install playwright" e "npx playwright install chromium".'
        : `[páginas] Não foi possível abrir o navegador: ${erro.message.split('\n')[0]}`);
      return null;
    });
  return navegador;
}

async function comAba(tarefa) {
  if (abasAbertas >= MAX_ABAS) await new Promise((liberar) => filaAbas.push(liberar));
  abasAbertas++;
  try {
    return await tarefa();
  } finally {
    abasAbertas--;
    filaAbas.shift()?.();
  }
}

async function baixarComNavegador(url) {
  const nav = await abrirNavegador();
  if (!nav) return null;
  return comAba(async () => {
    const contexto = await nav.newContext({ userAgent: USER_AGENT, locale: 'pt-BR' });
    try {
      // Bloqueia rede interna e arquivos pesados que não trazem texto.
      await contexto.route('**/*', (rota) => {
        const req = rota.request();
        if (!enderecoPermitido(req.url()) || ['image', 'media', 'font'].includes(req.resourceType())) return rota.abort();
        return rota.continue();
      });
      const pagina = await contexto.newPage();
      const tempo = config.tempoLimitePagina * 2;
      try {
        await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: tempo });
        // Dá tempo para o JavaScript montar a lista; não falha se a rede nunca acalmar.
        await pagina.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      } catch (erro) {
        return { motivo: `navegador: ${erro.message.split('\n')[0]}` };
      }
      return { url: pagina.url(), html: (await pagina.content()).slice(0, LIMITE_BYTES * 2) };
    } finally {
      await contexto.close().catch(() => {});
    }
  });
}

export async function fecharNavegador() {
  const nav = await navegador;
  navegador = undefined;
  await nav?.close().catch(() => {});
}

// ---------- Leitura ----------

// Lê uma página e explica o que aconteceu (usado também pelo diagnóstico).
export async function lerPaginaDetalhada(url) {
  if (!enderecoPermitido(url)) return { url, ok: false, via: 'fetch', motivo: 'endereço não permitido', texto: '', links: [], tamanhoCorpo: 0 };
  const r = await baixar(url);
  let via = 'fetch';
  let resultado = r.html != null ? analisar(r.html, r.url) : null;
  // 401/403/429/503 e páginas de desafio costumam ser anti-robô: vale tentar o navegador.
  // Outros erros (404, 500...) são da própria página: não adianta insistir.
  const bloqueada = [401, 403, 429, 503].includes(r.status) ||
    Boolean(r.html && BLOQUEIO.test(r.html) && (resultado?.tamanhoCorpo ?? 0) < 2_000);
  const erroHttp = r.status >= 400 && !bloqueada;
  const vazia = Boolean(resultado) && resultado.tamanhoCorpo < TEXTO_MINIMO;
  let motivo = r.motivo || (erroHttp ? `página respondeu ${r.status}` : bloqueada ? `bloqueada (status ${r.status})`
    : vazia ? 'pouco texto (montada por JavaScript?)' : '');

  if (!r.naoHtml && !erroHttp && (r.html == null || bloqueada || vazia)) {
    const n = await baixarComNavegador(url);
    if (n?.html) {
      const comNavegador = analisar(n.html, n.url);
      if (comNavegador.tamanhoCorpo > (resultado?.tamanhoCorpo ?? 0) && !(BLOQUEIO.test(n.html) && comNavegador.tamanhoCorpo < 2_000)) {
        resultado = comNavegador;
        via = 'navegador';
        motivo = comNavegador.tamanhoCorpo < TEXTO_MINIMO ? 'pouco texto mesmo no navegador' : '';
      } else {
        motivo += ' — o navegador também não conseguiu';
      }
    } else if (n?.motivo) {
      motivo += ` — ${n.motivo}`;
    }
  }

  const ok = Boolean(resultado) && !erroHttp && !(bloqueada && via === 'fetch') && resultado.tamanhoCorpo > 0;
  return { url, ok, via, status: r.status, motivo, texto: resultado?.texto || '', links: resultado?.links || [], tamanhoCorpo: resultado?.tamanhoCorpo || 0 };
}

async function lerPagina(url) {
  const p = await lerPaginaDetalhada(url);
  if (p.motivo) console.warn(`[páginas] ${url}: ${p.motivo}${p.ok ? ` (lida via ${p.via})` : ' — ignorada'}`);
  return p.ok ? { url, texto: p.texto, links: p.links } : null;
}

export async function lerPaginas(urls, max) {
  const paginas = await Promise.all(urls.slice(0, max).map(lerPagina));
  return paginas.filter(Boolean);
}

// ---------- Segundo salto ----------

const REDES = /(^|\.)(facebook|instagram|linkedin|twitter|x|youtube|youtu|whatsapp|wa|tiktok|t|pinterest|flickr|spotify|google|apple|microsoft|bit)\.(com|me|ly|be)(\.br)?$/i;
const PERFIL = /startup|empresa|company|companies|projeto|project|portf[oó]lio|perfil|profile|incubad|acelerad|negocio|solucao|solution|vitrine|catalogo|membro|member|residente/i;
const GENERICO = /categoria|category|\/tag\/|\/tags?\/|\/page\/\d|login|signin|cadastr|politica|privacidade|privacy|termos|terms|contato|contact|sobre|about|carreira|vagas|\/feed\b|wp-json|wp-admin/i;
const ARQUIVO = /\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|docx?|xlsx?|pptx?|mp4|mp3)$/i;

// Nota de 0 em diante para quanto um link parece ser a página de uma startup.
function pontuar(link, base) {
  let u, b;
  try { u = new URL(link); b = new URL(base); } catch { return -1; }
  if (REDES.test(u.hostname) || ARQUIVO.test(u.pathname)) return -1;
  if (u.hostname === b.hostname && u.pathname === b.pathname) return -1;
  let nota = 0;
  if (PERFIL.test(u.pathname)) nota += 3;
  if (u.hostname.replace(/^www\./, '') !== b.hostname.replace(/^www\./, '')) nota += 2; // site próprio da startup
  if (u.pathname.split('/').filter(Boolean).length >= 2) nota += 1;
  if (GENERICO.test(u.pathname)) nota -= 4;
  return nota;
}

// Segundo salto: depois das páginas dos resultados, abre as páginas das startups
// citadas nelas (os cards das listagens) — é onde costumam estar o fundador e o
// site oficial, que o trecho da busca não traz. Escolhe os links mais promissores
// de cada página, alternando entre as páginas para não ficar só na primeira.
export async function lerPaginasEFilhas(urls, max, maxFilhas) {
  const principais = await lerPaginas(urls, max);
  const vistas = new Set(principais.map((p) => p.url));
  const porPagina = principais.map((p) => p.links
    .map((l) => ({ url: l.url, nota: pontuar(l.url, p.url) }))
    .filter((l) => l.nota >= 0)
    .sort((a, b) => b.nota - a.nota));

  const candidatas = [];
  for (let i = 0; candidatas.length < maxFilhas && porPagina.some((lista) => i < lista.length); i++) {
    for (const lista of porPagina) {
      const l = lista[i];
      if (!l || vistas.has(l.url)) continue;
      vistas.add(l.url);
      candidatas.push(l.url);
      if (candidatas.length >= maxFilhas) break;
    }
  }
  const filhas = await lerPaginas(candidatas, maxFilhas);
  return [...principais, ...filhas];
}
