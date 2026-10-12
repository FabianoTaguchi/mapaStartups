# Mapa Startups – Busca por termos

Interface web (HTML/CSS/JS puro, sem dependências) para montar buscas no Google a partir de vários termos, combinados ou não.

## Como usar

Abra `index.html` no navegador (ou sirva a pasta com `python3 -m http.server`).

1. **Termos** – digite e pressione Enter, ou cole vários separados por vírgula/linha.
2. **Como combinar**
   - *Todos juntos (E)* – uma busca com todos os termos.
   - *Qualquer um (OU)* – uma busca com os termos ligados por `OR`.
   - *Cada termo separado* – uma busca por termo.
   - *Combinações de K termos* – todas as combinações de tamanho K.
   - *Todas as combinações* – todos os subconjuntos (limitado a 200 buscas).
3. **Filtros** – termo fixo, exclusões (`-termo`), `site:`, `filetype:`, período, idioma, país e `intitle:`/`inurl:`/`intext:`.
4. **Resultados** – abra cada busca, abra todas em abas, copie os links ou exporte em CSV.

O estado (termos e filtros) fica salvo no `localStorage` do navegador.
