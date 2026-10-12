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
