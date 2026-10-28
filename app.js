(() => {
  'use strict';

  const LIMITE_BUSCAS = 200;
  const CHAVE_STORAGE = 'mapaStartups.estado';

  const $ = (sel) => document.querySelector(sel);
  const el = {
    tags: $('#tags'),
    input: $('#termo-input'),
    limpar: $('#limpar-termos'),
    aspas: $('#aspas'),
    k: $('#k'),
    dataInicio: $('#data-inicio'),
    dataFim: $('#data-fim'),
    sites: $('#sites'),
    regiao: $('#regiao'),
    contador: $('#contador'),
    aviso: $('#aviso'),
    resultados: $('#resultados'),
    vazio: $('#vazio'),
    abrirTodas: $('#abrir-todas'),
    copiar: $('#copiar'),
    exportar: $('#exportar'),
    exportarXlsx: $('#exportar-xlsx'),
  };

  let termos = [];
  let buscas = [];
  // Assinatura das buscas atuais: identifica quando o usuário começou uma nova busca.
  let assinaturaBuscas = '';

  // ---------- Termos ----------

  function adicionarTermos(texto) {
    texto.split(/[,;\n]/)
      .map((t) => t.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .forEach((t) => {
        if (!termos.some((x) => x.toLowerCase() === t.toLowerCase())) termos.push(t);
      });
    atualizar();
  }

  function removerTermo(i) {
    termos.splice(i, 1);
    atualizar();
  }

  function renderizarTags() {
    el.tags.querySelectorAll('.tag').forEach((n) => n.remove());
    termos.forEach((t, i) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = t;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = `Remover "${t}"`;
      btn.textContent = '×';
      btn.addEventListener('click', () => removerTermo(i));
      tag.appendChild(btn);
      el.tags.insertBefore(tag, el.input);
    });
  }

  function renderizarOpcoesK() {
    const atual = Number(el.k.value) || 2;
    el.k.innerHTML = '';
    const max = Math.max(termos.length, 2);
    for (let n = 1; n <= max; n++) {
      el.k.add(new Option(String(n), String(n)));
    }
    el.k.value = String(Math.min(atual, max));
  }

  // ---------- Combinações ----------

  function combinacoes(lista, k) {
    const res = [];
    const atual = [];
    (function rec(inicio) {
      if (res.length > LIMITE_BUSCAS) return;
      if (atual.length === k) { res.push(atual.slice()); return; }
      for (let i = inicio; i < lista.length; i++) {
        atual.push(lista[i]);
        rec(i + 1);
        atual.pop();
      }
    })(0);
    return res;
  }

  function gerarGrupos() {
    if (!termos.length) return [];
    const modo = document.querySelector('input[name=modo]:checked').value;
    switch (modo) {
      case 'todos': return [{ termos: termos.slice(), op: 'E' }];
      case 'ou': return [{ termos: termos.slice(), op: 'OU' }];
      case 'separados': return termos.map((t) => ({ termos: [t], op: 'E' }));
      case 'k': {
        const k = Math.min(Number(el.k.value) || 1, termos.length);
        return combinacoes(termos, k).map((c) => ({ termos: c, op: 'E' }));
      }
      case 'todas': {
        const grupos = [];
        for (let k = 1; k <= termos.length && grupos.length <= LIMITE_BUSCAS; k++) {
          combinacoes(termos, k).forEach((c) => grupos.push({ termos: c, op: 'E' }));
        }
        return grupos;
      }
      default: return [];
    }
  }

  // ---------- Montagem da consulta ----------

  function formatarTermo(t) {
    let s = t;
    if (el.aspas.checked && /\s/.test(s) && !/^".*"$/.test(s)) s = `"${s}"`;
    return s;
  }

  // Região informada nos filtros: entra no fim de cada consulta, e é ela que
  // faz o buscador devolver resultados daquele lugar.
  function valorRegiao() {
    return el.regiao.value.trim().replace(/\s+/g, ' ').replace(/[,;]+$/, '');
  }

  function montarConsulta(grupo) {
    const partes = [];
    const formatados = grupo.termos.map(formatarTermo);
    if (grupo.op === 'OU' && formatados.length > 1) {
      partes.push(`(${formatados.join(' OR ')})`);
    } else {
      partes.push(...formatados);
    }

    const sites = listarSites();
    if (sites.length === 1) partes.push(`site:${sites[0]}`);
    else if (sites.length > 1) partes.push(`(${sites.map((s) => `site:${s}`).join(' OR ')})`);

    const local = valorRegiao();
    if (local) partes.push(local);

    return partes.join(' ');
  }

  function listarSites() {
    const sites = el.sites.value.split(/[,;\s]+/)
      .map((s) => s.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
      .filter(Boolean);
    return [...new Set(sites)];
  }

  function periodo() {
    return { dataInicio: el.dataInicio.value, dataFim: el.dataFim.value };
  }

  // Formato de período personalizado do Google: cdr:1,cd_min:M/D/AAAA,cd_max:M/D/AAAA
  function periodoTbs() {
    const formatar = (iso) => {
      const [a, m, d] = iso.split('-');
      return `${Number(m)}/${Number(d)}/${a}`;
    };
    const { dataInicio, dataFim } = periodo();
    if (!dataInicio && !dataFim) return '';
    let tbs = 'cdr:1';
    if (dataInicio) tbs += `,cd_min:${formatar(dataInicio)}`;
    if (dataFim) tbs += `,cd_max:${formatar(dataFim)}`;
    return tbs;
  }

  function montarUrl(consulta) {
    const p = new URLSearchParams({ q: consulta });
    const tbs = periodoTbs();
    if (tbs) p.set('tbs', tbs);
    return `https://www.google.com/search?${p.toString()}`;
  }

  // ---------- Renderização ----------

  function renderizarResultados() {
    const grupos = gerarGrupos();
    const excedeu = grupos.length > LIMITE_BUSCAS;
    buscas = grupos.slice(0, LIMITE_BUSCAS).map((g) => {
      const consulta = montarConsulta(g);
      return { consulta, url: montarUrl(consulta) };
    });

    // Nova busca (mudou termo, modo ou filtro): descarta as buscas e os resumos
    // anteriores, para uma pesquisa não se misturar com a outra.
    const assinatura = buscas.map((b) => b.url).join('\n');
    if (assinaturaBuscas && assinatura !== assinaturaBuscas) limparSecoes();
    assinaturaBuscas = assinatura;

    el.aviso.hidden = !excedeu;
    if (excedeu) {
      el.aviso.textContent = `Muitas combinações: exibindo apenas as primeiras ${LIMITE_BUSCAS}. Reduza o número de termos ou escolha outro modo.`;
    }

    el.contador.textContent = buscas.length;
    el.vazio.hidden = buscas.length > 0;
    [el.abrirTodas, el.copiar, el.exportar].forEach((b) => { b.disabled = !buscas.length; });
    atualizarBotoesPlanilha();

    el.resultados.innerHTML = '';
    buscas.forEach((b) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = b.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = b.consulta;
      const code = document.createElement('code');
      code.textContent = b.url;
      li.append(a, code);
      el.resultados.appendChild(li);
    });
    renderizarLotes();
  }

  function atualizar() {
    renderizarTags();
    renderizarOpcoesK();
    renderizarResultados();
    salvarEstado();
  }

  // ---------- Ações ----------

  function abrirTodas() {
    if (buscas.length > 10 && !confirm(`Abrir ${buscas.length} abas do Google?`)) return;
    let bloqueadas = 0;
    buscas.forEach((b) => {
      if (!window.open(b.url, '_blank', 'noopener')) bloqueadas++;
    });
    if (bloqueadas) alert(`${bloqueadas} aba(s) foram bloqueadas. Permita pop-ups para esta página e tente novamente.`);
  }

  async function copiarLinks() {
    const texto = buscas.map((b) => b.url).join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      el.copiar.textContent = 'Copiado!';
    } catch {
      prompt('Copie os links abaixo:', texto);
    }
    setTimeout(() => { el.copiar.textContent = 'Copiar links'; }, 1500);
  }

  function atualizarBotoesPlanilha() {
    el.exportarXlsx.disabled = !buscas.length && !resumos.some((r) => (r.itens || []).length) && !respostasBrutas.length;
  }

  function exportarCsv() {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const linhas = [['consulta', 'url'], ...buscas.map((b) => [b.consulta, b.url])];
    const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'buscas-google.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- Resumos ----------
  // Modo principal: o usuário pesquisa com o Claude no chat (claude.ai) e cola
  // a resposta aqui. Modo opcional: servidor local (npm start) faz tudo sozinho.

  const CABECALHO = ['consulta', 'nome', 'responsavel', 'area', 'website', 'resumo', 'fonte'];
  const CHAVE_RESUMOS = 'mapaStartups.resumos';
  const CHAVE_BRUTOS = 'mapaStartups.respostasBrutas';
  const CONCORRENCIA = 2;
  const resumo = {
    lista: $('#resumos'),
    contador: $('#contador-resumos'),
    exportar: $('#exportar-resumos'),
    limpar: $('#limpar-resumos'),
    tamanhoLote: $('#tamanho-lote'),
    lotes: $('#lotes'),
    resposta: $('#resposta-claude'),
    importar: $('#importar-resposta'),
    colarImportar: $('#colar-importar'),
    autoImportar: $('#auto-importar'),
    statusImportacao: $('#status-importacao'),
    modoAuto: $('#modo-automatico'),
    botao: $('#resumir'),
    maxResultados: $('#max-resultados'),
    status: $('#status-servidor'),
  };
  let resumos = [];
  // Textos originais devolvidos pelo Claude, na ordem em que foram importados:
  // garantem que a exportação não perca nada que o parser não tenha reconhecido.
  let respostasBrutas = [];
  let resumindo = false;
  let ultimoPromptCopiado = '';
  let ultimoTextoImportado = '';
  let aguardandoResposta = false;

  // Compara buscas ignorando aspas, espaços extras e maiúsculas.
  const chave = (t) => String(t || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  // ----- Cartões -----

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

  function renderizarBloco(r) {
    if (!r.el) {
      r.el = document.createElement('div');
      r.el.className = 'bloco-resumo';
      resumo.lista.appendChild(r.el);
    }
    r.el.innerHTML = '';
    const h3 = document.createElement('h3');
    h3.textContent = r.consulta + ' ';
    const estado = document.createElement('span');
    estado.className = 'estado';
    if (r.estado === 'carregando') estado.textContent = '— buscando e resumindo…';
    else if (r.estado === 'aguardando') estado.textContent = '— na fila';
    else if (r.estado === 'erro') { estado.textContent = `— erro: ${r.erro}`; estado.classList.add('erro'); }
    else estado.textContent = `— ${r.itens.length} encontrado(s)`;
    h3.appendChild(estado);
    r.el.appendChild(h3);

    if (r.estado !== 'ok' || !r.itens.length) return;
    const grade = document.createElement('div');
    grade.className = 'itens';
    r.itens.forEach((it) => {
      const card = document.createElement('div');
      card.className = 'item';
      const h4 = document.createElement('h4');
      h4.textContent = it.nome;
      const p = document.createElement('p');
      p.textContent = it.resumo || '';
      const dl = document.createElement('dl');
      campo(dl, 'Responsável', it.responsavel);
      campo(dl, 'Área', it.area);
      campo(dl, 'Website', it.website, true);
      campo(dl, 'Fonte', it.fonte, true);
      card.append(h4, p, dl);
      grade.appendChild(card);
    });
    r.el.appendChild(grade);
  }

  function atualizarResumos() {
    const total = resumos.reduce((n, r) => n + (r.itens ? r.itens.length : 0), 0);
    resumo.contador.textContent = total;
    resumo.exportar.disabled = !total && !respostasBrutas.length;
    atualizarBotoesPlanilha();
    renderizarLotes();
    try {
      const salvos = resumos.filter((r) => r.estado === 'ok').map((r) => ({ consulta: r.consulta, itens: r.itens }));
      localStorage.setItem(CHAVE_RESUMOS, JSON.stringify(salvos));
      localStorage.setItem(CHAVE_BRUTOS, JSON.stringify(respostasBrutas));
    } catch { /* armazenamento indisponível */ }
  }

  function obterResumo(consulta) {
    let r = resumos.find((x) => chave(x.consulta) === chave(consulta));
    if (!r) {
      // Usa o texto original da busca quando o Claude o devolve ligeiramente diferente.
      const original = buscas.find((b) => chave(b.consulta) === chave(consulta));
      r = { consulta: original ? original.consulta : consulta, estado: 'ok', itens: [] };
      resumos.push(r);
    }
    return r;
  }

  // ----- Prompt para o Claude -----

  function dataBr(iso) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }

  function montarPrompt(lote) {
    const preferencias = [];
    const { dataInicio, dataFim } = periodo();
    if (dataInicio && dataFim) preferencias.push(`páginas publicadas entre ${dataBr(dataInicio)} e ${dataBr(dataFim)}`);
    else if (dataInicio) preferencias.push(`páginas publicadas a partir de ${dataBr(dataInicio)}`);
    else if (dataFim) preferencias.push(`páginas publicadas até ${dataBr(dataFim)}`);

    return [
      'Pesquise na web cada uma das buscas abaixo, como se fossem feitas no Google.',
      'Para cada startup ou projeto de inovação citado nos resultados, descubra: nome, responsável (fundador, CEO ou coordenador), área de atuação, website oficial, um resumo de uma ou duas frases e a URL da fonte.',
      'Abra as páginas e faça buscas complementares quando precisar, principalmente para achar o responsável e o site oficial.',
      'Não invente nada: se não encontrar uma informação, deixe o campo vazio. Ignore listas genéricas, vagas e notícias sem uma startup ou projeto específico. Não repita a mesma startup dentro da mesma busca.',
      preferencias.length ? `Dê preferência a ${preferencias.join('; ')}.` : '',
      '',
      'Buscas:',
      ...lote.map((b, i) => `${i + 1}. ${b.consulta}`),
      '',
      'Responda SOMENTE com um bloco de código CSV, separado por ponto e vírgula, com este cabeçalho exato:',
      CABECALHO.join(';'),
      'Na coluna "consulta", repita exatamente o texto da busca. Coloque entre aspas duplas os campos que tiverem ponto e vírgula.',
    ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
  }

  function copiarTexto(texto) {
    // Cópia síncrona: precisa acontecer antes de abrir a nova aba.
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* sem suporte */ }
    area.remove();
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(texto).catch(() => {});
    return ok;
  }

  function lotesAtuais() {
    const tamanho = Number(resumo.tamanhoLote.value) || 8;
    const lotes = [];
    for (let i = 0; i < buscas.length; i += tamanho) lotes.push(buscas.slice(i, i + tamanho));
    return lotes;
  }

  function renderizarLotes() {
    resumo.lotes.innerHTML = '';
    const lotes = lotesAtuais();
    lotes.forEach((lote, n) => {
      const li = document.createElement('li');
      const inicio = n * (Number(resumo.tamanhoLote.value) || 8) + 1;
      const rotulo = document.createElement('span');
      rotulo.textContent = `Parte ${n + 1} de ${lotes.length} (buscas ${inicio}–${inicio + lote.length - 1})`;

      const abrir = document.createElement('button');
      abrir.type = 'button';
      abrir.textContent = 'Copiar e abrir o Claude';
      abrir.addEventListener('click', () => {
        const prompt = montarPrompt(lote);
        ultimoPromptCopiado = prompt;
        aguardandoResposta = true;
        copiarTexto(prompt);
        window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank', 'noopener');
      });

      const copiar = document.createElement('button');
      copiar.type = 'button';
      copiar.className = 'secundario';
      copiar.textContent = 'Só copiar';
      copiar.addEventListener('click', () => {
        ultimoPromptCopiado = montarPrompt(lote);
        aguardandoResposta = true;
        copiarTexto(ultimoPromptCopiado);
        copiar.textContent = 'Copiado!';
        setTimeout(() => { copiar.textContent = 'Só copiar'; }, 1500);
      });

      li.append(rotulo, abrir, copiar);
      const importadas = lote.filter((b) => resumos.some((r) => r.estado === 'ok' && chave(r.consulta) === chave(b.consulta))).length;
      if (importadas) {
        const feito = document.createElement('span');
        feito.className = 'feito';
        feito.textContent = importadas === lote.length ? '✓ importada' : `${importadas} de ${lote.length} importadas`;
        li.appendChild(feito);
      }
      resumo.lotes.appendChild(li);
    });
    if (!lotes.length) {
      const li = document.createElement('li');
      li.className = 'vazio';
      li.textContent = 'Gere as buscas acima para montar o texto para o Claude.';
      resumo.lotes.appendChild(li);
    }
  }

  // ----- Importação da resposta -----

  function lerCsv(texto, sep) {
    const linhas = [];
    let linha = [];
    let valor = '';
    let aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { valor += '"'; i++; }
        else if (c === '"') aspas = false;
        else valor += c;
      } else if (c === '"' && valor.trim() === '') { aspas = true; valor = ''; }
      else if (c === sep) { linha.push(valor); valor = ''; }
      else if (c === '\n') { linha.push(valor); linhas.push(linha); linha = []; valor = ''; }
      else if (c !== '\r') valor += c;
    }
    linha.push(valor);
    linhas.push(linha);
    return linhas;
  }

  function lerTabelaMarkdown(texto) {
    return texto.split('\n')
      .filter((l) => l.trim().startsWith('|') && !/^\s*\|?[\s:|-]+\|?\s*$/.test(l))
      .map((l) => l.trim().replace(/^\||\|$/g, '').split('|'));
  }

  const normalizar = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const VAZIOS = new Set(['', '-', '—', 'n/a', 'na', 'null', 'nao identificado', 'não identificado', 'nao encontrado', 'não encontrado']);
  const limpar = (v) => {
    const t = String(v ?? '').trim().replace(/^<(.*)>$/, '$1');
    return VAZIOS.has(t.toLowerCase()) ? null : t;
  };

  function interpretarResposta(texto) {
    const blocos = [...texto.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
    const conteudo = (blocos.length ? blocos.join('\n') : texto).replace(/\r/g, '');
    const linhasNaoVazias = conteudo.split('\n').filter((l) => l.trim());
    const ehMarkdown = linhasNaoVazias.filter((l) => l.trim().startsWith('|')).length > linhasNaoVazias.length / 2;
    const linhaCabecalho = linhasNaoVazias.find((l) => normalizar(l).includes('consulta') && normalizar(l).includes('nome')) || '';
    const sep = linhaCabecalho.includes(';') ? ';' : linhaCabecalho.includes('\t') ? '\t' : ',';
    const linhas = ehMarkdown ? lerTabelaMarkdown(conteudo) : lerCsv(conteudo, sep);

    let colunas = null;
    const itens = [];
    for (const linha of linhas) {
      const nomes = linha.map(normalizar);
      if (nomes.includes('consulta') && nomes.includes('nome')) {
        colunas = Object.fromEntries(CABECALHO.map((c) => [c, nomes.indexOf(c)]));
        continue;
      }
      if (!colunas) continue;
      const get = (c) => (colunas[c] >= 0 ? limpar(linha[colunas[c]]) : null);
      const nome = get('nome');
      if (!nome) continue;
      itens.push({
        consulta: get('consulta') || '(sem consulta)',
        nome,
        responsavel: get('responsavel'),
        area: get('area'),
        website: get('website'),
        resumo: get('resumo'),
        fonte: get('fonte'),
      });
    }
    return { itens, achouCabecalho: Boolean(colunas) };
  }

  // Guarda o texto como o Claude devolveu, para a exportação levar tudo
  // (inclusive o que o parser não reconhecer). Textos iguais não se repetem.
  function guardarBruto(texto) {
    const t = String(texto || '').trim();
    if (!t || respostasBrutas.some((b) => b.texto === t)) return;
    respostasBrutas.push({ quando: new Date().toISOString(), texto: t });
  }

  function importarResposta() {
    const texto = resumo.resposta.value;
    ultimoTextoImportado = texto;
    guardarBruto(texto);
    const { itens, achouCabecalho } = interpretarResposta(texto);
    if (!achouCabecalho) {
      atualizarResumos();
      resumo.statusImportacao.textContent = `Não encontrei a tabela. A resposta precisa ter o cabeçalho: ${CABECALHO.join(';')} (a resposta ficou guardada e sai na exportação).`;
      return;
    }
    let novos = 0;
    const tocados = new Set();
    itens.forEach(({ consulta, ...item }) => {
      const r = obterResumo(consulta);
      r.estado = 'ok';
      tocados.add(r);
      if (!r.itens.some((x) => chave(x.nome) === chave(item.nome))) {
        r.itens.push(item);
        novos++;
      }
    });
    tocados.forEach(renderizarBloco);
    atualizarResumos();
    resumo.statusImportacao.textContent = `${novos} startup(s)/projeto(s) importado(s)` +
      (itens.length > novos ? ` (${itens.length - novos} repetido(s) ignorado(s))` : '') + '.';
  }

  // ----- Importação pela área de transferência -----
  // O navegador pede permissão na primeira vez para a página ler o que foi copiado.

  async function lerAreaTransferencia() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return null;
    try { return await navigator.clipboard.readText(); } catch { return null; }
  }

  async function colarEImportar() {
    const texto = await lerAreaTransferencia();
    if (texto === null) {
      resumo.statusImportacao.textContent = 'O navegador não deixou ler a área de transferência. Cole a resposta no campo com Ctrl+V e clique em "Importar texto do campo".';
      resumo.resposta.focus();
      return;
    }
    if (texto === ultimoPromptCopiado) {
      resumo.statusImportacao.textContent = 'A área de transferência ainda tem o texto enviado ao Claude. Copie a resposta dele primeiro.';
      return;
    }
    resumo.resposta.value = texto;
    importarResposta();
  }

  async function importarAoVoltar() {
    if (!resumo.autoImportar.checked || !aguardandoResposta || document.visibilityState !== 'visible') return;
    const texto = await lerAreaTransferencia();
    if (!texto || texto === ultimoPromptCopiado || texto === ultimoTextoImportado) return;
    const { itens, achouCabecalho } = interpretarResposta(texto);
    // Resposta com a tabela esperada (mesmo sem nenhuma linha aproveitável) é
    // importada: o texto bruto fica guardado para a exportação.
    if (!itens.length && !achouCabecalho) return;
    resumo.resposta.value = texto;
    importarResposta();
  }

  // ----- Modo automático (servidor local, opcional) -----

  async function verificarServidor() {
    if (location.protocol === 'file:') return;
    try {
      const { busca, ia } = await (await fetch('/api/status')).json();
      resumo.modoAuto.hidden = false;
      const desc = (s) => `${s.provedor}${s.ok ? ' ✓' : ` ✗ (${s.detalhe})`}`;
      resumo.status.textContent = `Busca: ${desc(busca)} · IA: ${desc(ia)}`;
      if (!busca.ok || !ia.ok) {
        resumo.status.textContent += ' — corrija o item marcado com ✗ e recarregue a página.';
      }
    } catch { /* sem servidor: só o modo com o Claude no chat */ }
  }

  // Teto de tempo por busca: sem isso, uma requisição que nunca responde deixa
  // o botão preso em "Resumindo…" e ele deixa de responder aos cliques.
  const TEMPO_LIMITE = 5 * 60 * 1000;

  async function processar(r) {
    r.estado = 'carregando';
    renderizarBloco(r);
    try {
      const resp = await fetch('/api/resumir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consulta: r.consulta,
          maxResultados: Number(resumo.maxResultados.value),
          filtros: periodo(),
        }),
        signal: AbortSignal.timeout(TEMPO_LIMITE),
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || `HTTP ${resp.status}`);
      r.itens = dados.itens;
      r.estado = 'ok';
    } catch (e) {
      r.estado = 'erro';
      r.erro = e.name === 'TimeoutError' ? 'passou de 5 minutos sem resposta'
        : e.message === 'Failed to fetch' ? 'sem resposta do servidor (ele ainda está rodando?)'
          : e.message;
    }
    renderizarBloco(r);
    atualizarResumos();
  }

  async function resumirTodas() {
    if (resumindo) return;
    if (!buscas.length) {
      resumo.status.textContent = 'Nada para resumir: adicione termos na seção 1 para gerar as buscas da seção 4.';
      return;
    }
    if (buscas.length > 10 && !confirm(`Gerar resumos para ${buscas.length} buscas?`)) {
      resumo.status.textContent = 'Resumos cancelados.';
      return;
    }
    resumindo = true;
    resumo.botao.disabled = true;
    resumo.botao.textContent = 'Resumindo…';
    const fila = buscas.map((b) => {
      const r = obterResumo(b.consulta);
      r.estado = 'aguardando';
      renderizarBloco(r);
      return r;
    });
    let feitos = 0;
    const trabalhar = async () => {
      while (fila.length) {
        await processar(fila.shift());
        feitos++;
        resumo.botao.textContent = `Resumindo ${feitos}/${buscas.length}…`;
      }
    };
    try {
      await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhar));
    } finally {
      // O botão volta ao normal mesmo se alguma busca falhar no meio.
      resumindo = false;
      resumo.botao.disabled = false;
      resumo.botao.textContent = 'Buscar e resumir';
    }
  }

  // ----- Exportar / limpar / carregar -----

  // Sai tudo num arquivo só: a tabela dos itens reconhecidos e, no fim, as
  // respostas originais do Claude — cada uma numa célula, mesmo que o parser
  // não tenha conseguido aproveitar nada dela.
  function exportarResumos() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const linhas = [CABECALHO];
    resumos.forEach((r) => (r.itens || []).forEach((it) => {
      linhas.push([r.consulta, it.nome, it.responsavel, it.area, it.website, it.resumo, it.fonte]);
    }));
    if (respostasBrutas.length) {
      linhas.push([], ['resposta_bruta_do_claude']);
      respostasBrutas.forEach((b) => linhas.push([b.texto]));
    }
    const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'resumos-startups.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Planilha .xlsx (SheetJS) com as buscas e os resumos em abas separadas.
  function exportarPlanilha() {
    if (typeof XLSX === 'undefined') {
      alert('A biblioteca de planilhas (SheetJS) não carregou. Verifique a conexão com a internet e recarregue a página.');
      return;
    }
    const linhasBuscas = [['consulta', 'url'], ...buscas.map((b) => [b.consulta, b.url])];
    const linhasResumos = [CABECALHO];
    resumos.forEach((r) => (r.itens || []).forEach((it) => {
      linhasResumos.push([r.consulta, it.nome, it.responsavel, it.area, it.website, it.resumo, it.fonte]);
    }));

    const livros = XLSX.utils.book_new();
    const abaBuscas = XLSX.utils.aoa_to_sheet(linhasBuscas);
    abaBuscas['!cols'] = [{ wch: 52 }, { wch: 90 }];
    const abaResumos = XLSX.utils.aoa_to_sheet(linhasResumos);
    abaResumos['!cols'] = [{ wch: 38 }, { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 34 }, { wch: 60 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(livros, abaBuscas, 'Buscas');
    XLSX.utils.book_append_sheet(livros, abaResumos, 'Resumos');
    if (respostasBrutas.length) {
      const linhasBrutas = [['quando', 'resposta_bruta_do_claude'], ...respostasBrutas.map((b) => [b.quando, b.texto])];
      const abaBrutas = XLSX.utils.aoa_to_sheet(linhasBrutas);
      abaBrutas['!cols'] = [{ wch: 22 }, { wch: 120 }];
      XLSX.utils.book_append_sheet(livros, abaBrutas, 'Respostas do Claude');
    }
    XLSX.writeFile(livros, `mapa-startups-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // Zera a seção 5 (resumos, partes montadas para o Claude e campos de importação)
  // e o que estava salvo no navegador. A seção 4 é refeita logo em seguida com as
  // buscas novas.
  function limparSecoes() {
    resumos = [];
    respostasBrutas = [];
    resumo.lista.innerHTML = '';
    resumo.resposta.value = '';
    resumo.statusImportacao.textContent = '';
    ultimoPromptCopiado = '';
    ultimoTextoImportado = '';
    aguardandoResposta = false;
    atualizarResumos();
  }

  function limparResumos() {
    if ((resumos.length || respostasBrutas.length) && !confirm('Apagar todos os resumos e as respostas guardadas?')) return;
    limparSecoes();
  }

  function carregarResumos() {
    try {
      const salvos = JSON.parse(localStorage.getItem(CHAVE_RESUMOS) || '[]');
      resumos = salvos.map((r) => ({ consulta: r.consulta, itens: r.itens || [], estado: 'ok' }));
    } catch { resumos = []; }
    try {
      const brutos = JSON.parse(localStorage.getItem(CHAVE_BRUTOS) || '[]');
      respostasBrutas = Array.isArray(brutos) ? brutos.filter((b) => b && b.texto) : [];
    } catch { respostasBrutas = []; }
    resumos.forEach(renderizarBloco);
    atualizarResumos();
  }

  resumo.importar.addEventListener('click', importarResposta);
  resumo.colarImportar.addEventListener('click', colarEImportar);
  window.addEventListener('focus', importarAoVoltar);
  document.addEventListener('visibilitychange', importarAoVoltar);
  resumo.exportar.addEventListener('click', exportarResumos);
  resumo.limpar.addEventListener('click', limparResumos);
  resumo.tamanhoLote.addEventListener('change', renderizarLotes);
  resumo.botao.addEventListener('click', resumirTodas);
  carregarResumos();
  verificarServidor();

  // ---------- Persistência ----------

  const camposPersistidos = ['dataInicio', 'dataFim', 'sites', 'k', 'regiao'];

  function salvarEstado() {
    try {
      const estado = {
        termos,
        aspas: el.aspas.checked,
        modo: document.querySelector('input[name=modo]:checked').value,
      };
      camposPersistidos.forEach((c) => { estado[c] = el[c].value; });
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(estado));
    } catch { /* armazenamento indisponível */ }
  }

  function carregarEstado() {
    try {
      const estado = JSON.parse(localStorage.getItem(CHAVE_STORAGE) || 'null');
      if (!estado) return;
      termos = Array.isArray(estado.termos) ? estado.termos : [];
      el.aspas.checked = estado.aspas !== false;
      const radio = document.querySelector(`input[name=modo][value="${estado.modo}"]`);
      if (radio) radio.checked = true;
      renderizarOpcoesK();
      camposPersistidos.forEach((c) => { if (estado[c] != null) el[c].value = estado[c]; });
    } catch { /* ignora estado inválido */ }
  }

  // ---------- Eventos ----------

  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      adicionarTermos(el.input.value);
      el.input.value = '';
    } else if (e.key === 'Backspace' && !el.input.value && termos.length) {
      removerTermo(termos.length - 1);
    }
  });
  el.input.addEventListener('paste', (e) => {
    const texto = (e.clipboardData || window.clipboardData).getData('text');
    if (/[,;\n]/.test(texto)) {
      e.preventDefault();
      adicionarTermos(texto);
    }
  });
  el.input.addEventListener('blur', () => {
    if (el.input.value.trim()) { adicionarTermos(el.input.value); el.input.value = ''; }
  });
  el.tags.addEventListener('click', (e) => { if (e.target === el.tags) el.input.focus(); });
  el.limpar.addEventListener('click', () => { termos = []; atualizar(); });

  document.querySelectorAll('input[name=modo]').forEach((r) => r.addEventListener('change', atualizar));
  el.k.addEventListener('change', () => {
    document.querySelector('input[name=modo][value=k]').checked = true;
    atualizar();
  });
  [el.aspas, el.dataInicio, el.dataFim, el.sites, el.regiao]
    .forEach((c) => c.addEventListener('input', () => { renderizarResultados(); salvarEstado(); }));
  // Impede escolher data final anterior à inicial (e vice-versa): se ficarem
  // invertidas, troca as duas de lugar ao sair do campo.
  // Não dá para usar os atributos min/max do input: alterá-los durante a
  // digitação (o Chrome dispara change no meio dela) apaga a data digitada.
  function ordenarDatas() {
    const { dataInicio, dataFim } = periodo();
    if (!dataInicio || !dataFim || dataInicio <= dataFim) return;
    el.dataInicio.value = dataFim;
    el.dataFim.value = dataInicio;
    renderizarResultados();
    salvarEstado();
  }
  [el.dataInicio, el.dataFim].forEach((c) => c.addEventListener('blur', ordenarDatas));

  el.abrirTodas.addEventListener('click', abrirTodas);
  el.copiar.addEventListener('click', copiarLinks);
  el.exportar.addEventListener('click', exportarCsv);
  el.exportarXlsx.addEventListener('click', exportarPlanilha);

  carregarEstado();
  ordenarDatas();
  atualizar();
})();
