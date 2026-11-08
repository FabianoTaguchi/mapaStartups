// Código comum às três páginas (busca, selecionados e spam): guarda as duas
// listas no navegador e monta o cartão de cada resultado.
(() => {
  'use strict';

  const CHAVE_SELECIONADOS = 'mapaStartups.selecionados';
  const CHAVE_SPAM = 'mapaStartups.spam';

  // Compara nomes e endereços ignorando acentos, maiúsculas e pontuação.
  const normalizar = (t) => String(t ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function siteDe(url) {
    try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; }
  }

  // Identidade do item dentro das listas: o nome quando existe, senão o site.
  function chaveItem(it) {
    if (!it) return '';
    return normalizar(it.nome) || siteDe(it.website) || normalizar(it.fonte);
  }

  // Identidade para reconhecer o mesmo projeto repetido na busca: o nome quando
  // existe, senão o site. Não usa a "fonte", porque vários projetos diferentes
  // podem vir da mesma página.
  function chaveUnica(it) {
    if (!it) return '';
    return normalizar(it.nome) || siteDe(it.website);
  }

  function ler(chave) {
    try {
      const valor = JSON.parse(localStorage.getItem(chave) || '[]');
      return Array.isArray(valor) ? valor : [];
    } catch { return []; }
  }

  function gravar(chave, lista) {
    try { localStorage.setItem(chave, JSON.stringify(lista)); } catch { /* armazenamento indisponível */ }
  }

  const lerSelecionados = () => ler(CHAVE_SELECIONADOS);
  const lerSpam = () => ler(CHAVE_SPAM);

  // Acrescenta sem repetir: o mesmo item não entra duas vezes na lista.
  function acrescentar(chave, item) {
    const lista = ler(chave);
    if (!lista.some((x) => chaveItem(x) === chaveItem(item))) lista.push(item);
    gravar(chave, lista);
    return lista;
  }

  const acrescentarSelecionado = (item) => acrescentar(CHAVE_SELECIONADOS, item);
  const acrescentarSpam = (item) => acrescentar(CHAVE_SPAM, item);

  function remover(chave, item) {
    const lista = ler(chave).filter((x) => chaveItem(x) !== chaveItem(item));
    gravar(chave, lista);
    return lista;
  }

  // Tirar do spam libera o item para voltar a aparecer nas buscas.
  const removerDoSpam = (item) => remover(CHAVE_SPAM, item);
  // Tirar dos selecionados devolve o item às buscas.
  const removerDosSelecionados = (item) => remover(CHAVE_SELECIONADOS, item);

  // Está na lista? Compara o nome e, quando os dois têm site, também o site.
  function estaNaLista(item, lista) {
    const alvo = chaveItem(item);
    const site = siteDe(item && item.website);
    return (lista || []).some((s) => chaveItem(s) === alvo || (site && siteDe(s.website) === site));
  }

  const ehSpam = (item, spam) => estaNaLista(item, spam);

  // Já escolhido numa busca anterior: o item pode reaparecer, mas não ser
  // marcado de novo enquanto estiver na seleção.
  const ehSelecionado = (item, selecionados) => estaNaLista(item, selecionados);

  function filtrarSpam(itens) {
    const spam = lerSpam();
    return (itens || []).filter((it) => !ehSpam(it, spam));
  }

  // ----- Cartão -----

  function linkSeguro(url, texto) {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = texto || url;
    return a;
  }

  function campo(dl, rotulo, valor, comoLink) {
    const dt = document.createElement('dt');
    dt.textContent = rotulo;
    const dd = document.createElement('dd');
    const link = comoLink && linkSeguro(valor);
    if (link) dd.appendChild(link);
    else if (valor) dd.textContent = valor;
    else { dd.textContent = 'não identificado'; dd.className = 'nd'; }
    dl.append(dt, dd);
  }

  function criarCartao(it, opcoes = {}) {
    const cartao = document.createElement('div');
    cartao.className = 'item';
    const h4 = document.createElement('h4');
    h4.textContent = it.nome;
    const p = document.createElement('p');
    p.textContent = it.resumo || '';
    const dl = document.createElement('dl');
    if (opcoes.mostrarConsulta && it.consulta) campo(dl, 'Consulta', it.consulta);
    campo(dl, 'Responsável', it.responsavel);
    campo(dl, 'Área', it.area);
    campo(dl, 'Website', it.website, true);
    campo(dl, 'Fonte', it.fonte, true);
    cartao.append(h4, p, dl);
    return cartao;
  }

  // Grade de cartões de uma página de lista, com uma ação opcional em cada um.
  function montarLista(alvo, itens, opcoes = {}) {
    alvo.innerHTML = '';
    if (!itens.length) {
      const p = document.createElement('p');
      p.className = 'vazio';
      p.textContent = opcoes.vazio || 'Nada por aqui.';
      alvo.appendChild(p);
      return;
    }
    const grade = document.createElement('div');
    grade.className = 'itens';
    itens.forEach((it) => {
      const cartao = criarCartao(it, { mostrarConsulta: true });
      if (opcoes.rotuloAcao) {
        const acoes = document.createElement('div');
        acoes.className = 'acoes';
        const botao = document.createElement('button');
        botao.type = 'button';
        // O tom segue o padrão das caixas da busca: verde para os selecionados,
        // vermelho para o spam.
        botao.className = `secundario ${opcoes.tom || 'tom-verde'}`;
        const icone = document.createElement('span');
        icone.className = 'icone';
        icone.setAttribute('aria-hidden', 'true');
        icone.textContent = opcoes.simbolo || '✓';
        botao.append(icone, document.createTextNode(opcoes.rotuloAcao));
        botao.addEventListener('click', () => opcoes.aoAgir(it));
        acoes.appendChild(botao);
        cartao.appendChild(acoes);
      }
      grade.appendChild(cartao);
    });
    alvo.appendChild(grade);
  }

  window.Mapa = {
    normalizar,
    chaveItem,
    chaveUnica,
    lerSelecionados,
    lerSpam,
    acrescentarSelecionado,
    acrescentarSpam,
    removerDoSpam,
    removerDosSelecionados,
    ehSpam,
    ehSelecionado,
    filtrarSpam,
    criarCartao,
    montarLista,
  };
})();
