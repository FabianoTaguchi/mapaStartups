// Assistente de configuração do Mapa Startups.
// Uso: dois cliques em configurar.bat (Windows) ou "npm run configurar".
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO_ENV = path.join(RAIZ, '.env');
const WINDOWS = process.platform === 'win32';
const SEARXNG_URL = 'http://127.0.0.1:8080';
const OLLAMA_URL = 'http://127.0.0.1:11434';
const OLLAMA_MODELO = 'qwen2.5:7b';

// ---------- Entrada e saída no terminal ----------

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const linhas = rl[Symbol.asyncIterator]();
let ocultar = false;
const escreverOriginal = rl._writeToOutput?.bind(rl);
if (escreverOriginal) {
  // Mostra * no lugar das chaves digitadas.
  rl._writeToOutput = (s) => escreverOriginal(ocultar && !/^\r?\n$/.test(s) ? '*'.repeat(s.length) : s);
}

async function perguntar(texto, { oculto = false } = {}) {
  process.stdout.write(texto);
  ocultar = oculto && process.stdin.isTTY;
  const { value, done } = await linhas.next();
  ocultar = false;
  if (done) {
    console.log('\nEntrada encerrada. Nada foi alterado.');
    process.exit(1);
  }
  return value.trim();
}

async function escolher(texto, opcoes, padrao = 1) {
  console.log(`\n${texto}`);
  opcoes.forEach((o, i) => console.log(`  ${i + 1}) ${o}`));
  for (;;) {
    const r = await perguntar(`Digite o número [${padrao}]: `);
    const n = r === '' ? padrao : Number(r);
    if (Number.isInteger(n) && n >= 1 && n <= opcoes.length) return n;
    console.log(`  Opção inválida. Digite um número de 1 a ${opcoes.length}.`);
  }
}

async function confirmar(texto, padrao = true) {
  const r = (await perguntar(`${texto} [${padrao ? 'S/n' : 's/N'}]: `)).toLowerCase();
  return r === '' ? padrao : r.startsWith('s') || r.startsWith('y');
}

const ok = (t) => console.log(`  ✓ ${t}`);
const aviso = (t) => console.log(`  ✗ ${t}`);
const titulo = (t) => console.log(`\n=== ${t} ===`);

// ---------- Utilitários ----------

function rodar(comando, args, { mostrar = false } = {}) {
  const r = spawnSync(comando, args, { cwd: RAIZ, shell: WINDOWS, stdio: mostrar ? 'inherit' : 'pipe', encoding: 'utf8' });
  return { ok: r.status === 0, saida: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

async function responde(url, ms = 3000) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(ms) });
    return true;
  } catch {
    return false;
  }
}

async function esperar(url, segundos) {
  for (let i = 0; i < segundos; i++) {
    if (await responde(url, 1000)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function lerEnvAtual() {
  try {
    return Object.fromEntries(
      fs.readFileSync(ARQUIVO_ENV, 'utf8').split(/\r?\n/)
        .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim()]),
    );
  } catch {
    return {};
  }
}

function abrirNoNavegador(alvo) {
  const [cmd, args] = WINDOWS ? ['cmd', ['/c', 'start', '', alvo]]
    : process.platform === 'darwin' ? ['open', [alvo]] : ['xdg-open', [alvo]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch { /* sem navegador disponível */ }
}

// ---------- Etapas ----------

function verificarNode() {
  const [maior, menor] = process.versions.node.split('.').map(Number);
  if (maior < 20 || (maior === 20 && menor < 12)) {
    aviso(`Node.js ${process.versions.node} é antigo. Instale a versão LTS em https://nodejs.org e rode de novo.`);
    process.exit(1);
  }
  ok(`Node.js ${process.versions.node}`);
}

function instalarDependencias() {
  if (fs.existsSync(path.join(RAIZ, 'node_modules', '@anthropic-ai', 'sdk'))) {
    ok('Dependências já instaladas');
    return;
  }
  console.log('  Instalando dependências (npm install)...');
  if (!rodar('npm', ['install'], { mostrar: true }).ok) {
    aviso('Falha no "npm install". Verifique a internet e rode o assistente de novo.');
    process.exit(1);
  }
  ok('Dependências instaladas');
}

async function configurarClaude(atual) {
  titulo('API do Claude');
  console.log('Crie a chave em https://platform.claude.com → API Keys (começa com "sk-ant-").');
  console.log('A chave fica só no arquivo .env do seu computador e nunca vai para o GitHub.');
  const temAtual = Boolean(atual.ANTHROPIC_API_KEY);

  for (;;) {
    const digitada = await perguntar(
      temAtual ? 'Cole a chave (Enter para manter a atual): ' : 'Cole a chave: ',
      { oculto: true },
    );
    const chave = digitada || atual.ANTHROPIC_API_KEY || '';
    if (!chave) { aviso('A chave é obrigatória neste modo.'); continue; }

    process.stdout.write('  Testando a chave... ');
    const resultado = await testarChaveClaude(chave);
    if (resultado === true) {
      console.log('ok');
      ok('Chave do Claude válida');
      const modelo = await escolher('Qual modelo usar?', [
        'Claude Sonnet 5.5 — recomendado: boa qualidade, metade do preço',
        'Claude Opus 5.5 — máxima qualidade, mais caro',
      ]);
      return { ANTHROPIC_API_KEY: chave, CLAUDE_MODEL: modelo === 1 ? 'claude-sonnet-5-5' : 'claude-opus-5-5' };
    }
    console.log('falhou');
    aviso(resultado);
    if (!(await confirmar('Tentar outra chave?'))) process.exit(1);
  }
}

async function testarChaveClaude(chave) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  try {
    await new Anthropic({ apiKey: chave, maxRetries: 1, timeout: 20_000 }).models.list({ limit: 1 });
    return true;
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError) return 'Chave inválida. Confira se copiou a chave inteira.';
    if (erro instanceof Anthropic.PermissionDeniedError) return 'A chave não tem permissão. Verifique a conta no painel.';
    if (erro instanceof Anthropic.APIConnectionError) return 'Não consegui falar com a Anthropic. Verifique a internet ou o proxy da rede.';
    if (erro instanceof Anthropic.APIError) return `Erro da API (${erro.status}): ${erro.message}`;
    return erro.message;
  }
}

