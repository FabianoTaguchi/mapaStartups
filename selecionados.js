// Página dos resultados marcados com "Selecionar": a base do dashboard.
// Permite tirar um item da seleção, devolvendo-o às buscas, e exportar a lista
// em .json ou .csv.
(() => {
  'use strict';

  const alvo = document.querySelector('#lista');
  const contador = document.querySelector('#contador');
  const botaoJson = document.querySelector('#exportar-json');
  const botaoCsv = document.querySelector('#exportar-csv');

  // As mesmas colunas usadas na exportação da busca e na planilha do dashboard:
  // um item exportado aqui pode ser comparado com os outros arquivos.
  const CABECALHO = ['consulta', 'nome', 'responsavel', 'area', 'website', 'resumo', 'fonte'];
  const campos = (it) => [
    it.consulta || '', it.nome || '', it.responsavel || '', it.area || '',
    it.website || '', it.resumo || '', it.fonte || '',
  ];

  function baixar(conteudo, tipo, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const nomeArquivo = () => `selecionados-${new Date().toISOString().slice(0, 10)}`;

  // CSV no mesmo formato do resto do projeto: ponto e vírgula separando as
  // colunas (o Excel em português abre assim) e BOM para os acentos.
  function exportarCsv() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const linhas = [CABECALHO, ...window.Mapa.lerSelecionados().map(campos)];
    const csv = '\ufeff' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
    baixar(csv, 'text/csv;charset=utf-8', `${nomeArquivo()}.csv`);
  }

  function exportarJson() {
    const dados = window.Mapa.lerSelecionados().map((it) => Object.fromEntries(
      CABECALHO.map((coluna, i) => [coluna, campos(it)[i]]),
    ));
    baixar(JSON.stringify(dados, null, 2), 'application/json', `${nomeArquivo()}.json`);
  }

  function renderizar() {
    const itens = window.Mapa.lerSelecionados();
    contador.textContent = itens.length;
    botaoJson.disabled = !itens.length;
    botaoCsv.disabled = !itens.length;
    window.Mapa.montarLista(alvo, itens, {
      vazio: 'Nenhum resultado selecionado ainda. Na busca, marque “Selecionar” em um resultado para trazê-lo para cá.',
      rotuloAcao: 'Remover da seleção',
      tom: 'tom-verde',
      simbolo: '✓',
      aoAgir: (item) => {
        window.Mapa.removerDosSelecionados(item);
        renderizar();
      },
    });
  }

  botaoJson.addEventListener('click', exportarJson);
  botaoCsv.addEventListener('click', exportarCsv);
  renderizar();
})();
