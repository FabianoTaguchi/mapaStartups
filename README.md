# Mapa Startups – Busca por termos

Interface web para montar buscas a partir de vários termos, combinados ou não, e gerar um mini-resumo de cada startup/projeto encontrado (nome, responsável, área de atuação e website).

## Modo gratuito (padrão): SearXNG + Ollama

Tudo roda no seu computador, sem chaves de API e sem custo.

- **SearXNG** – metabuscador de código aberto que junta resultados do Google, Bing, DuckDuckGo e outros.
- **Ollama** – roda um modelo de IA localmente para ler os resultados e extrair os dados.

### Pré-requisitos

- [Node.js](https://nodejs.org) 20 ou superior
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (para o SearXNG)
- [Ollama](https://ollama.com/download)
- Computador com pelo menos 16 GB de RAM (com placa de vídeo fica bem mais rápido)

### Passo a passo

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

## Modos pagos (opcionais)

No `.env`, cada parte pode ser trocada sem mexer no código:

- `PROVEDOR_BUSCA=serper` + `SERPER_API_KEY` – resultados reais do Google via [Serper.dev](https://serper.dev) (2.500 buscas grátis, depois pago).
- `PROVEDOR_IA=claude` + `ANTHROPIC_API_KEY` – extração com o Claude, mais precisa; ele mesmo abre as páginas dos resultados.

## Como usar

Só gerar os links de busca: abra `index.html` direto no navegador (não precisa de servidor).

1. **Termos** – digite e pressione Enter, ou cole vários separados por vírgula/linha.
2. **Como combinar**
   - *Todos juntos (E)* – uma busca com todos os termos.
   - *Qualquer um (OU)* – uma busca com os termos ligados por `OR`.
   - *Cada termo separado* – uma busca por termo.
   - *Combinações de K termos* – todas as combinações de tamanho K.
   - *Todas as combinações* – todos os subconjuntos (limitado a 200 buscas).
3. **Filtros** – termo fixo, exclusões (`-termo`), `site:`, `filetype:`, período, idioma, país e `intitle:`/`inurl:`/`intext:`.
4. **Resultados** – abra cada busca no Google, abra todas em abas, copie os links ou exporte em CSV.
5. **Resumos** – clique em *Buscar e resumir*: para cada busca, o servidor pega os resultados, lê as principais páginas (`MAX_PAGINAS_VISITADAS`, padrão 3) e a IA extrai nome, responsável, área de atuação, website e um resumo curto de cada startup/projeto. Dados não encontrados aparecem como "não identificado". Os resumos podem ser exportados em CSV.

O estado (termos e filtros) fica salvo no `localStorage` do navegador.