async function configurarSerper(atual) {
  titulo('Serper (resultados do Google)');
  console.log('Crie a conta em https://serper.dev e copie a "API Key" do painel (2.500 buscas grátis).');
  for (;;) {
    const digitada = await perguntar(
      atual.SERPER_API_KEY ? 'Cole a chave (Enter para manter a atual): ' : 'Cole a chave: ',
      { oculto: true },
    );
    const chave = digitada || atual.SERPER_API_KEY || '';
    if (!chave) { aviso('A chave é obrigatória para usar o Serper.'); continue; }

    process.stdout.write('  Testando a chave (usa 1 busca da cota)... ');
    try {
      const resp = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'startup', num: 1 }),
        signal: AbortSignal.timeout(20_000),
      });
      if (resp.ok) {
        console.log('ok');
        ok('Chave do Serper válida');
        return { SERPER_API_KEY: chave };
      }
      console.log('falhou');
      aviso(resp.status === 401 || resp.status === 403 ? 'Chave inválida.' : `O Serper respondeu ${resp.status}.`);
    } catch {
      console.log('falhou');
      aviso('Não consegui falar com o Serper. Verifique a internet.');
    }
    if (!(await confirmar('Tentar outra chave?'))) process.exit(1);
  }
}

async function configurarSearxng() {
  titulo('SearXNG (busca gratuita)');
  if (await responde(SEARXNG_URL)) {
    ok(`SearXNG já está rodando em ${SEARXNG_URL}`);
    return true;
  }
  if (!rodar('docker', ['--version']).ok) {
    aviso('Docker não encontrado. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop/');
    return false;
  }
  if (!rodar('docker', ['info']).ok) {
    aviso('O Docker está instalado, mas não está aberto. Abra o Docker Desktop, espere ele iniciar e rode o assistente de novo.');
    return false;
  }
  console.log('  Subindo o SearXNG (docker compose up -d)... na primeira vez pode demorar alguns minutos.');
  if (!rodar('docker', ['compose', 'up', '-d'], { mostrar: true }).ok) {
    aviso('Falha ao subir o SearXNG com o Docker.');
    return false;
  }
  if (await esperar(SEARXNG_URL, 60)) {
    ok(`SearXNG rodando em ${SEARXNG_URL}`);
    return true;
  }
  aviso('O SearXNG não respondeu a tempo. Veja os logs com: docker compose logs searxng');
  return false;
}

async function configurarOllama() {
  titulo('Ollama (IA gratuita no seu computador)');
  if (!(await responde(OLLAMA_URL))) {
    if (!rodar('ollama', ['--version']).ok) {
      aviso('Ollama não encontrado. Instale em https://ollama.com/download e rode o assistente de novo.');
      return false;
    }
    console.log('  O Ollama está instalado, mas não está rodando. Tentando iniciar...');
    try {
      spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', shell: WINDOWS }).on('error', () => {}).unref();
    } catch { /* tratado abaixo */ }
    if (!(await esperar(OLLAMA_URL, 15))) {
      aviso('Não consegui iniciar o Ollama. Abra o aplicativo Ollama pelo menu Iniciar e rode o assistente de novo.');
      return false;
    }
  }
  ok(`Ollama rodando em ${OLLAMA_URL}`);

  const { models = [] } = await (await fetch(`${OLLAMA_URL}/api/tags`)).json();
  if (models.some((m) => m.name === OLLAMA_MODELO || m.name === `${OLLAMA_MODELO}:latest`)) {
    ok(`Modelo ${OLLAMA_MODELO} já baixado`);
    return true;
  }
  if (!(await confirmar(`Baixar o modelo ${OLLAMA_MODELO} agora (cerca de 4,7 GB)?`))) {
    aviso(`Sem o modelo, os resumos não funcionam. Depois rode: ollama pull ${OLLAMA_MODELO}`);
    return false;
  }
  if (!rodar('ollama', ['pull', OLLAMA_MODELO], { mostrar: true }).ok) {
    aviso('Falha ao baixar o modelo.');
    return false;
  }
  ok(`Modelo ${OLLAMA_MODELO} baixado`);
  return true;
}

