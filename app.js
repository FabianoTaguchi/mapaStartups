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
    fixo: $('#fixo'),
    excluir: $('#excluir'),
    site: $('#site'),
    filetype: $('#filetype'),
    periodo: $('#periodo'),
    idioma: $('#idioma'),
    pais: $('#pais'),
    onde: $('#onde'),
    contador: $('#contador'),
    aviso: $('#aviso'),
    resultados: $('#resultados'),
    vazio: $('#vazio'),
    abrirTodas: $('#abrir-todas'),
    copiar: $('#copiar'),
    exportar: $('#exportar'),
  };

  let termos = [];
  let buscas = [];

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
    if (el.onde.value) s = `${el.onde.value}:${s}`;
    return s;
  }

  function montarConsulta(grupo) {
    const partes = [];
    const formatados = grupo.termos.map(formatarTermo);
    if (grupo.op === 'OU' && formatados.length > 1) {
      partes.push(`(${formatados.join(' OR ')})`);
    } else {
      partes.push(...formatados);
    }

    const fixo = el.fixo.value.trim();
    if (fixo) partes.unshift(el.aspas.checked && /\s/.test(fixo) ? `"${fixo}"` : fixo);

    el.excluir.value.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => {
      partes.push(/\s/.test(t) ? `-"${t}"` : `-${t}`);
    });

    const site = el.site.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (site) partes.push(`site:${site}`);
    if (el.filetype.value) partes.push(`filetype:${el.filetype.value}`);

    return partes.join(' ');
  }

  function montarUrl(consulta) {
    const p = new URLSearchParams({ q: consulta });
    if (el.periodo.value) p.set('tbs', el.periodo.value);
    if (el.idioma.value) p.set('lr', el.idioma.value);
    if (el.pais.value) p.set('cr', el.pais.value);
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

    el.aviso.hidden = !excedeu;
    if (excedeu) {
      el.aviso.textContent = `Muitas combinações: exibindo apenas as primeiras ${LIMITE_BUSCAS}. Reduza o número de termos ou escolha outro modo.`;
    }

    el.contador.textContent = buscas.length;
    el.vazio.hidden = buscas.length > 0;
    [el.abrirTodas, el.copiar, el.exportar].forEach((b) => { b.disabled = !buscas.length; });

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

  // ---------- Resumos (requer o servidor: npm start) ----------

  const CONCORRENCIA = 2;
  const resumo = {
    botao: $('#resumir'),
    exportar: $('#exportar-resumos'),
    maxResultados: $('#max-resultados'),
    status: $('#status-servidor'),
    lista: $('#resumos'),
    contador: $('#contador-resumos'),
  };
  let resumos = [];
  let resumindo = false;

  async function verificarServidor() {
    if (location.protocol === 'file:') {
      resumo.botao.disabled = true;
      resumo.status.textContent = 'Para gerar resumos, rode "npm start" e abra http://localhost:3000.';
      return;
    }
    try {
      const { busca, ia } = await (await fetch('/api/status')).json();
      const desc = (s) => `${s.provedor}${s.ok ? ' ✓' : ` ✗ (${s.detalhe})`}`;
      resumo.status.textContent = `Busca: ${desc(busca)} · IA: ${desc(ia)}`;
      if (!busca.ok || !ia.ok) {
        resumo.status.textContent += ' — corrija o item marcado com ✗ e recarregue a página.';
      }
    } catch {
      resumo.botao.disabled = true;
      resumo.status.textContent = 'Servidor indisponível. Rode "npm start" na pasta do projeto.';
    }
  }

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
      p.textContent = it.resumo;
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

  function atualizarContadorResumos() {
    const total = resumos.reduce((n, r) => n + (r.itens ? r.itens.length : 0), 0);
    resumo.contador.textContent = total;
    resumo.exportar.disabled = !total;
  }

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
          filtros: { periodo: el.periodo.value, idioma: el.idioma.value, pais: el.pais.value },
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || `HTTP ${resp.status}`);
      r.itens = dados.itens;
      r.estado = 'ok';
    } catch (e) {
      r.estado = 'erro';
      r.erro = e.message;
    }
    renderizarBloco(r);
    atualizarContadorResumos();
  }

  async function resumirTodas() {
    if (resumindo || !buscas.length) return;
    if (buscas.length > 10 && !confirm(`Gerar resumos para ${buscas.length} buscas? Cada busca consome créditos das APIs.`)) return;
    resumindo = true;
    resumo.botao.disabled = true;
    resumo.botao.textContent = 'Resumindo…';
    resumo.lista.innerHTML = '';
    resumos = buscas.map((b) => {
      const div = document.createElement('div');
      div.className = 'bloco-resumo';
      resumo.lista.appendChild(div);
      const r = { consulta: b.consulta, estado: 'aguardando', itens: [], el: div };
      renderizarBloco(r);
      return r;
    });
    atualizarContadorResumos();

    const fila = resumos.slice();
    await Promise.all(Array.from({ length: CONCORRENCIA }, async () => {
      while (fila.length) await processar(fila.shift());
    }));

    resumindo = false;
    resumo.botao.disabled = false;
    resumo.botao.textContent = 'Buscar e resumir';
  }

  function exportarResumos() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const linhas = [['consulta', 'nome', 'responsavel', 'area', 'website', 'resumo', 'fonte']];
    resumos.forEach((r) => (r.itens || []).forEach((it) => {
      linhas.push([r.consulta, it.nome, it.responsavel, it.area, it.website, it.resumo, it.fonte]);
    }));
    const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'resumos-startups.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  resumo.botao.addEventListener('click', resumirTodas);
  resumo.exportar.addEventListener('click', exportarResumos);
  verificarServidor();

  // ---------- Persistência ----------

  const camposPersistidos = ['fixo', 'excluir', 'site', 'filetype', 'periodo', 'idioma', 'pais', 'onde', 'k'];

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
  [el.aspas, el.fixo, el.excluir, el.site, el.filetype, el.periodo, el.idioma, el.pais, el.onde]
    .forEach((c) => c.addEventListener('input', () => { renderizarResultados(); salvarEstado(); }));

  el.abrirTodas.addEventListener('click', abrirTodas);
  el.copiar.addEventListener('click', copiarLinks);
  el.exportar.addEventListener('click', exportarCsv);

  carregarEstado();
  atualizar();
})();
