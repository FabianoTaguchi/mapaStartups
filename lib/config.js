// Configuração lida do .env. Padrão: tudo gratuito e local (SearXNG + Ollama).
export const config = {
  porta: Number(process.env.PORT) || 3000,
  provedorBusca: (process.env.PROVEDOR_BUSCA || 'searxng').toLowerCase(), // searxng | serper
  provedorIa: (process.env.PROVEDOR_IA || 'ollama').toLowerCase(), // ollama | claude
  searxngUrl: (process.env.SEARXNG_URL || 'http://127.0.0.1:8080').replace(/\/$/, ''),
  serperKey: process.env.SERPER_API_KEY,
  ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  ollamaModelo: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
  ollamaContexto: Number(process.env.OLLAMA_NUM_CTX) || 16384,
  claudeModelo: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  maxPaginas: Number(process.env.MAX_PAGINAS_VISITADAS) || 3,
  // Segundo salto: páginas das startups citadas nas listagens já lidas.
  maxPaginasFilhas: Number(process.env.MAX_PAGINAS_FILHAS) || 4,
  // Texto de cada página enviado à IA (links + conteúdo).
  maxCaracteresPagina: Number(process.env.MAX_CARACTERES_PAGINA) || 15000,
  tempoLimitePagina: (Number(process.env.TEMPO_LIMITE_PAGINA) || 15) * 1000, // segundos
  // auto: usa o Playwright, se instalado, para sites montados por JavaScript ou bloqueados.
  usarNavegador: (process.env.USAR_NAVEGADOR || 'auto').toLowerCase(), // auto | nao
};