function salvarEnv(valores) {
  if (fs.existsSync(ARQUIVO_ENV)) fs.copyFileSync(ARQUIVO_ENV, `${ARQUIVO_ENV}.bak`);
  const linhasEnv = [
    '# Gerado pelo assistente de configuração (configurar.bat). Pode editar à mão.',
    ...Object.entries(valores).map(([k, v]) => `${k}=${v}`),
    '',
  ];
  fs.writeFileSync(ARQUIVO_ENV, linhasEnv.join('\n'), 'utf8');
  ok(`Configuração salva em .env${fs.existsSync(`${ARQUIVO_ENV}.bak`) ? ' (a anterior ficou em .env.bak)' : ''}`);
}

function iniciarServidor() {
  console.log('\nIniciando o Mapa Startups... (para parar, feche esta janela ou aperte Ctrl+C)');
  rl.close();
  const servidor = spawn(process.execPath, ['server.js', '--abrir'], { cwd: RAIZ, stdio: 'inherit' });
  servidor.on('exit', (codigo) => process.exit(codigo ?? 0));
}

// ---------- Fluxo principal ----------

async function main() {
  console.log('Assistente de configuração do Mapa Startups');
  titulo('Verificando o computador');
  verificarNode();
  instalarDependencias();

  const atual = lerEnvAtual();
  const modo = await escolher('Como você quer gerar os resumos das startups?', [
    'Claude no chat (claude.ai) — usa sua assinatura, sem custo extra, você copia e cola',
    'Automático com a API do Claude — pago (centavos por busca), melhor qualidade',
    'Automático gratuito — SearXNG + Ollama no seu computador (precisa de Docker e 16 GB de RAM)',
  ]);

  if (modo === 1) {
    titulo('Pronto');
    console.log('Nesse modo não há nada para configurar: é só abrir o index.html.');
    console.log('Dica: depois pode dar dois cliques em iniciar.bat, que abre a página.');
    if (fs.existsSync(ARQUIVO_ENV) && await confirmar('Remover a configuração do modo automático (.env)?', false)) {
      fs.renameSync(ARQUIVO_ENV, `${ARQUIVO_ENV}.bak`);
      ok('Arquivo .env renomeado para .env.bak');
    }
    if (await confirmar('Abrir a página agora?')) abrirNoNavegador(path.join(RAIZ, 'index.html'));
    rl.close();
    return;
  }

  const valores = { PORT: atual.PORT || '3000', MAX_PAGINAS_VISITADAS: atual.MAX_PAGINAS_VISITADAS || '3' };
  let tudoCerto = true;

  if (modo === 2) {
    Object.assign(valores, { PROVEDOR_IA: 'claude' }, await configurarClaude(atual));
    const busca = await escolher('De onde vêm os resultados de busca?', [
      'Serper — resultados reais do Google (2.500 grátis, depois cerca de US$ 1 por 1.000)',
      'SearXNG — gratuito, roda no seu computador com Docker',
    ]);
    if (busca === 1) {
      Object.assign(valores, { PROVEDOR_BUSCA: 'serper' }, await configurarSerper(atual));
    } else {
      Object.assign(valores, { PROVEDOR_BUSCA: 'searxng', SEARXNG_URL });
      tudoCerto = await configurarSearxng();
    }
  } else {
    Object.assign(valores, {
      PROVEDOR_BUSCA: 'searxng', SEARXNG_URL,
      PROVEDOR_IA: 'ollama', OLLAMA_URL, OLLAMA_MODEL: atual.OLLAMA_MODEL || OLLAMA_MODELO,
    });
    const searxng = await configurarSearxng();
    const ollama = await configurarOllama();
    tudoCerto = searxng && ollama;
  }

  // Mantém chaves já cadastradas, para poder voltar de modo sem digitá-las de novo.
  for (const k of ['ANTHROPIC_API_KEY', 'CLAUDE_MODEL', 'SERPER_API_KEY']) {
    if (atual[k] && !valores[k]) valores[k] = atual[k];
  }

  titulo('Salvando');
  salvarEnv(valores);

  titulo(tudoCerto ? 'Tudo pronto' : 'Quase pronto');
  if (!tudoCerto) console.log('Resolva os itens marcados com ✗ acima e rode o assistente de novo.');
  console.log(`Para usar depois: dois cliques em iniciar.bat (ou "npm start") e abra http://localhost:${valores.PORT}`);
  if (tudoCerto && await confirmar('Iniciar o Mapa Startups agora?')) {
    iniciarServidor();
    return;
  }
  rl.close();
}

main().catch((erro) => {
  console.error('\nErro inesperado:', erro.message);
  process.exit(1);
});
