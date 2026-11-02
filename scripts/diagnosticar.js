// Mostra por que uma página é (ou não) lida, com as mesmas regras da busca automática.
// Uso: npm run diagnosticar -- https://site1.com.br https://site2.com.br
import '../lib/env.js';
import { lerPaginaDetalhada, fecharNavegador } from '../lib/paginas.js';

const urls = process.argv.slice(2);
if (!urls.length) {
  console.log('Uso: npm run diagnosticar -- https://site1.com.br https://site2.com.br');
  process.exit(1);
}

for (const url of urls) {
  const p = await lerPaginaDetalhada(url);
  console.log(`\n=== ${url}`);
  console.log(`Resultado: ${p.ok ? 'LIDA' : 'NÃO LIDA'} | via: ${p.via} | status: ${p.status ?? '-'}`);
  if (p.motivo) console.log(`Motivo: ${p.motivo}`);
  console.log(`Texto útil: ${p.tamanhoCorpo} caracteres | links aproveitáveis: ${p.links.length}`);
  if (p.texto) console.log(`Início do que a IA recebe:\n${p.texto.slice(0, 400)}`);
}
await fecharNavegador();
