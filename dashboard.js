// Dashboard: transforma os resultados marcados com "Selecionar" na busca em
// indicadores e gráficos.
(() => {
  'use strict';

  const el = {
    vazio: document.querySelector('#vazio'),
    contador: document.querySelector('#contador'),
    indicadores: document.querySelector('#indicadores'),
    pizzaArea: document.querySelector('#pizza-area'),
    cardsArea: document.querySelector('#cards-area'),
    graficoResponsavel: document.querySelector('#grafico-responsavel'),
    secoes: ['#secao-indicadores', '#secao-graficos']
      .map((seletor) => document.querySelector(seletor)),
  };

  let itens = [];

  // O site só conta como identificado se for um endereço http(s) navegável: é a
  // mesma regra usada para transformar o campo em link.
  const temSite = (it) => /^https?:\/\//i.test(String(it.website || ''));

  const plural = (n, singular, muitos) => (n === 1 ? singular : muitos);

  // Chave usada para agrupar: acentos, maiúsculas e pontuação não separam grupos
  // que são o mesmo. Campo vazio vira a chave '' (o grupo "Não identificado").
  const chaveDe = (valor) => {
    const bruto = String(valor ?? '').trim();
    return bruto ? window.Mapa.normalizar(bruto) : '';
  };

  // Mesmo cuidado do resto do projeto: só vira link o que é http(s).
  const ehLink = (url) => /^https?:\/\//i.test(String(url || ''));

  // ----- Cálculos -----

  // Agrupa os itens por um campo e devolve [ [rótulo, quantidade], ... ] do maior
  // para o menor.
  function agrupar(campo) {
    const grupos = new Map();
    itens.forEach((it) => {
      const bruto = String(it[campo] ?? '').trim();
      const chave = chaveDe(bruto);
      const grupo = grupos.get(chave);
      if (grupo) grupo.quantidade++;
      else grupos.set(chave, { rotulo: bruto || 'Não identificado', quantidade: 1 });
    });
    return [...grupos.values()]
      .sort((a, b) => b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
      .map((g) => [g.rotulo, g.quantidade]);
  }

  function indicadores() {
    const consultas = new Set(itens.map((it) => String(it.consulta || '').trim()).filter(Boolean));
    return [
      [itens.length, plural(itens.length, 'selecionado', 'selecionados')],
      [itens.filter(temSite).length, 'com site identificado'],
      [itens.filter((it) => !it.responsavel).length, 'sem responsável identificado'],
      [consultas.size, plural(consultas.size, 'consulta de origem', 'consultas de origem')],
    ];
  }

  // ----- Desenho -----

  function desenharIndicadores() {
    el.indicadores.innerHTML = '';
    indicadores().forEach(([valor, rotulo]) => {
      const cartao = document.createElement('div');
      cartao.className = 'indicador';
      const numero = document.createElement('span');
      numero.className = 'indicador-valor';
      numero.textContent = String(valor);
      const texto = document.createElement('span');
      texto.className = 'indicador-rotulo';
      texto.textContent = rotulo;
      cartao.append(numero, texto);
      el.indicadores.appendChild(cartao);
    });
  }

  // Cor da fatia: o ângulo áureo espalha os tons pela roda de cores, evitando
  // que áreas vizinhas fiquem com cores parecidas.
  const corDaFatia = (i) => `hsl(${Math.round((i * 137.508) % 360)} 62% 52%)`;

  const totalDe = (linhas) => linhas.reduce((soma, [, quantidade]) => soma + quantidade, 0);

  // Pizza em conic-gradient: cada área vira uma fatia proporcional. Os números
  // ficam na legenda, com a quantidade e a porcentagem de cada área.
  function desenharPizza(alvo, linhas) {
    alvo.innerHTML = '';
    if (!linhas.length) {
      const p = document.createElement('p');
      p.className = 'vazio';
      p.textContent = 'Sem dados para este gráfico.';
      alvo.appendChild(p);
      return;
    }
    const total = totalDe(linhas);
    let acumulado = 0;
    const fatias = linhas.map(([, quantidade], i) => {
      const inicio = (acumulado / total) * 100;
      acumulado += quantidade;
      return `${corDaFatia(i)} ${inicio}% ${(acumulado / total) * 100}%`;
    });

    const disco = document.createElement('div');
    disco.className = 'pizza-disco';
    disco.style.background = `conic-gradient(${fatias.join(', ')})`;
    disco.setAttribute('role', 'img');
    disco.setAttribute('aria-label',
      `Distribuição por área de atuação: ${linhas.map(([rotulo, q]) => `${rotulo}, ${q}`).join('; ')}`);

    const legenda = document.createElement('ul');
    legenda.className = 'pizza-legenda';
    linhas.forEach(([rotulo, quantidade], i) => {
      const li = document.createElement('li');
      const cor = document.createElement('span');
      cor.className = 'pizza-cor';
      cor.style.background = corDaFatia(i);
      const nome = document.createElement('span');
      nome.className = 'pizza-nome';
      nome.textContent = rotulo;
      nome.title = rotulo;
      const valor = document.createElement('span');
      valor.className = 'pizza-valor';
      valor.textContent = `${quantidade} · ${Math.round((quantidade / total) * 100)}%`;
      li.append(cor, nome, valor);
      legenda.appendChild(li);
    });

    alvo.append(disco, legenda);
  }

  // Um cartão por área, na mesma ordem e com a mesma cor das fatias da pizza.
  function desenharCards(alvo, linhas) {
    alvo.innerHTML = '';
    const total = totalDe(linhas);
    linhas.forEach(([rotulo, quantidade], i) => {
      const cartao = document.createElement('div');
      cartao.className = 'card-area';

      const topo = document.createElement('div');
      topo.className = 'card-area-topo';
      const cor = document.createElement('span');
      cor.className = 'card-area-cor';
      cor.style.background = corDaFatia(i);
      const nome = document.createElement('span');
      nome.className = 'card-area-nome';
      nome.textContent = rotulo;
      nome.title = rotulo;
      topo.append(cor, nome);

      const valor = document.createElement('span');
      valor.className = 'card-area-valor';
      valor.textContent = String(quantidade);

      const fatia = document.createElement('span');
      fatia.className = 'card-area-fatia';
      fatia.textContent = `${Math.round((quantidade / total) * 100)}% do total`;

      cartao.append(topo, valor, fatia);
      alvo.appendChild(cartao);
    });
  }

  // Itens de um grupo, para montar a lista de sites do responsável clicado.
  function itensDoGrupo(campo, rotulo) {
    const alvo = chaveDe(rotulo === 'Não identificado' ? '' : rotulo);
    return itens.filter((it) => chaveDe(it[campo]) === alvo);
  }

  function linkExterno(url, texto, classe) {
    if (!ehLink(url)) return null;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = texto;
    if (classe) a.className = classe;
    return a;
  }

  // Barras por responsável. Clicar no nome abre a lista das startups daquele
  // responsável, com link para o site de cada uma e para a página consultada.
  // Quem não tem nenhum desses links fica como texto simples, sem clique.
  function desenharResponsaveis(alvo, linhas) {
    alvo.innerHTML = '';
    if (!linhas.length) {
      const p = document.createElement('p');
      p.className = 'vazio';
      p.textContent = 'Sem dados para este gráfico.';
      alvo.appendChild(p);
      return;
    }
    const maior = linhas[0][1];
    linhas.forEach(([rotulo, quantidade]) => {
      const doGrupo = itensDoGrupo('responsavel', rotulo);
      const comLink = doGrupo.some((it) => ehLink(it.website) || ehLink(it.fonte));

      const grupo = document.createElement('div');
      grupo.className = 'barra-grupo';

      const linha = document.createElement('div');
      linha.className = 'barra-linha';
      let nome;
      let seta = null;
      if (comLink) {
        nome = document.createElement('button');
        nome.type = 'button';
        nome.className = 'barra-rotulo';
        nome.title = `Ver as startups de ${rotulo}`;
        const texto = document.createElement('span');
        texto.className = 'barra-nome';
        texto.textContent = rotulo;
        seta = document.createElement('span');
        seta.className = 'seta';
        seta.textContent = '▸';
        nome.append(texto, seta);
      } else {
        nome = document.createElement('span');
        nome.className = 'barra-rotulo';
        nome.textContent = rotulo;
        nome.title = rotulo;
      }

      const trilha = document.createElement('span');
      trilha.className = 'barra-trilha';
      const barra = document.createElement('span');
      barra.className = 'barra-preenchida';
      barra.style.width = `${Math.round((quantidade / maior) * 100)}%`;
      trilha.appendChild(barra);

      const valor = document.createElement('span');
      valor.className = 'barra-valor';
      valor.textContent = String(quantidade);

      linha.append(nome, trilha, valor);
      grupo.appendChild(linha);

      if (comLink) {
        const detalhe = document.createElement('div');
        detalhe.className = 'detalhe';
        detalhe.hidden = true;
        const lista = document.createElement('ul');
        lista.className = 'detalhe-lista';
        doGrupo.forEach((it) => {
          const li = document.createElement('li');
          const site = linkExterno(it.website, it.nome || it.website);
          if (site) li.appendChild(site);
          else {
            const semSite = document.createElement('span');
            semSite.textContent = it.nome || 'Sem nome';
            li.appendChild(semSite);
          }
          if (it.area) {
            const area = document.createElement('span');
            area.className = 'detalhe-area';
            area.textContent = it.area;
            li.appendChild(area);
          }
          const fonte = linkExterno(it.fonte, 'página consultada', 'detalhe-fonte');
          if (fonte) li.appendChild(fonte);
          lista.appendChild(li);
        });
        detalhe.appendChild(lista);
        grupo.appendChild(detalhe);

        nome.setAttribute('aria-expanded', 'false');
        nome.addEventListener('click', () => {
          detalhe.hidden = !detalhe.hidden;
          nome.setAttribute('aria-expanded', String(!detalhe.hidden));
          seta.textContent = detalhe.hidden ? '▸' : '▾';
        });
      }

      alvo.appendChild(grupo);
    });
  }

  function desenhar() {
    itens = window.Mapa.lerSelecionados();
    const vazio = !itens.length;
    el.vazio.hidden = !vazio;
    el.secoes.forEach((secao) => { secao.hidden = vazio; });
    if (vazio) return;
    el.contador.textContent = itens.length;
    desenharIndicadores();
    const areas = agrupar('area');
    desenharPizza(el.pizzaArea, areas);
    desenharCards(el.cardsArea, areas);
    desenharResponsaveis(el.graficoResponsavel, agrupar('responsavel'));
  }

  // Ao voltar para esta aba a lista é relida: ela pode ter mudado na busca.
  window.addEventListener('focus', desenhar);

  desenhar();
})();
