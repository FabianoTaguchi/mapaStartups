// Configuração lida do .env. Padrão: tudo gratuito e local (SearXNG + Ollama).
export const config = {
  porta: Number(process.env.PORT) || 3000,
  provedorBusca: (process.env.PROVEDOR_BUSCA || 'searxng').toLowerCase(), // searxng | serper
  provedorIa: (process.env.PROVEDOR_IA || 'ollama').toLowerCase(), // ollama | claude
  searxngUrl: (process.env.SEARXNG_URL || 'http://127.0.0.1:8080').replace(/\/$/, ''),
  serperKey: process.env.SERPER_API_KEY,
  ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  ollamaModelo: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
  ollamaContexto: Number(process.env.OLLAMA_NUM_CTX) || 8192,
  claudeModelo: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  maxPaginas: Number(process.env.MAX_PAGINAS_VISITADAS) || 3,
};
