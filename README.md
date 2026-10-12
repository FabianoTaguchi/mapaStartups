# Mapa Startups – Busca por termos

Interface web (HTML/CSS/JS puro, sem dependências) para montar buscas no Google a partir de vários termos, combinados ou não.

## Como rodar

Só gerar os links de busca: abra `index.html` no navegador.

Para gerar também os **resumos das startups/projetos** (nome, responsável, área, website):

```bash
npm install
cp .env.example .env   # preencha ANTHROPIC_API_KEY e SERPER_API_KEY
npm start              # abre em http://localhost:3000
```

Requer Node.js 20 ou superior.

- `ANTHROPIC_API_KEY` – chave da API do Claude (https://console.anthropic.com), usada para ler os resultados e as páginas e extrair os dados.
- `SERPER_API_KEY` – chave do Serper.dev (https://serper.dev), que retorna os resultados do Google. Sem ela, a pesquisa é feita pela busca web do próprio Claude.

## Como usar

1. **Termos** – digite e pressione Enter, ou cole vários separados por vírgula/linha.
2. **Como combinar**
   - *Todos juntos (E)* – uma busca com todos os termos.
   - *Qualquer um (OU)* – uma busca com os termos ligados por `OR`.
   - *Cada termo separado* – uma busca por termo.
   - *Combinações de K termos* – todas as combinações de tamanho K.
   - *Todas as combinações* – todos os subconjuntos (limitado a 200 buscas).
3. **Filtros** – termo fixo, exclusões (`-termo`), `site:`, `filetype:`, período, idioma, país e `intitle:`/`inurl:`/`intext:`.
4. **Resultados** – abra cada busca, abra todas em abas, copie os links ou exporte em CSV.
5. **Resumos** – clique em *Buscar e resumir*: para cada busca, o servidor pega os resultados do Google e o Claude visita as páginas mais relevantes para extrair nome, responsável, área de atuação, website e um resumo curto de cada startup/projeto. Dados não encontrados aparecem como "não identificado" (nada é inventado). Os resumos podem ser exportados em CSV.

Cada busca resumida consome créditos das duas APIs; o número de páginas que o Claude abre por busca é limitado por `MAX_PAGINAS_VISITADAS` (padrão 5).

O estado (termos e filtros) fica salvo no `localStorage` do navegador.
