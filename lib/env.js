// Carrega o .env antes dos outros módulos lerem process.env (importe primeiro).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arquivo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
try {
  process.loadEnvFile(arquivo);
} catch { /* sem .env: usa os valores padrão */ }
