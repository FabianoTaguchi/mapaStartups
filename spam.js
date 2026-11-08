// Página dos resultados marcados com "Ignorar": lista o spam e permite tirar
// um item da lista, para ele voltar a aparecer nas buscas.
(() => {
  'use strict';

  const alvo = document.querySelector('#lista');
  const contador = document.querySelector('#contador');

  function renderizar() {
    const itens = window.Mapa.lerSpam();
    contador.textContent = itens.length;
    window.Mapa.montarLista(alvo, itens, {
      vazio: 'Nenhum resultado marcado como spam. Na busca, marque “Ignorar” para tirar um resultado das próximas buscas.',
      rotuloAcao: 'Remover do spam',
      tom: 'tom-vermelho',
      simbolo: '✕',
      aoAgir: (item) => {
        window.Mapa.removerDoSpam(item);
        renderizar();
      },
    });
  }

  renderizar();
})();
