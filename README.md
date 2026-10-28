# Mapa Startups – Busca por termos

Interface web para montar buscas a partir de vários termos, combinados ou não, e gerar um mini-resumo de cada startup/projeto encontrado (nome, responsável, área de atuação e website).

## Configuração rápida (Windows)

1. Instale o [Node.js](https://nodejs.org) (versão LTS).
2. Dê dois cliques em **`configurar.bat`**. O assistente instala as dependências, pergunta como você quer gerar os resumos (Claude no chat, API do Claude ou gratuito com SearXNG + Ollama), pede e testa as chaves quando necessário, sobe o SearXNG/Ollama e salva tudo no `.env`.
3. Depois, para usar, dê dois cliques em **`iniciar.bat`**: ele abre a página no navegador.

Em outros sistemas: `npm run configurar` e `npm start`.

## Como usar (padrão: Claude no chat)

Não precisa instalar nada: abra `index.html` no navegador. Os resumos são feitos pelo Claude no chat (claude.ai), usando a sua assinatura.

1. **Termos** – digite e pressione Enter, ou cole vários separados por vírgula/linha.
2. **Como combinar**
   - *Todos juntos (E)* – uma busca com todos os termos.
   - *Qualquer um (OU)* – uma busca com os termos ligados por `OR`.
   - *Cada termo separado* – uma busca por termo.
   - *Combinações de K termos* – todas as combinações de tamanho K.
   - *Todas as combinações* – todos os subconjuntos (limitado a 200 buscas).
3. **Filtros** – termo fixo, exclusões (`-termo`), `site:`, `filetype:`, período, idioma, país e `intitle:`/`inurl:`/`intext:`.
4. **Resultados** – abra cada busca no Google, abra todas em abas, copie os links ou exporte em CSV.
5. **Resumos com o Claude**
   1. As buscas são divididas em partes (8 por mensagem, ajustável). Em cada parte, clique em *Copiar e abrir o Claude*: o texto com as instruções e as buscas é copiado e o claude.ai abre numa nova aba. Se o texto não vier preenchido, cole com Ctrl+V. Deixe a pesquisa na web ativada.
   2. Quando o Claude terminar, clique no botão *Copiar* embaixo da resposta dele (uma tabela CSV com consulta, nome, responsável, área, website, resumo e fonte).
   3. Volte para a aba do Mapa Startups: a resposta é importada sozinha (o navegador pede permissão para ler a área de transferência na primeira vez). Se não for, clique em *Colar e importar*, ou cole no campo e clique em *Importar texto do campo*. Os resumos aparecem em cartões, ficam salvos no navegador e podem ser exportados em CSV.

O estado (termos, filtros e resumos importados) fica salvo no `localStorage` do navegador.

## Modo automático (opcional, servidor local)

O projeto também tem um servidor (`npm start`) que faz as buscas e os resumos sozinho. Quando ele está rodando e a página é aberta por http://localhost:3000, aparece a opção *Modo automático* na seção 5. Os provedores são escolhidos no `.env`:

### Gratuito: SearXNG + Ollama

Tudo roda no seu computador, sem chaves de API e sem custo.

- **SearXNG** – metabuscador de código aberto que junta resultados do Google, Bing, DuckDuckGo e outros.
- **Ollama** – roda um modelo de IA localmente para ler os resultados e extrair os dados.

#### Pré-requisitos

- [Node.js](https://nodejs.org) 20 ou superior
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (para o SearXNG)
- [Ollama](https://ollama.com/download)
- Computador com pelo menos 16 GB de RAM (com placa de vídeo fica bem mais rápido)

#### Passo a passo

```bash
# 1. Busca: sobe o SearXNG em http://localhost:8080
docker compose up -d

# 2. IA: baixa o modelo (cerca de 4,7 GB, só na primeira vez)
ollama pull qwen2.5:7b

# 3. Aplicação
npm install
cp .env.example .env      # no Windows: copy .env.example .env
npm start                 # abra http://localhost:3000
```

Ao iniciar, o terminal mostra se a busca e a IA foram encontradas. A mesma informação aparece na seção 5 da página.

Dicas:
- O SearXNG às vezes é bloqueado temporariamente pelo Google; os resultados continuam vindo dos outros buscadores.
- No modo local, cada busca pode levar de alguns segundos a alguns minutos, dependendo do computador.
- Para respostas melhores, troque `OLLAMA_MODEL` por um modelo maior (ex.: `qwen2.5:14b`) se o computador aguentar.
- Se preferir rodar o Ollama em contêiner: `docker compose --profile ollama up -d` e depois `docker compose exec ollama ollama pull qwen2.5:7b`.

### Pagos

No `.env`, cada parte pode ser trocada sem mexer no código:

- `PROVEDOR_BUSCA=serper` + `SERPER_API_KEY` – resultados reais do Google via [Serper.dev](https://serper.dev) (2.500 buscas grátis, depois pago).
- `PROVEDOR_IA=claude` + `ANTHROPIC_API_KEY` – extração com o Claude, mais precisa; ele mesmo abre as páginas dos resultados.

