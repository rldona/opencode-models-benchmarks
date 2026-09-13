#!/usr/bin/env node
// Lanza y/o recoge los resultados de un benchmark de opencode por modelo.
//
//   node scripts/bench.mjs open    <slug>              [--test rrule] [--agent plan|build] [--force] [--no-judge]
//                                  (al cerrar la TUI ejecuta collect + judge)
//   node scripts/bench.mjs collect <slug...> | --all   [--test rrule] [--session <id>] [--force]
//   node scripts/bench.mjs run     <slug...> | --all   [--test rrule] [--parallel N] [--timeout <min>] [--force] [--no-judge]
//                                  (autopiloto: plan → "Sí" → build → "Continúa" si hace falta → collect + judge)
//   node scripts/bench.mjs judge   <slug...> | --all   [--test rrule] [--judge claude:sonnet|opencode-go/<id>] [--force]
//   node scripts/bench.mjs reset   <slug...>           [--test rrule]   (archiva carpeta y resultados para repetir)
//   node scripts/bench.mjs report                      [--test rrule]
//   node scripts/bench.mjs publish                     [--no-push] [--message "…"]   (copia limpia → GitHub + Pages)
//   node scripts/bench.mjs run|collect|judge|reset --exp <nombre> --model <proveedor/modelo> [--label "…"] [--variant v]
//                                  [--provider "…"] [--test rrule]
//   node scripts/bench.mjs report  --experiments       [--test rrule]
//                                  (experimentos no vinculantes, registrados en experiments/models.json; informe común en
//                                  experiments/<test>/; no entran en las tablas oficiales, la web ni publish)
//
// Métricas: sesión de opencode (export + tabla session de la BD). Tests: se re-ejecutan con vitest
// de forma independiente, sin fiarse de lo que diga el modelo. Nota 0-10: suite oculta + juez LLM
// (ver benchmarks/<test>/RUBRIC.md).

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
const ALLOWED_DEPS = [/^vitest$/, /^@vitest\//, /^typescript$/, /^@types\/node$/];
const ALLOWED_IMPORTS = new Set([...builtinModules, 'vitest']);
const DEFAULT_JUDGE = 'claude:sonnet';
// Configuración por prueba en benchmarks/<test>/bench.json (pesos de la nota, timeout, TZ extra, imports
// prohibidos, timeouts de la suite oculta). Valores por defecto = los de rrule.
const DEFAULT_CONFIG = {
  weights: { correctness: 4, autonomy: 1, ownTests: 2, codeQuality: 2, robustness: 1 },
  timeout: 45,
  extraTzs: ['UTC', 'America/New_York', 'Asia/Kolkata'],
  forbiddenImports: [],
  hiddenTimeoutMs: { main: 120_000 },
  hiddenCaseTimeoutMs: { main: 30_000 },
};
const configCache = new Map();
function testConfig(test = 'rrule') {
  if (!configCache.has(test)) {
    const f = path.join(ROOT, 'benchmarks', test, 'bench.json');
    const own = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    configCache.set(test, { ...DEFAULT_CONFIG, ...own, weights: { ...DEFAULT_CONFIG.weights, ...own.weights } });
  }
  return configCache.get(test);
}
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'build']);
// Errores del proveedor por cuota/límite (opencode-go tiene cuotas por ventana de 5 h): no son culpa del modelo.
const QUOTA_RE = /quota|rate.?limit|too many requests|\b429\b|insufficient (credit|balance|quota|funds)|usage limit|cuota/i;

// ---------- utilidades ----------

const rel = (p) => path.relative(ROOT, p) || '.';
const log = (...a) => console.log(...a);
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

// Entorno aislado para lanzar modelos: sin integración con el editor (opencode inyecta el fichero abierto y
// el texto seleccionado en el prompt) y sin acceso fuera de la carpeta de trabajo (el resto de soluciones,
// resultados y la suite oculta viven en el mismo repo). La config se añade sin tocar la global del usuario.
// Variante de razonamiento: la TUI envía la guardada por modelo en ~/.local/state/opencode/model.json (lo mismo
// que elegirla a mano con ctrl+t). Se fija antes de abrir para que todos los modelos usen su máximo disponible.
const TUI_STATE = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'opencode', 'model.json');
const expectedVariant = (model) => model.variant ?? 'default';

function setTuiVariant(model) {
  const state = readJson(TUI_STATE) ?? { recent: [], favorite: [], variant: {} };
  state.variant = { ...state.variant };
  if (model.variant) state.variant[model.id] = model.variant;
  else delete state.variant[model.id];
  fs.mkdirSync(path.dirname(TUI_STATE), { recursive: true });
  writeAtomic(TUI_STATE, JSON.stringify(state));
}

function benchEnv() {
  const env = { ...process.env };
  for (const k of ['CLAUDE_CODE_SSE_PORT', 'ZED_TERM']) delete env[k];
  if (env.TERM_PROGRAM?.toLowerCase() === 'zed') delete env.TERM_PROGRAM;
  // Sin puerto en el entorno, opencode busca ~/.claude/ide/*.lock (extensión de Claude Code en VS Code…) y se
  // conecta al editor cuyo workspace contenga la carpeta del modelo, aunque se lance desde otro terminal.
  // Con un puerto explícito no escanea esos locks; el 1 está cerrado, así que nunca llega a conectar.
  env.OPENCODE_EDITOR_SSE_PORT = '1';
  // opencode limita cada respuesta a 32.000 tokens de salida (razonamiento incluido) aunque el modelo admita más: con
  // variantes de razonamiento máximo (GLM en max) se agotan pensando y se cortan sin escribir nada. Tope común más
  // alto; cada modelo usa min(su límite, este valor).
  env.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = '131072';
  // question denegada también en la TUI: el modelo decide solo en vez de preguntar (en `opencode run` ya lo está).
  // external_directory no reconoce `~` ni `$HOME` en comandos bash (Kimi K3 listó ~/workspace así): se deniegan
  // aparte. En opencode gana la última regla que coincide, por eso "*" va primero.
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
    permission: {
      external_directory: 'deny',
      question: 'deny',
      bash: { '*': 'allow', '*~*': 'deny', '*$HOME*': 'deny', '*${HOME}*': 'deny' },
    },
  });
  return env;
}

const readPrompt = (test) => fs.readFileSync(path.join(ROOT, 'benchmarks', test, 'PROMPT.md'), 'utf8').trim();

// Escritura atómica: varios `open` en paralelo pueden regenerar RESULTS.md/DETAILS.md a la vez.
function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, ...opts });
  if (r.error && r.error.code !== 'ETIMEDOUT') throw r.error;
  return r;
}

// opencode trunca stdout cuando es un pipe (~64-128 KB), así que la salida va a un fichero temporal.
function shToFile(cmd, args, opts = {}) {
  const tmp = path.join(os.tmpdir(), `bench-out-${process.pid}-${Date.now()}.txt`);
  const fd = fs.openSync(tmp, 'w');
  try {
    const r = sh(cmd, args, { stdio: [opts.input != null ? 'pipe' : 'ignore', fd, 'pipe'], ...opts });
    return { ...r, stdout: fs.readFileSync(tmp, 'utf8') };
  } finally {
    fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
  }
}

function opencodeJson(args) {
  const r = shToFile('opencode', args);
  if (r.status !== 0) throw new Error(`opencode ${args[0]} falló: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const db = (sql) => opencodeJson(['db', '--format', 'json', sql]);

const fmtDur = (ms) => {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};
const fmtTok = (n) => (n == null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const fmtCost = (c) => (c == null ? '' : c === 0 ? '$0' : `$${c.toFixed(c < 1 ? 4 : 2)}`);

function modelBySlug(slug) {
  const m = EXP ? EXP.models.find((x) => x.slug === slug) : MODELS.find((x) => x.slug === slug);
  if (!m) throw new Error(`Modelo desconocido: ${slug}. Disponibles: ${(EXP ? EXP.models : MODELS).map((x) => x.slug).join(', ')}`);
  return m;
}

// Modo experimento (--exp <nombre> --model <proveedor/modelo>): pruebas no vinculantes con modelos fuera de
// models.json (p. ej. el mismo modelo por la API directa de su proveedor). Mismo esquema que el benchmark, bajo
// experiments/: registro en models.json, carpetas de trabajo en models/<nombre>/<test>/ y un informe común por
// prueba en <test>/ con todos los experimentos. No entra en las tablas oficiales, la web ni publish.
const EXP_DIR = path.join(ROOT, 'experiments');
const EXP_REGISTRY = path.join(EXP_DIR, 'models.json');
let EXP = null; // { model: el experimento de la orden (null en report --experiments), models: el registro }
const workDir = (slug, test) => path.join(EXP ? EXP_DIR : ROOT, 'models', slug, test);
const reportDir = (test) => path.join(EXP ? EXP_DIR : path.join(ROOT, 'benchmarks'), test);
const resultsDir = (test) => path.join(reportDir(test), 'results');
const resultFile = (slug, test) => path.join(resultsDir(test), `${slug}.json`);
const runningFile = (slug, test) => path.join(resultsDir(test), `${slug}.running`);

// Nueva ejecución de un modelo: sus resultados anteriores se archivan (nunca se reutilizan) y queda un marcador
// para que la tabla lo muestre como "ejecutando" en vez de vacío o con datos viejos.
function startRun(slug, test) {
  const dir = resultsDir(test);
  fs.mkdirSync(dir, { recursive: true });
  const old = [`${slug}.json`, `${slug}.judge.json`, `${slug}.adapter.ts`].filter((f) => fs.existsSync(path.join(dir, f)));
  if (old.length) {
    const dest = path.join(dir, 'archive', `${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(dest, { recursive: true });
    for (const f of old) fs.renameSync(path.join(dir, f), path.join(dest, f));
  }
  fs.writeFileSync(runningFile(slug, test), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  report({ test });
}

const endRun = (slug, test) => fs.rmSync(runningFile(slug, test), { force: true });

function isRunning(slug, test) {
  const marker = readJson(runningFile(slug, test));
  if (!marker) return false;
  try {
    process.kill(marker.pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---------- sesión de opencode ----------

function rootSessions(dir) {
  return db(
    `select id, time_created, time_updated, tokens_input + tokens_output as tokens from session ` +
      `where directory = ${sqlStr(dir)} and parent_id is null order by time_created`,
  );
}

function sessionTree(rootId) {
  return db(
    `with recursive tree(id) as (select id from session where id = ${sqlStr(rootId)} ` +
      `union all select s.id from session s join tree t on s.parent_id = t.id) select id from tree`,
  ).map((r) => r.id);
}

// Detecta contaminación: contexto del editor inyectado y accesos a rutas del repo fuera de la carpeta del modelo.
function isolationReport(exports, dir, slug) {
  const ownModelDir = path.dirname(dir); // models/<slug> (o experiments/models/<nombre>)
  const inside = (p, base) => p === base || p.startsWith(base + path.sep);
  // repo: otras soluciones, resultados o suite oculta (contamina) · ancestro/home: tu carpeta personal fuera del
  // benchmark (no contamina, pero es exploración fuera de su carpeta) · el resto (/usr, /tmp…) se ignora.
  const classify = (p) => {
    if (inside(p, dir) || inside(p, ownModelDir)) return null;
    // Rutas que no existen no son accesos (p. ej. un `import '../src/index'` dentro de un `node -e`).
    if (!fs.existsSync(p)) return null;
    if (inside(p, ROOT)) return 'repo';
    if (inside(ROOT, p)) return 'ancestro';
    if (inside(p, os.homedir())) return 'home';
    return null;
  };
  const editorContext = [];
  const seen = new Map();
  for (const e of exports) {
    for (const m of e.messages) {
      for (const p of m.parts ?? []) {
        if (m.info.role === 'user' && p.type === 'text' && /<system-reminder>Note: The user (opened|selected)/.test(p.text ?? '')) {
          editorContext.push(p.text.slice(0, 400));
        }
        if (p.type !== 'tool') continue;
        const input = p.state?.input ?? {};
        const targets = ['filePath', 'path'].filter((k) => typeof input[k] === 'string').map((k) => path.resolve(dir, input[k]));
        if (typeof input.command === 'string') {
          for (const tok of input.command.split(/[\s'"=;|&<>()]+/)) {
            if (/^(\/|\.\.|~)/.test(tok)) targets.push(path.resolve(dir, tok.replace(/^~/, os.homedir())));
          }
        }
        for (const target of targets) {
          const kind = classify(target);
          if (!kind) continue;
          const blocked = p.state?.status === 'error' && /rejected permission|prevents you from using/.test(p.state?.error ?? '');
          const key = `${p.tool}|${target}|${blocked}`;
          if (!seen.has(key)) seen.set(key, { tool: p.tool, target: rel(target), kind, status: p.state?.status, blocked });
        }
      }
    }
  }
  const externalAccess = [...seen.values()];
  return {
    editorContext,
    externalAccess,
    leaked: externalAccess.some((a) => a.kind === 'repo' && !a.blocked && a.status === 'completed'),
    explored: externalAccess.some((a) => a.kind !== 'repo' && !a.blocked && a.status === 'completed'),
  };
}

function sessionMetrics(rootId, dir, slug) {
  const ids = sessionTree(rootId);
  const exports = ids.map((id) => opencodeJson(['export', id]));
  const root = exports[0];
  const msgs = root.messages;
  const user = msgs.filter((m) => m.info.role === 'user');
  const asst = msgs.filter((m) => m.info.role === 'assistant');
  const last = asst.at(-1);
  const now = Date.now();

  const inProgress =
    !last || !last.info.time?.completed || (last.info.finish === 'tool-calls' && !last.info.error);

  const tokens = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
  let cost = 0;
  const tools = {};
  let toolErrors = 0;
  const errors = [];
  const models = new Set();
  let steps = 0;

  for (const e of exports) {
    for (const m of e.messages) {
      if (m.info.role === 'assistant') {
        steps++;
        const t = m.info.tokens ?? {};
        tokens.input += t.input ?? 0;
        tokens.output += t.output ?? 0;
        tokens.reasoning += t.reasoning ?? 0;
        tokens.cacheRead += t.cache?.read ?? 0;
        tokens.cacheWrite += t.cache?.write ?? 0;
        cost += m.info.cost ?? 0;
        models.add(`${m.info.providerID}/${m.info.modelID}${m.info.variant ? ` (${m.info.variant})` : ''}`);
        if (m.info.error) errors.push(JSON.stringify(m.info.error).slice(0, 400));
      }
      for (const p of m.parts ?? []) {
        if (p.type !== 'tool') continue;
        tools[p.tool] = (tools[p.tool] ?? 0) + 1;
        if (p.state?.status === 'error') toolErrors++;
      }
    }
  }

  // Si la sesión empezó en el agente "plan", el primer mensaje en "build" es solo la aprobación del plan
  // (el modelo no podía escribir): no cuenta como intervención.
  const startedInPlan = user[0]?.info.agent === 'plan';
  const buildUser = user.filter((m) => m.info.agent !== 'plan');
  // Preguntas del modelo al usuario (herramienta `question`). En la fase plan son parte del flujo (el agente plan
  // está para aclarar antes de aprobar) y no cuentan; en build sí: el modelo se paró a pedir input humano.
  const questionAgents = msgs.flatMap((m) =>
    (m.parts ?? []).filter((p) => p.type === 'tool' && p.tool === 'question').map(() => m.info.agent),
  );
  const questions = questionAgents.filter((a) => a !== 'plan').length;
  const planQuestions = questionAgents.length - questions;
  // La fase plan es libre (conversación con el usuario antes de aprobar): solo cuentan los mensajes en build
  // después del primero, que es la aprobación del plan.
  const userMsgInterventions = startedInPlan ? Math.max(0, buildUser.length - 1) : user.length - 1;
  const interventions = userMsgInterventions + questions;
  // Pasos cortados por el límite de tokens de salida (típico de variantes con mucho razonamiento).
  const truncations = asst.filter((m) => m.info.finish === 'length').length;

  const start = user[0]?.info.time.created ?? root.info.time.created;
  const end = last?.info.time?.completed ?? now;
  const activeMs = asst.reduce((s, m) => s + ((m.info.time?.completed ?? now) - m.info.time.created), 0);

  return {
    id: rootId,
    childSessions: ids.length - 1,
    title: root.info.title,
    models: [...models],
    variant: root.info.model?.variant ?? last?.info.variant ?? null,
    inProgress,
    lastFinish: last?.info.finish ?? null,
    wallMs: end - start,
    activeMs,
    userMessages: user.length,
    interventions: Math.max(0, interventions),
    questions,
    planQuestions,
    startedInPlan,
    truncations,
    steps,
    toolCalls: Object.values(tools).reduce((a, b) => a + b, 0),
    toolErrors,
    tools,
    errors,
    tokens,
    cost,
    isolation: isolationReport(exports, dir, slug),
    quotaError: errors.some((e) => QUOTA_RE.test(e)) || logQuotaErrors(ids).length > 0,
    // El proveedor rechazó el modelo (403 opt-in de datos, 401, modelo no disponible…): no llegó a responder nunca.
    accessError: errors.map(accessErrorMessage).find(Boolean) ?? null,
    quotaLog: logQuotaErrors(ids).slice(0, 3),
  };
}

// opencode reintenta los 429 (hasta 5 veces, respetando retry-after) y mientras tanto el error no se guarda en la
// sesión; sí queda cada intento fallido en su log, con el id de la sesión.
const OPENCODE_LOG_DIR = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'opencode', 'log');

function logQuotaErrors(sessionIds) {
  if (!fs.existsSync(OPENCODE_LOG_DIR)) return [];
  const recent = fs
    .readdirSync(OPENCODE_LOG_DIR)
    .filter((f) => f.endsWith('.log'))
    .map((f) => path.join(OPENCODE_LOG_DIR, f))
    .filter((f) => Date.now() - fs.statSync(f).mtimeMs < 2 * 86_400_000);
  const hits = [];
  for (const f of recent) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.includes('level=ERROR') || !QUOTA_RE.test(line)) continue;
      if (sessionIds.some((id) => line.includes(id))) hits.push(line.slice(0, 300));
    }
  }
  return hits;
}

// ¿La sesión chocó con la cuota/límite del proveedor? (BD + log de opencode, sin export)
// Error de acceso del proveedor (no reintentable y no de cuota): 401/403/404 o mensajes equivalentes.
function accessErrorMessage(errorJson) {
  const s = String(errorJson);
  if (QUOTA_RE.test(s)) return null;
  if (!/"statusCode":\s*(401|403|404)\b|opt.?in|unauthori[sz]ed|forbidden|model[^"]{0,40}not (found|available|supported)/i.test(s)) return null;
  try {
    const e = JSON.parse(s);
    return e?.data?.message ?? e?.message ?? s.slice(0, 200);
  } catch {
    return /"message":"([^"]+)"/.exec(s)?.[1] ?? s.slice(0, 200);
  }
}

function sessionAccessError(sessionId) {
  return db(
    `select json_extract(data, '$.error') as error from message where session_id = ${sqlStr(sessionId)} ` +
      `and json_extract(data, '$.role') = 'assistant' and json_extract(data, '$.error') is not null`,
  ).map((r) => accessErrorMessage(r.error)).find(Boolean) ?? null;
}

function sessionQuotaError(sessionId) {
  const inDb = db(
    `select json_extract(data, '$.error') as error from message where session_id = ${sqlStr(sessionId)} ` +
      `and json_extract(data, '$.role') = 'assistant' and json_extract(data, '$.error') is not null`,
  ).some((r) => QUOTA_RE.test(String(r.error)));
  return inDb || logQuotaErrors([sessionId]).length > 0;
}

// ---------- verificación del proyecto generado ----------

function findProjectDir(dir, depth = 3) {
  const queue = [[dir, 0]];
  while (queue.length) {
    const [d, lvl] = queue.shift();
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    if (lvl >= depth) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory() && !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.')) queue.push([path.join(d, e.name), lvl + 1]);
    }
  }
  return null;
}

// Huella del código generado (sin node_modules ni lockfiles): si cambia, el veredicto del juez caduca.
function projectHash(dir) {
  const h = createHash('sha1');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (IGNORED_DIRS.has(e.name) || e.name === '__bench__' || /lock(\.json|\.yaml)?$/.test(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) h.update(path.relative(dir, p)).update('\0').update(fs.readFileSync(p)).update('\0');
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 12);
}

function listTsFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listTsFiles(p, out);
    else if (/\.[mc]?ts$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function runVitest(proj, tz) {
  const outFile = path.join(os.tmpdir(), `bench-vitest-${process.pid}-${Date.now()}.json`);
  const env = { ...process.env, CI: '1' };
  if (tz) env.TZ = tz;
  const r = sh(path.join(proj, 'node_modules', '.bin', 'vitest'), ['run', '--reporter=json', `--outputFile=${outFile}`], {
    cwd: proj,
    env,
    timeout: 5 * 60_000,
  });
  if (!fs.existsSync(outFile)) {
    return { ok: false, total: 0, passed: 0, failed: 0, error: (r.stderr || r.stdout || 'sin salida').slice(-1500) };
  }
  const j = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  fs.rmSync(outFile, { force: true });
  const failedNames = j.testResults
    .flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed').map((a) => a.fullName))
    .slice(0, 20);
  return {
    ok: r.status === 0 && j.numFailedTests === 0 && j.numFailedTestSuites === 0 && j.numTotalTests > 0,
    total: j.numTotalTests,
    passed: j.numPassedTests,
    failed: j.numFailedTests,
    failedSuites: j.numFailedTestSuites,
    failedNames,
  };
}

function checkProject(dir, test) {
  const proj = findProjectDir(dir);
  if (!proj) return { found: false };
  const cfg = testConfig(test);

  const notes = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(proj, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const extraDeps = deps.filter((d) => !ALLOWED_DEPS.some((re) => re.test(d)));

  if (!fs.existsSync(path.join(proj, 'node_modules'))) {
    notes.push('faltaba node_modules: npm install');
    sh('npm', ['install', '--no-audit', '--no-fund'], { cwd: proj, stdio: 'ignore', timeout: 5 * 60_000 });
  }

  const hasVitest = fs.existsSync(path.join(proj, 'node_modules', '.bin', 'vitest'));
  const tests = hasVitest ? runVitest(proj) : { ok: false, total: 0, passed: 0, failed: 0, error: 'vitest no instalado' };
  const tzRuns = hasVitest ? Object.fromEntries(cfg.extraTzs.map((tz) => [tz, runVitest(proj, tz)])) : {};

  let tsc = null;
  const tscBin = path.join(proj, 'node_modules', '.bin', 'tsc');
  if (fs.existsSync(path.join(proj, 'tsconfig.json')) && fs.existsSync(tscBin)) {
    const r = sh(tscBin, ['--noEmit', '-p', 'tsconfig.json'], { cwd: proj, timeout: 3 * 60_000 });
    const errs = (r.stdout.match(/error TS\d+/g) ?? []).length;
    tsc = { ok: r.status === 0, errors: errs };
  }

  const files = listTsFiles(proj);
  const isTest = (f) => /\.(test|spec)\.[mc]?ts$/.test(f) || /[\\/](tests?|__tests__)[\\/]/.test(f);
  const loc = (fs_) => fs_.reduce((n, f) => n + fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length, 0);
  const srcFiles = files.filter((f) => !isTest(f) && !/(vitest|vite)\.config\./.test(f));
  const testFiles = files.filter(isTest);

  // Paquetes externos importados desde el código de la solución (no tests), y módulos prohibidos por la prueba
  // (p. ej. node:sqlite o child_process en el motor SQL).
  const externalImports = new Set();
  const forbiddenImports = new Set();
  const bare = (s) => s.replace(/^node:/, '');
  for (const f of srcFiles) {
    const code = fs.readFileSync(f, 'utf8');
    for (const [, spec] of code.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      if (cfg.forbiddenImports.some((x) => bare(x) === bare(spec))) forbiddenImports.add(`${spec} (${path.relative(proj, f)})`);
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!ALLOWED_IMPORTS.has(pkg)) externalImports.add(pkg);
    }
  }

  return {
    found: true,
    dir: rel(proj),
    hash: projectHash(proj),
    deps,
    extraDeps,
    externalImports: [...externalImports],
    forbiddenImports: [...forbiddenImports],
    tests,
    tzRuns,
    tsc,
    loc: { src: loc(srcFiles), test: loc(testFiles), srcFiles: srcFiles.length, testFiles: testFiles.length },
    notes,
  };
}

// ---------- comandos ----------

function collect(slug, opts) {
  const model = modelBySlug(slug);
  const dir = workDir(slug, opts.test);
  if (!fs.existsSync(dir)) return log(`· ${slug}: no existe ${rel(dir)}`);

  const roots = rootSessions(dir);
  if (!roots.length) return opts.quiet ? null : log(`· ${slug}: sin sesiones de opencode en ${rel(dir)}`);

  const sessionId = opts.session ?? roots.at(-1).id;
  if (roots.length > 1 && !opts.session) {
    const others = roots.slice(0, -1).map((r) => `${r.id}${r.tokens ? ` (${fmtTok(r.tokens)} tokens)` : ' (vacía)'}`);
    log(`! ${slug}: ${roots.length} sesiones en la carpeta, uso la más reciente (${sessionId}). Otras: ${others.join(', ')}`);
  }

  const session = sessionMetrics(sessionId, dir, slug);
  if (session.inProgress && !opts.force) {
    return log(`⏳ ${slug}: la sesión ${sessionId} parece en curso. Espera a que termine o usa --force.`);
  }

  const warnings = [];
  if (!session.models.some((m) => m.startsWith(model.id))) {
    warnings.push(`modelo usado (${session.models.join(', ')}) ≠ esperado (${model.id})`);
  }
  if (session.models.length > 1) warnings.push(`varios modelos en la sesión: ${session.models.join(', ')}`);
  const usedVariants = [...new Set(session.models.map((m) => /\((.+)\)$/.exec(m)?.[1] ?? 'default'))];
  if (usedVariants.some((v) => v !== expectedVariant(model))) {
    warnings.push(`variante ${usedVariants.join('/')} ≠ esperada ${expectedVariant(model)} (no comparable con el resto)`);
  }
  if (opts.timedOut) warnings.push(`timeout de ${opts.timeout} min alcanzado`);
  const iso = session.isolation;
  if (iso.leaked) {
    const what = iso.externalAccess.filter((a) => a.kind === 'repo' && !a.blocked).map((a) => `${a.tool} ${a.target}`);
    warnings.push(`CONTAMINADO: accedió a rutas del repo fuera de su carpeta (${what.join(', ')})`);
  }
  if (iso.editorContext.length) warnings.push('opencode inyectó contexto del editor (fichero abierto/selección) en el prompt');
  if (session.truncations) warnings.push(`${session.truncations} respuesta(s) cortada(s) por el límite de tokens de salida`);
  if (session.questions) warnings.push(`hizo ${session.questions} pregunta(s) al usuario durante la construcción (herramienta question)`);

  log(`… ${slug}: verificando proyecto (vitest ×${1 + testConfig(opts.test).extraTzs.length}, tsc)`);
  const project = checkProject(dir, opts.test);
  if (project.forbiddenImports?.length) warnings.push(`usa módulos prohibidos por el enunciado: ${project.forbiddenImports.join(', ')} → nota 0`);

  // Cortado por cuota del proveedor y sin una solución que funcione: resultado no válido, hay que repetirlo.
  const quotaBlocked = !!session.quotaError && !(project.found && project.tests.ok);
  if (quotaBlocked) warnings.push('el proveedor rechazó peticiones por cuota/límite: resultado no válido, repetir tras el reinicio de la ventana');
  // Sin acceso al modelo y sin proyecto: no es culpa del modelo, no puntúa y queda pendiente.
  const accessBlocked = !!session.accessError && !project.found;
  if (accessBlocked) warnings.push(`el proveedor no da acceso al modelo: "${session.accessError}"`);

  // Detenido a mano antes de terminar (--stopped "motivo"): se valora lo que había hecho, con asterisco.
  const prev = readJson(resultFile(slug, opts.test));
  const stopped = typeof opts.stopped === 'string' ? opts.stopped : prev?.session?.id === session.id ? prev?.stopped : undefined;
  const progress = opts.progress != null ? Number(opts.progress) : prev?.session?.id === session.id ? prev?.progress : undefined;
  if (stopped) warnings.push(`no terminó${progress != null ? ` (≈${progress} % hecho)` : ''}: ${stopped}`);

  const result = {
    test: opts.test,
    slug,
    name: model.name,
    expectedModel: model.id,
    collectedAt: new Date().toISOString(),
    session,
    project,
    quotaBlocked,
    accessBlocked,
    ...(stopped ? { stopped, ...(progress != null ? { progress } : {}) } : {}),
    warnings,
  };
  fs.mkdirSync(resultsDir(opts.test), { recursive: true });
  fs.writeFileSync(resultFile(slug, opts.test), JSON.stringify(result, null, 2) + '\n');

  const t = project.tests;
  log(
    `${project.found && t.ok ? '✅' : '❌'} ${slug}: tests ${t ? `${t.passed}/${t.total}` : 'n/a'} · ` +
      `${fmtDur(session.activeMs)} activos · ${fmtTok(session.tokens.input)} in / ${fmtTok(session.tokens.output)} out · ${fmtCost(session.cost)}`,
  );
  for (const w of warnings) log(`   ! ${w}`);
  report(opts); // la tabla refleja cada modelo en cuanto se recoge, sin esperar al resto
  return result;
}

// Autopiloto: reproduce el flujo manual sin intervención humana.
//   1. prompt con el agente plan  →  2. "Sí" con el agente build (aprobación, no cuenta)
//   3. si no hay proyecto o los tests no pasan, "Continúa" hasta MAX_NUDGES veces (cada uno cuenta como intervención)
//   4. collect + judge
// En `opencode run` la herramienta question (y plan_enter/plan_exit) está denegada: el modelo decide solo.
const MAX_NUDGES = 2;

function quickCheck(dir) {
  const proj = findProjectDir(dir);
  if (!proj) return { ok: false, reason: 'no hay proyecto' };
  if (!fs.existsSync(path.join(proj, 'node_modules', '.bin', 'vitest'))) return { ok: false, reason: 'vitest no instalado' };
  const t = runVitest(proj);
  return t.ok ? { ok: true } : { ok: false, reason: `tests ${t.passed}/${t.total} (${t.failedSuites ?? 0} ficheros con error)` };
}

function run(slug, opts) {
  opts = { ...opts, timeout: Number(opts.timeout ?? testConfig(opts.test).timeout) };
  const model = modelBySlug(slug);
  const dir = workDir(slug, opts.test);
  fs.mkdirSync(dir, { recursive: true });

  const existing = fs.readdirSync(dir).filter((f) => f !== '.gitkeep');
  if (existing.length && !opts.force) {
    return log(`· ${slug}: ${rel(dir)} no está vacía, la salto (--force para lanzar igualmente)`);
  }

  const variant = opts.variant ?? model.variant;
  const base = ['run', '--dir', dir, '-m', model.id, '--auto', ...(variant ? ['--variant', variant] : [])];
  const deadline = Date.now() + Number(opts.timeout) * 60_000;
  const step = (label, args) => {
    const left = deadline - Date.now();
    if (left <= 0) return { timedOut: true };
    log(`\n━━━ ${model.name} · ${label} ━━━`);
    const r = spawnSync('opencode', [...base, ...args], {
      cwd: dir,
      env: benchEnv(),
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: left,
      killSignal: 'SIGINT',
    });
    if (r.error && r.error.code !== 'ETIMEDOUT') throw r.error;
    if (r.status) log(`   ! opencode terminó con código ${r.status}`);
    return { timedOut: r.error?.code === 'ETIMEDOUT' };
  };

  log(`▶ ${model.name} (${model.id}, variante ${variant ?? 'default'}) · autopiloto · timeout ${opts.timeout} min`);
  startRun(slug, opts.test);
  try {
    const t0 = Date.now();
    let res = step('plan', ['--agent', 'plan', '--title', `${opts.test} · ${model.name}`, readPrompt(opts.test)]);
    const session = rootSessions(dir).filter((s) => s.time_created >= t0 - 5_000).at(-1);
    if (!session) throw new Error('opencode no creó ninguna sesión');

    if (!res.timedOut) res = step('build (plan aprobado)', ['--agent', 'build', '--session', session.id, 'Sí']);
    for (let nudge = 1; !res.timedOut && nudge <= MAX_NUDGES; nudge++) {
      const check = quickCheck(dir);
      if (check.ok) break;
      if (sessionQuotaError(session.id)) {
        log('   ⛔ el proveedor rechaza por cuota/límite: no insisto');
        break;
      }
      const access = sessionAccessError(session.id);
      if (access) {
        log(`   ⛔ el proveedor no da acceso al modelo ("${access}"): no insisto`);
        break;
      }
      log(`   ↻ ${check.reason} → "Continúa" (${nudge}/${MAX_NUDGES}, cuenta como intervención)`);
      res = step(`build (continúa ${nudge})`, ['--agent', 'build', '--session', session.id, 'Continúa']);
    }
    if (res.timedOut) log(`   ⏱ timeout de ${opts.timeout} min`);

    log(`\n■ ${model.name}: recogiendo resultados…`);
    const result = collect(slug, { ...opts, session: session.id, force: true, timedOut: res.timedOut });
    if (result?.project.found && !opts['no-judge']) judge(slug, { ...opts, force: false });
    return result;
  } finally {
    endRun(slug, opts.test);
  }
}

// Varios modelos en paralelo: un proceso hijo por modelo, salida en results/<slug>.run.log.
async function runParallel(slugs, opts) {
  const { spawn } = await import('node:child_process');
  const n = Math.max(1, Number(opts.parallel));
  const pass = ['--test', opts.test, ...(opts.timeout ? ['--timeout', String(opts.timeout)] : [])];
  if (opts.force) pass.push('--force');
  if (opts['no-judge']) pass.push('--no-judge');
  if (opts.judge) pass.push('--judge', opts.judge);
  fs.mkdirSync(resultsDir(opts.test), { recursive: true });

  const queue = [...slugs];
  let stop = false;
  const worker = async () => {
    while (!stop && queue.length) {
      const slug = queue.shift();
      const logFile = path.join(resultsDir(opts.test), `${slug}.run.log`);
      log(`▶ ${slug} · log: ${rel(logFile)}`);
      const out = fs.openSync(logFile, 'w');
      const code = await new Promise((resolve) => {
        spawn(process.execPath, [fileURLToPath(import.meta.url), 'run', slug, ...pass], { stdio: ['ignore', out, out] })
          .on('exit', resolve);
      });
      fs.closeSync(out);
      const j = readJson(judgeFile(slug, opts.test));
      const r = readJson(resultFile(slug, opts.test));
      const sc = computeScore(r, j);
      log(`${code === 0 ? '■' : '💥'} ${slug}: ${r?.quotaBlocked ? '⛔ cuota' : sc ? `nota ${sc.total.toFixed(1)}` : 'sin nota'} (código ${code})`);
      if (r?.quotaBlocked && !stop) {
        stop = true;
        log('⛔ Cuota del proveedor agotada: no lanzo más modelos (los que están en marcha terminan).');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, slugs.length) }, worker));
  if (stop) {
    const blocked = slugs.filter((s) => readJson(resultFile(s, opts.test))?.quotaBlocked);
    log(`\nCuando se reinicie la ventana de 5 h, vacía las carpetas cortadas y vuelve a lanzar:`);
    if (blocked.length) log(`  for s in ${blocked.join(' ')}; do rm -rf models/$s/${opts.test} && mkdir -p models/$s/${opts.test}; done`);
    log(`  node scripts/bench.mjs run --all --parallel ${n}`);
  }
}

// Deja un modelo listo para repetirlo desde cero sin borrar nada: su carpeta de trabajo y sus resultados se mueven
// a results/archive/<slug>-<fecha>/ y la carpeta queda vacía (con fecha de creación nueva, así las sesiones
// anteriores no cuentan como "en uso").
function reset(slug, opts) {
  modelBySlug(slug);
  if (isRunning(slug, opts.test)) return log(`· ${slug}: está en ejecución, no lo toco`);
  const dir = workDir(slug, opts.test);
  const dest = path.join(resultsDir(opts.test), 'archive', `${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(dest, { recursive: true });
  if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f !== '.gitkeep')) {
    fs.renameSync(dir, path.join(dest, 'workdir'));
  } else {
    fs.rmSync(dir, { recursive: true, force: true }); // vacía (solo .gitkeep): se recrea para renovar su fecha
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.gitkeep'), '');
  for (const f of [`${slug}.json`, `${slug}.judge.json`, `${slug}.adapter.ts`, `${slug}.judge-error.json`, `${slug}.run.log`]) {
    const src = path.join(resultsDir(opts.test), f);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(dest, f));
  }
  log(`↺ ${slug}: carpeta y resultados archivados en ${rel(dest)}; queda pendiente para run`);
}

// TUI interactiva en el entorno aislado, con modelo, agente y prompt ya puestos. Al salir, recoge métricas.
function open(slug, opts) {
  const model = modelBySlug(slug);
  const dir = workDir(slug, opts.test);
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).filter((f) => f !== '.gitkeep');
  if (existing.length && !opts.force) {
    return log(`· ${slug}: ${rel(dir)} no está vacía (${existing.join(', ')}). Usa --force para abrirla igualmente.`);
  }
  const agent = opts.agent ?? 'plan';
  setTuiVariant(model);
  log(`▶ ${model.name} (${model.id}) · variante ${expectedVariant(model)} · agente ${agent} · aislado (sin editor, sin acceso fuera de ${rel(dir)})`);
  log(`  No cambies la variante en la TUI. Al salir se ejecuta collect${opts['no-judge'] ? '' : ' + judge'}.`);
  startRun(slug, opts.test);
  try {
    const r = spawnSync('opencode', [dir, '-m', model.id, '--agent', agent, '--prompt', readPrompt(opts.test)], {
      cwd: dir,
      env: benchEnv(),
      stdio: 'inherit',
    });
    if (r.error) throw r.error;

    log(`\n■ ${model.name}: TUI cerrada, recogiendo resultados…`);
    const result = collect(slug, { ...opts, force: false });
    if (!result) return; // sesión en curso o sin sesión: no hay nada que juzgar todavía
    if (!result.project.found) return log(`· ${slug}: sin proyecto, nota 0 (no se juzga)`);
    if (!opts['no-judge']) judge(slug, { ...opts, force: false });
  } finally {
    endRun(slug, opts.test);
  }
}

// ---------- juez + suite oculta ----------

const judgeDir = (test) => path.join(ROOT, 'benchmarks', test, 'judge');
const judgeFile = (slug, test) => path.join(resultsDir(test), `${slug}.judge.json`);

// Copia del proyecto fuera del repo (el juez no ve la suite oculta ni otras soluciones).
function copyProject(src, dst) {
  for (const e of fs.readdirSync(src)) {
    if (e === 'node_modules' || e === '.git' || e === '__bench__') continue;
    fs.cpSync(path.join(src, e), path.join(dst, e), { recursive: true });
  }
}

function prepareEval(slug, test, projDir) {
  const evalDir = path.join(os.tmpdir(), 'opencode-bench', test, slug);
  fs.rmSync(evalDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(evalDir, '__bench__'), { recursive: true });
  copyProject(projDir, evalDir);
  fs.symlinkSync(path.join(projDir, 'node_modules'), path.join(evalDir, 'node_modules'), 'dir');
  fs.cpSync(path.join(judgeDir(test), 'bench'), path.join(evalDir, '__bench__'), { recursive: true });
  return evalDir;
}

// Descarta cualquier cambio del juez fuera de __bench__: la suite oculta corre sobre el código original.
function restoreProject(projDir, evalDir) {
  for (const e of fs.readdirSync(evalDir)) {
    if (e !== 'node_modules' && e !== '__bench__') fs.rmSync(path.join(evalDir, e), { recursive: true, force: true });
  }
  copyProject(projDir, evalDir);
}

function runJudge(evalDir, spec, prompt) {
  const t0 = Date.now();
  const meta = { judge: spec };
  let r;
  if (spec.startsWith('claude')) {
    const model = spec.split(':')[1] || 'sonnet';
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const tools = ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash(node_modules/.bin/vitest:*)', 'Bash(npx vitest:*)',
      'Bash(node_modules/.bin/tsc:*)', 'Bash(npx tsc:*)', 'Bash(ls:*)', 'Bash(cat:*)'];
    r = shToFile('claude', ['-p', '--model', model, '--output-format', 'json', '--permission-mode', 'acceptEdits',
      '--allowedTools', tools.join(','), '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
      '--setting-sources', 'project', '--max-budget-usd', '5'], { cwd: evalDir, env, input: prompt, timeout: 20 * 60_000 });
    try {
      const out = JSON.parse(r.stdout);
      Object.assign(meta, {
        cost: out.total_cost_usd,
        turns: out.num_turns,
        isError: out.is_error,
        usage: out.usage,
        // Para diagnosticar juicios fallidos: último mensaje del juez y permisos denegados.
        result: typeof out.result === 'string' ? out.result.slice(-1500) : undefined,
        permissionDenials: out.permission_denials?.length ? out.permission_denials.slice(0, 10) : undefined,
      });
    } catch {
      meta.rawOutput = r.stdout.slice(-2000);
    }
  } else {
    r = shToFile('opencode', ['run', '--dir', evalDir, '-m', spec, '--auto', '--title', 'bench judge', prompt], {
      cwd: evalDir,
      timeout: 20 * 60_000,
    });
    meta.rawOutput = r.stdout.slice(-2000);
  }
  meta.durationMs = Date.now() - t0;
  meta.exitCode = r.status;
  if (r.error?.code === 'ETIMEDOUT') meta.timedOut = true;
  if (r.status !== 0) meta.stderr = (r.stderr || '').slice(-2000);
  return meta;
}

function validateVerdict(v) {
  const problems = [];
  if (!v || typeof v !== 'object') return ['judge.json vacío o no es un objeto'];
  if (typeof v.adapter?.ok !== 'boolean') problems.push('adapter.ok');
  if (!v.coverage || typeof v.coverage !== 'object') problems.push('coverage');
  for (const k of ['codeQuality', 'testQuality']) {
    if (typeof v[k]?.score !== 'number' || v[k].score < 0 || v[k].score > 10) problems.push(`${k}.score`);
  }
  return problems;
}

function vitestCases(evalDir, testFile, pattern, timeoutMs) {
  const out = path.join(os.tmpdir(), `bench-hidden-${process.pid}-${Date.now()}.json`);
  const args = ['run', '--config', '__bench__/vitest.config.mjs', '--root', evalDir, '--reporter=json', `--outputFile=${out}`,
    `__bench__/${testFile}`];
  if (pattern) args.push('-t', pattern);
  sh(path.join(evalDir, 'node_modules', '.bin', 'vitest'), args, { cwd: evalDir, env: { ...process.env, CI: '1' }, timeout: timeoutMs });
  const j = readJson(out);
  fs.rmSync(out, { force: true });
  if (!j) return null;
  const file = j.testResults.find((f) => f.name.endsWith(testFile));
  const byId = new Map();
  for (const a of file?.assertionResults ?? []) {
    const id = /^\[(\d+)\]/.exec(a.title)?.[1];
    if (id) byId.set(id, { passed: a.status === 'passed', message: (a.failureMessages?.[0] ?? '').split('\n').slice(0, 6).join('\n').slice(0, 600) });
  }
  return { byId, suiteMessage: (file?.message ?? '').slice(0, 600) };
}

// Cada fichero hidden*.test.ts es una suite (hidden.test.ts = main, hidden-perf.test.ts = perf…) con sus casos
// (campo `suite` de cases.json) y su timeout: una implementación lenta en rendimiento no bloquea la funcional.
function runHidden(evalDir, test) {
  const cfg = testConfig(test);
  const hiddenDir = path.join(judgeDir(test), 'hidden');
  fs.cpSync(hiddenDir, path.join(evalDir, '__bench__'), { recursive: true });
  const cases = readJson(path.join(hiddenDir, 'cases.json'));
  const files = fs.readdirSync(hiddenDir).filter((f) => /^hidden.*\.test\.ts$/.test(f)).sort();
  const results = new Map();
  const modes = [];
  for (const file of files) {
    const suite = file === 'hidden.test.ts' ? 'main' : file.replace(/^hidden-/, '').replace(/\.test\.ts$/, '');
    const ids = cases.filter((c) => (c.suite ?? 'main') === suite).map((c) => c.id);
    let run = vitestCases(evalDir, file, null, cfg.hiddenTimeoutMs[suite] ?? 120_000);
    if (!run) {
      // Se colgó o reventó (bucle infinito síncrono, implementación muy lenta…): caso a caso con timeout propio.
      modes.push(`${suite}: caso a caso (la ejecución completa se colgó)`);
      const byId = new Map();
      for (const id of ids) {
        const one = vitestCases(evalDir, file, `^\\[${id}\\]`, cfg.hiddenCaseTimeoutMs[suite] ?? 30_000);
        byId.set(id, one?.byId.get(id) ?? { passed: false, message: 'timeout o caída del proceso' });
      }
      run = { byId, suiteMessage: '' };
    }
    for (const id of ids) results.set(id, run.byId.get(id) ?? { passed: false, message: run.suiteMessage || 'no se ejecutó' });
  }
  const out = cases.map((c) => ({ id: c.id, name: c.name, category: c.category, ...results.get(c.id) }));
  return { mode: modes.join('; ') || 'completa', total: cases.length, passed: out.filter((x) => x.passed).length, cases: out };
}

function judge(slug, opts) {
  const model = modelBySlug(slug);
  const result = readJson(resultFile(slug, opts.test));
  if (!result) return log(`· ${slug}: primero ejecuta collect`);
  if (!result.project.found) return log(`· ${slug}: no hay proyecto que evaluar`);
  const projDir = path.join(ROOT, result.project.dir);

  const previous = readJson(judgeFile(slug, opts.test));
  const spec = opts.judge ?? DEFAULT_JUDGE;
  const evalDir = prepareEval(slug, opts.test, projDir);

  // Reutiliza veredicto y adaptador solo si el código no ha cambiado desde que se juzgó.
  // Sin huella no se puede saber si el código es el mismo: se vuelve a juzgar.
  const sameCode = Boolean(previous?.projectHash) && previous.projectHash === result.project.hash;
  if (previous && !sameCode) log(`… ${slug}: el código cambió desde el último veredicto, vuelvo a juzgar`);
  let verdict, meta, adapter;
  if (previous && sameCode && !opts.force) {
    log(`… ${slug}: reutilizo el veredicto de ${previous.meta.judge} (--force para volver a juzgar)`);
    ({ verdict, meta, adapter } = previous);
    fs.writeFileSync(path.join(evalDir, '__bench__', 'adapter.ts'), adapter);
  } else {
    const prompt = fs
      .readFileSync(path.join(judgeDir(opts.test), 'JUDGE.md'), 'utf8')
      .replace('{{PROMPT}}', fs.readFileSync(path.join(ROOT, 'benchmarks', opts.test, 'PROMPT.md'), 'utf8').trim());
    const vFile = path.join(evalDir, '__bench__', 'judge.json');
    const aFile = path.join(evalDir, '__bench__', 'adapter.ts');
    const errFile = path.join(resultsDir(opts.test), `${slug}.judge-error.json`);
    // El juez puede fallar de forma puntual (API saturada, error de red…): un reintento antes de rendirse.
    for (let attempt = 1; ; attempt++) {
      log(`⚖️  ${model.name}: juzgando con ${spec} en ${evalDir}${attempt > 1 ? ` (reintento ${attempt - 1})` : ''}`);
      fs.rmSync(vFile, { force: true });
      meta = runJudge(evalDir, spec, prompt);
      let problems;
      try {
        verdict = readJson(vFile);
        problems = validateVerdict(verdict);
      } catch (e) {
        problems = [`judge.json no es JSON válido: ${e.message}`];
      }
      if (!problems.length) break;
      const why = [meta.timedOut && 'timeout', meta.isError && 'is_error', meta.stderr, meta.rawOutput].filter(Boolean).join(' | ').slice(0, 500);
      fs.writeFileSync(errFile, JSON.stringify({ at: new Date().toISOString(), attempt, problems, meta }, null, 2) + '\n');
      if (attempt >= 2) {
        throw new Error(`el juez no dejó un judge.json válido (${problems.join(', ')}). Detalle: ${rel(errFile)}${why ? ` · ${why}` : ''}`);
      }
      log(`   ! el juez falló (${problems.join(', ')}${why ? ` · ${why.slice(0, 200)}` : ''}), reintento`);
    }
    fs.rmSync(errFile, { force: true });
    adapter = fs.existsSync(aFile) ? fs.readFileSync(aFile, 'utf8') : '';
    restoreProject(projDir, evalDir);
  }

  const hidden = adapter ? runHidden(evalDir, opts.test) : { mode: 'sin adaptador', total: 0, passed: 0, cases: [] };
  const out = { test: opts.test, slug, judgedAt: new Date().toISOString(), projectHash: result.project.hash, meta, verdict, hidden, adapter };
  fs.writeFileSync(judgeFile(slug, opts.test), JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(path.join(resultsDir(opts.test), `${slug}.adapter.ts`), adapter);

  const score = computeScore(result, out);
  log(
    `🎯 ${slug}: nota ${score.total.toFixed(1)} · suite oculta ${hidden.passed}/${hidden.total} · ` +
      `código ${verdict.codeQuality.score}/10 · tests ${verdict.testQuality.score}/10` +
      (meta.cost != null ? ` · juez $${meta.cost.toFixed(2)}` : ''),
  );
  for (const c of hidden.cases.filter((x) => !x.passed)) log(`   ✗ [${c.id}] ${c.name}`);
  report(opts); // la nota aparece en cuanto se juzga este modelo, sin esperar al resto
}

// ---------- nota 0-10 (ver RUBRIC.md) ----------

const round2 = (n) => Math.round(n * 100) / 100;

const ZERO_PARTS = { correctness: 0, autonomy: 0, ownTests: 0, ownTestsDetail: { pass: 0, coverage: 0, quantity: 0, quality: 0 }, codeQuality: 0, robustness: 0, penalty: 0 };

// Pesos por prueba (bench.json). Dentro de cada bloque las proporciones son fijas:
//   tests propios = ¼ pasan + ¼ cobertura (juez) + ¼ cantidad (10+ tests) + ¼ calidad (juez)
//   robustez      = ½ otras TZ + ¼ tsc + ¼ sin deps extra   (sin TZ extra: ½ tsc + ½ deps)
function computeScore(r, j) {
  if (r?.quotaBlocked || r?.accessBlocked) return null; // no válido: no es culpa del modelo, se repite
  // Sesión terminada sin proyecto (se bloqueó, se cortó…): 0, no "sin nota".
  if (r && !r.session.inProgress && !r.project?.found) return { total: 0, reason: 'no generó un proyecto', parts: ZERO_PARTS };
  if (r?.project?.forbiddenImports?.length) {
    return { total: 0, reason: `usa módulos prohibidos por el enunciado (${r.project.forbiddenImports.join(', ')})`, parts: ZERO_PARTS };
  }
  if (!r?.project?.found || !j?.verdict) return null;
  const W = testConfig(r.test).weights;
  const p = r.project;
  const s = r.session;
  const v = j.verdict;
  const t = p.tests;

  const correctness = v.adapter.ok && j.hidden.total ? (W.correctness * j.hidden.passed) / j.hidden.total : 0;

  const blocked = s.inProgress || !!r.stopped || r.warnings.some((w) => w.startsWith('timeout'));
  const interventions = s.interventions ?? s.userMessages - 1;
  const autonomy = W.autonomy * (blocked ? 0 : interventions === 0 ? 1 : interventions === 1 ? 0.5 : 0);

  const q = W.ownTests / 4;
  const cov = Object.values(v.coverage ?? {});
  const ownPass = q * (t.ok ? 1 : t.total ? (0.5 * t.passed) / t.total : 0);
  const ownCoverage = cov.length ? (q * cov.filter(Boolean).length) / cov.length : 0;
  const ownQuantity = q * Math.min(t.total / 10, 1);
  const ownQuality = (q * v.testQuality.score) / 10;
  const ownTests = ownPass + ownCoverage + ownQuantity + ownQuality;

  const codeQuality = (W.codeQuality * v.codeQuality.score) / 10;

  const tz = Object.values(p.tzRuns ?? {});
  const tscScore = p.tsc == null ? 0.4 : p.tsc.ok ? 1 : 0;
  const depsScore = p.extraDeps.length ? 0 : 1;
  const robustness =
    W.robustness *
    (tz.length ? (0.5 * tz.filter((x) => x.ok).length) / tz.length + 0.25 * tscScore + 0.25 * depsScore : 0.5 * tscScore + 0.5 * depsScore);

  const penalty = p.externalImports?.length ? -1.5 : 0;
  const total = Math.max(0, Math.min(10, correctness + autonomy + ownTests + codeQuality + robustness + penalty));

  return {
    total: Math.round(total * 10) / 10,
    ...(r.stopped ? { stopped: r.stopped, progress: r.progress ?? null } : {}),
    parts: {
      correctness: round2(correctness),
      autonomy: round2(autonomy),
      ownTests: round2(ownTests),
      ownTestsDetail: { pass: round2(ownPass), coverage: round2(ownCoverage), quantity: round2(ownQuantity), quality: round2(ownQuality) },
      codeQuality: round2(codeQuality),
      robustness: round2(robustness),
      penalty,
    },
  };
}

// ---------- RESULTS.md ----------

// Cada columna recibe (resultado de collect, modelo, resultado del juez, nota).
const AUTO_COLUMNS = [
  ['Modelo', (r, m) => m.name],
  ['Nota', (r, m, j, sc) => (sc ? `**${sc.total.toFixed(1)}**${sc.stopped ? '\\*' : ''}` : '')],
  ['Estado', (r, m) => (m.running ? '⏳ ejecutando' : status(r))],
  ['Suite oculta', (r, m, j) => (j ? `${j.hidden.passed}/${j.hidden.total}` : '')],
  ['Cód.', (r, m, j) => j?.verdict.codeQuality.score ?? ''],
  ['Cal. tests', (r, m, j) => j?.verdict.testQuality.score ?? ''],
  ['Cobertura', (r, m, j) => {
    const cov = Object.values(j?.verdict.coverage ?? {});
    return cov.length ? `${cov.filter(Boolean).length}/${cov.length}` : '';
  }],
  ['Aislamiento', (r) => {
    const iso = r?.session.isolation;
    if (!iso) return '';
    const flags = [];
    if (iso.leaked) flags.push('⚠️ accedió');
    else if (iso.externalAccess.some((a) => a.kind === 'repo')) flags.push('🔒 intentó');
    if (iso.explored) flags.push('👀 fuera');
    if (iso.editorContext.length) flags.push('ℹ️ editor');
    return flags.join(' ') || '✅';
  }],
  ['Tests', (r) => (r?.project.found ? `${r.project.tests.passed}/${r.project.tests.total}` : '')],
  ['Otras TZ', (r) => {
    if (!r?.project.found) return '';
    const runs = Object.entries(r.project.tzRuns ?? {});
    const bad = runs.filter(([, v]) => !v.ok).map(([tz]) => tz);
    return bad.length ? `❌ ${bad.join(', ')}` : runs.length ? '✅' : '—';
  }],
  ['tsc', (r) => (!r?.project.found ? '' : r.project.tsc == null ? '—' : r.project.tsc.ok ? '✅' : `❌ ${r.project.tsc.errors}`)],
  ['Deps extra', (r) => (!r?.project.found ? '' : r.project.extraDeps.length ? r.project.extraDeps.join(', ') : 'ninguna')],
  ['LOC src/test', (r) => (r?.project.found ? `${r.project.loc.src}/${r.project.loc.test}` : '')],
  ['T. activo', (r) => fmtDur(r?.session.activeMs)],
  ['T. total', (r) => fmtDur(r?.session.wallMs)],
  ['Intervenciones', (r) => {
    if (!r) return '';
    const s = r.session;
    const tags = [
      s.startedInPlan && (s.planQuestions ? `plan, ${s.planQuestions} preg. plan` : 'plan'),
      s.questions && `${s.questions} preg.`,
      s.truncations && `${s.truncations} corte`,
    ].filter(Boolean);
    return `${s.interventions ?? s.userMessages - 1}${tags.length ? ` (${tags.join(', ')})` : ''}`;
  }],
  ['Pasos', (r) => r?.session.steps ?? ''],
  ['Tools (err)', (r) => (r ? `${r.session.toolCalls} (${r.session.toolErrors})` : '')],
  ['Tok. in', (r) => fmtTok(r?.session.tokens.input)],
  ['Tok. out', (r) => fmtTok(r?.session.tokens.output)],
  ['Tok. razon.', (r) => fmtTok(r?.session.tokens.reasoning)],
  ['Tok. caché', (r) => fmtTok(r?.session.tokens.cacheRead)],
  ['Coste', (r) => fmtCost(r?.session.cost)],
  ['Variante', (r) => r?.session.variant ?? (r ? 'default' : '')],
];
const AUTO_HEADERS = AUTO_COLUMNS.map(([h]) => h);
const RETIRED_HEADERS = ['Msgs usuario']; // columnas automáticas antiguas: no se conservan como manuales

function status(r) {
  if (!r) return '';
  if (r.quotaBlocked) return '⛔ cuota (repetir)';
  if (r.accessBlocked) return '⛔ sin acceso al modelo';
  if (r.stopped) return `⏹ no terminó${r.progress != null ? ` (≈${r.progress} %)` : ''}\\*`;
  const w = r.warnings.length ? ' ⚠️' : '';
  if (r.session.inProgress) return `⏳ incompleta${w}`;
  if (!r.project.found) return r.session.truncations ? '⛔ cortado sin proyecto' : '⛔ sin proyecto';
  return (r.project.tests.ok ? '✅' : '❌') + w;
}

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());

// Una fila por modelo de la prueba (los excluidos solo si tienen resultado): collect, juez y nota.
// Experimentos: los que tienen resultado en la prueba (o están en marcha), ordenados por nombre.
function testRows(test) {
  const row = (m) => {
    if (isRunning(m.slug, test)) return { m: { ...m, running: true }, r: null, j: null, sc: null };
    const r = readJson(resultFile(m.slug, test));
    const j = readJson(judgeFile(m.slug, test));
    return { m, r, j, sc: computeScore(r, j) };
  };
  if (!EXP) {
    const excluded = new Set(testConfig(test).excludeModels ?? []);
    return MODELS.filter((m) => !excluded.has(m.slug) || fs.existsSync(resultFile(m.slug, test))).map(row);
  }
  return EXP.models
    .filter((m) => fs.existsSync(resultFile(m.slug, test)) || isRunning(m.slug, test))
    .map(row)
    .sort((a, b) => a.m.name.localeCompare(b.m.name));
}

const EXP_INTRO = (test) =>
  `Pruebas no vinculantes con modelos por la API directa de su proveedor. No entran en la clasificación oficial ` +
  `ni en la web. Enunciado, rúbrica y suite oculta: los de [benchmarks/${test}](../../benchmarks/${test}/).`;

function report(opts) {
  const file = path.join(reportDir(opts.test), 'RESULTS.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8')
    : EXP ? `# Experimentos · ${opts.test} — Resultados\n\n${EXP_INTRO(opts.test)}\n\n`
    : `# ${opts.test} — Resultados\n\n`;
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith('|'));
  let end = start;
  while (start >= 0 && end < lines.length && lines[end].trim().startsWith('|')) end++;

  // Columnas manuales: todas las de la tabla actual que no genera el script (se conservan tal cual).
  let manualHeaders = ['Notas'];
  const manualByModel = new Map();
  if (start >= 0) {
    const headers = splitRow(lines[start]);
    manualHeaders = headers.filter((h) => !AUTO_HEADERS.includes(h) && !RETIRED_HEADERS.includes(h));
    for (const line of lines.slice(start + 2, end)) {
      const cells = splitRow(line);
      const byHeader = Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
      manualByModel.set(byHeader.Modelo, byHeader);
    }
  }

  const rows = testRows(opts.test);

  const headers = [...AUTO_HEADERS, ...manualHeaders];
  const table = [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`];
  for (const { m, r, j, sc } of rows) {
    const auto = AUTO_COLUMNS.map(([, fn]) => cell(fn(r, m, j, sc)));
    const manual = manualHeaders.map((h) => manualByModel.get(m.name)?.[h] ?? '');
    table.push(`| ${[...auto, ...manual].join(' | ')} |`);
  }

  const out = start >= 0 ? [...lines.slice(0, start), ...table, ...lines.slice(end)] : [...lines, ...table, ''];
  writeAtomic(file, out.join('\n'));
  log(`📝 ${rel(file)} actualizado`);
  writeDetails(opts.test, rows);
  writeChartReport(opts.test, rows, opts.fragment);
}

// Informe gráfico (nota frente a coste/tokens/pasos/tiempo, frontera de eficiencia y clasificación ordenable).
// La plantilla es un fragmento HTML autocontenido; aquí se le inyectan los datos de la prueba.
function reportData(test, rows) {
  const cases = readJson(path.join(judgeDir(test), 'hidden', 'cases.json')) ?? [];
  const judges = [...new Set(rows.map((x) => x.j?.meta?.judge).filter(Boolean))];
  const plainCats = (list) => byCategory(list).replace(/\*\*/g, '') || null;
  const cfg = testConfig(test);
  return {
    test,
    short: cfg.title ?? test.toUpperCase(),
    title: `${EXP ? 'Experimentos' : 'Clasificación'} ${cfg.title ?? test.toUpperCase()}`,
    description: EXP ? EXP_INTRO(test).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') : cfg.description ?? '',
    generatedAt: lastUpdate([test]),
    hiddenTotal: cases.length || cfg.hiddenCases || Math.max(0, ...rows.map((x) => x.j?.hidden?.total ?? 0)),
    judge: judges.join(', ') || DEFAULT_JUDGE,
    weights: testConfig(test).weights,
    models: rows.map(({ m, r, j, sc }) => {
      const s = r?.session;
      const status = m.running ? 'running'
        : !r ? 'pending'
        : r.quotaBlocked ? 'quota'
        : r.accessBlocked ? 'access'
        : r.stopped && sc ? 'stopped'
        : sc?.reason?.startsWith('usa módulos') ? 'forbidden'
        : sc?.reason ? 'zero'
        : sc ? 'scored'
        : 'unjudged';
      return {
        slug: m.slug,
        name: m.name,
        provider: m.provider ?? null,
        stopped: r?.stopped ?? null,
        progress: r?.progress ?? null,
        variant: s?.variant ?? m.variant ?? 'default',
        status,
        score: sc?.total ?? null,
        hidden: j && !sc?.reason ? { passed: j.hidden.passed, total: j.hidden.total } : null,
        categories: j ? plainCats(j.hidden.cases) : null,
        code: j?.verdict?.codeQuality?.score ?? null,
        tests: j?.verdict?.testQuality?.score ?? null,
        cost: s?.cost ?? null,
        tokensOut: s ? s.tokens.output + s.tokens.reasoning : null,
        steps: s?.steps ?? null,
        activeMs: s?.activeMs ?? null,
        interventions: s ? (s.interventions ?? s.userMessages - 1) : null,
        // Proporción conseguida en cada bloque (0-1): la web recalcula la nota con los pesos que elija el lector.
        fractions: sc && !sc.reason
          ? Object.fromEntries(Object.entries(cfg.weights).map(([k, w]) => [k, w ? round2(sc.parts[k] / w) : 0]))
          : null,
        penalty: sc?.parts?.penalty ?? 0,
      };
    }),
  };
}

// Fecha del último resultado (collectedAt / judgedAt dentro de los JSON, no la de los ficheros): regenerar sin
// resultados nuevos no cambia nada, `publish` no crea commits vacíos y el CI puede comprobar que los informes
// publicados coinciden con los resultados. null si la prueba aún no tiene resultados.
function lastUpdate(tests) {
  let t = '';
  for (const test of tests) {
    const dir = resultsDir(test);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const d = readJson(path.join(dir, f));
      for (const v of [d?.collectedAt, d?.judgedAt]) if (typeof v === 'string' && v > t) t = v;
    }
  }
  return t || null;
}

// La plantilla admite una o varias pruebas ({ tests: [...] }); con varias muestra un selector (y #prueba en la URL).
const SITE_TITLE = 'OpenCode Go Models Benchmarks';

function renderReport(title, data) {
  data = { siteTitle: SITE_TITLE, ...data };
  return fs
    .readFileSync(path.join(ROOT, 'scripts', 'report-template.html'), 'utf8')
    .replace('__TITLE__', title)
    .replace('/*__DATA__*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
}

// `</body>` explícito: servidores de desarrollo como Live Server inyectan su script de recarga antes de él
// (sin él lo meten dentro del primer <svg> y rompen la página).
const fullDocument = (fragment) =>
  `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${fragment}\n</body>\n</html>\n`;

function writeChartReport(test, rows, fragmentPath) {
  const data = reportData(test, rows);
  const fragment = renderReport(
    data.title,
    EXP
      ? {
          tests: [data],
          siteTitle: 'API Models Benchmarks',
          eyebrow: 'Experimentos no vinculantes',
        }
      : { tests: [data] },
  );
  const file = path.join(reportDir(test), 'REPORT.html');
  writeAtomic(file, fullDocument(fragment));
  log(`📊 ${rel(file)} actualizado`);
  if (fragmentPath) fs.writeFileSync(fragmentPath, fragment); // para publicarlo como página (sin <html>/<head>)
}

// Aciertos de la suite oculta por categoría (expr 35/37 · null 20/27 …), si los casos la tienen.
function byCategory(cases) {
  const cats = new Map();
  for (const c of cases ?? []) {
    if (!c.category) continue;
    const x = cats.get(c.category) ?? { passed: 0, total: 0 };
    x.total++;
    if (c.passed) x.passed++;
    cats.set(c.category, x);
  }
  return [...cats].map(([k, x]) => `${x.passed === x.total ? '' : '**'}${k} ${x.passed}/${x.total}${x.passed === x.total ? '' : '**'}`).join(' · ');
}

function writeDetails(test, rows) {
  const W = testConfig(test).weights;
  const judged = rows.filter((x) => x.sc).sort((a, b) => b.sc.total - a.sc.total);
  const file = path.join(reportDir(test), 'DETAILS.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bench = EXP ? `../../benchmarks/${test}/` : ''; // la rúbrica es la de la prueba
  const md = [
    `# ${EXP ? 'Experimentos · ' : ''}${test} — Detalle de la nota`,
    '',
    `Generado por \`node scripts/bench.mjs report${EXP ? ' --experiments' : ''}\`. Cómo se calcula: [RUBRIC.md](${bench}RUBRIC.md).`,
    ...(EXP ? ['', EXP_INTRO(test)] : []),
    '',
    '## Ranking',
    '',
    `| # | Modelo | Nota | Corrección /${W.correctness} | Autonomía /${W.autonomy} | Tests propios /${W.ownTests} | Código /${W.codeQuality} | Robustez /${W.robustness} | Penalización |`,
    '|---|---|---|---|---|---|---|---|---|',
    ...judged.map(({ m, sc }, i) => {
      const p = sc.parts;
      return `| ${i + 1} | ${m.name}${sc.stopped ? '\\*' : ''} | **${sc.total.toFixed(1)}**${sc.stopped ? '\\*' : ''} | ${p.correctness} | ${p.autonomy} | ${p.ownTests} | ${p.codeQuality} | ${p.robustness} | ${p.penalty || ''} |`;
    }),
    '',
  ];

  for (const { m, r, j, sc } of judged) {
    if (sc.reason || !j) {
      md.push(`## ${m.name} — ${sc.total.toFixed(1)}`, '', `> ${sc.reason ?? 'sin veredicto'}.`, '', ...r.warnings.map((w) => `- ⚠️ ${w}`), '');
      continue;
    }
    const v = j.verdict;
    const p = sc.parts;
    const d = p.ownTestsDetail;
    const cov = Object.entries(v.coverage).map(([k, ok]) => `${ok ? '✅' : '❌'} ${k}`).join(' · ');
    const failed = j.hidden.cases.filter((c) => !c.passed);
    const q = W.ownTests / 4;
    const cats = byCategory(j.hidden.cases);
    md.push(
      `## ${m.name} — ${sc.total.toFixed(1)}${sc.stopped ? '\\*' : ''}`,
      '',
      ...(sc.stopped ? [`> ⏹ **\\* No terminó${sc.progress != null ? ` (≈${sc.progress} % hecho)` : ''}**: ${sc.stopped}. Se valora el código tal como estaba al detenerlo; autonomía 0.`, ''] : []),
      `> ${v.summary ?? ''}`,
      '',
      `- **Corrección** ${p.correctness}/${W.correctness}: suite oculta ${j.hidden.passed}/${j.hidden.total}` +
        (j.hidden.mode !== 'completa' ? ` (${j.hidden.mode})` : '') + (cats ? ` — ${cats}` : ''),
      `- **Autonomía** ${p.autonomy}/${W.autonomy}: ${r.session.interventions ?? r.session.userMessages - 1} intervención(es) del usuario` +
        `${r.session.startedInPlan ? ' (empezó en modo plan; la aprobación del plan no cuenta)' : ''}${r.session.inProgress ? ', sesión sin terminar' : ''}`,
      `- **Tests propios** ${p.ownTests}/${W.ownTests}: pasan ${d.pass}/${q} (${r.project.tests.passed}/${r.project.tests.total}) · cobertura ${d.coverage}/${q} · cantidad ${d.quantity}/${q} · calidad ${d.quality}/${q} (${v.testQuality.score}/10)`,
      `- **Código** ${p.codeQuality}/${W.codeQuality} (${v.codeQuality.score}/10)`,
      `- **Robustez** ${p.robustness}/${W.robustness}` + (p.penalty ? ` · **Penalización** ${p.penalty} (importa: ${r.project.externalImports.join(', ')})` : ''),
      `- Cobertura de lo pedido: ${cov}`,
      '',
    );
    const list = (title, items, icon) =>
      items?.length && md.push(`**${title}**`, '', ...items.map((x) => `- ${icon ? `${icon} ` : ''}${x}`), '');
    list('Código', [...(v.codeQuality.strengths ?? []).map((x) => `+ ${x}`), ...(v.codeQuality.weaknesses ?? []).map((x) => `− ${x}`)], '');
    list('Tests', [...(v.testQuality.strengths ?? []).map((x) => `+ ${x}`), ...(v.testQuality.weaknesses ?? []).map((x) => `− ${x}`)], '');
    list('Bugs detectados por el juez', v.bugs, '🐛');
    list('Casos de la suite oculta que fallan', failed.map((c) => `[${c.id}] ${c.name}`), '✗');
    list('Adaptaciones del adaptador', v.adapter.workarounds, '⚙️');
    md.push(`<sub>Juez: ${j.meta.judge} · ${j.judgedAt.slice(0, 16).replace('T', ' ')} · adaptador: [results/${m.slug}.adapter.ts](results/${m.slug}.adapter.ts)</sub>`, '');
  }

  writeAtomic(file, md.join('\n'));
  log(`📝 ${rel(file)} actualizado`);
}

// ---------- publicación en GitHub (+ GitHub Pages) ----------
// Copia limpia del proyecto en .publish/ (repo git propio → GitHub). Los ficheros locales no se tocan.
//   · no se publica la suite oculta (cases.json, datasets.mjs, consultas del oráculo) ni los mensajes de los casos
//     que fallan (revelan respuestas esperadas), ni el archivo de intentos descartados;
//   · se anonimizan rutas locales e ids de cuenta.
const PUBLISH_DIR = path.join(ROOT, '.publish');
const PUBLIC_REPO = 'rldona/opencode-models-benchmarks';
const PAGES_URL = 'https://rldona.github.io/opencode-models-benchmarks/';
const SKIP = new Set(['node_modules', '.git', '.DS_Store', 'archive', '.publish']);
const HIDDEN_PRIVATE = /judge\/(hidden\/(cases\.json|datasets\.mjs)|oracle\/queries\.mjs)$/;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SANITIZE = [
  [new RegExp(escapeRe(ROOT), 'g'), '.'],
  [/\/(?:private\/)?var\/folders\/[^\s"'`)]*?\/T\/opencode-bench/g, '<eval>'],
  [/\/(?:private\/)?(?:var\/folders\/[^\s"'`)]*?\/T|tmp)\/[^\s"'`)]*/g, '<tmp>'],
  [new RegExp(escapeRe(os.homedir()), 'g'), '~'],
  [/wrk_[A-Z0-9]{16,}/g, 'wrk_…'],
  // package-lock.json: registro npm interno (Artifactory corporativo) → registro público; misma ruta e integridad.
  [/https?:\/\/[^"\s]*\/artifactory\/api\/npm\/[^/"\s]+\//g, 'https://registry.npmjs.org/'],
  // Usuario local (sale, por ejemplo, en la salida de `ls -la` que ejecutan los modelos).
  [new RegExp(escapeRe(os.userInfo().username), 'g'), 'user'],
];
// Lo que nunca debe aparecer en la copia pública (si aparece, publish se detiene). Los términos propios de tu
// entorno (empresa, dominios internos…) van en .publish-private.json, que no se publica: {"terms": ["…"]}.
const PRIVATE_TERMS = readJson(path.join(ROOT, '.publish-private.json'))?.terms ?? [];
const PRIVATE_RE = [escapeRe(os.homedir()), escapeRe(os.userInfo().username), 'wrk_[A-Z0-9]{16,}', ...PRIVATE_TERMS.map(escapeRe)].join('|');
const sanitize = (text) => SANITIZE.reduce((s, [re, to]) => s.replace(re, to), text);

function publicFiles() {
  const out = [];
  const walk = (relDir, keep = () => true) => {
    const abs = path.join(ROOT, relDir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SKIP.has(e.name) || e.name.includes('.tmp-') || e.name.endsWith('.running') || e.name.startsWith('.bench.next')) continue;
      const rp = path.join(relDir, e.name);
      if (e.isDirectory()) walk(rp, keep);
      else if (keep(rp)) out.push(rp);
    }
  };
  for (const f of ['models.json', '.gitignore']) if (fs.existsSync(path.join(ROOT, f))) out.push(f);
  walk('.github');
  walk('scripts');
  // Los .run.log son la salida cruda de las herramientas que ejecutan los modelos (pueden mostrar cualquier cosa
  // de la máquina): no se publican; las métricas están en los .json.
  walk('benchmarks', (rp) => !HIDDEN_PRIVATE.test(rp) && !rp.endsWith('.run.log'));
  // Las carpetas de modelos que siguen trabajando no se publican a medias.
  walk('models', (rp) => { const [, slug, test] = rp.split(path.sep); return !isRunning(slug, test); });
  return out;
}

function publishContent(rp) {
  const buf = fs.readFileSync(path.join(ROOT, rp));
  if (!/\.(md|json|mjs|js|ts|html|log|txt|jsonc|yaml|yml)$|^\.gitignore$/.test(path.basename(rp)) && !rp.endsWith('.gitignore')) return buf;
  let text = buf.toString('utf8');
  if (/results\/[^/]+\.judge\.json$/.test(rp)) {
    const j = JSON.parse(text);
    for (const c of j.hidden?.cases ?? []) delete c.message; // revelan respuestas esperadas de la suite oculta
    text = JSON.stringify(j, null, 2) + '\n';
  }
  return sanitize(text);
}

function siteData() {
  const tests = fs
    .readdirSync(path.join(ROOT, 'benchmarks'))
    .filter((t) => fs.existsSync(path.join(ROOT, 'benchmarks', t, 'PROMPT.md')))
    .sort((a, b) => (a === 'rrule' ? -1 : b === 'rrule' ? 1 : a.localeCompare(b)));
  const blob = (p) => `https://github.com/${PUBLIC_REPO}/blob/main/${p}`;
  return {
    repoUrl: `https://github.com/${PUBLIC_REPO}`,
    tests: tests.map((t) => ({
      ...reportData(t, testRows(t)),
      links: [
        ['Tabla completa', blob(`benchmarks/${t}/RESULTS.md`)],
        ['Detalle y comentarios del juez', blob(`benchmarks/${t}/DETAILS.md`)],
        ['Enunciado', blob(`benchmarks/${t}/PROMPT.md`)],
        ['Cómo se calcula la nota', blob(`benchmarks/${t}/RUBRIC.md`)],
      ],
    })),
  };
}

// ---------- portada del repo: imagen del gráfico, badges y README ----------
const PUBLIC_TESTS = () =>
  fs
    .readdirSync(path.join(ROOT, 'benchmarks'))
    .filter((t) => fs.existsSync(path.join(ROOT, 'benchmarks', t, 'PROMPT.md')))
    .sort((a, b) => (a === 'rrule' ? -1 : b === 'rrule' ? 1 : a.localeCompare(b)));

const scoredRows = (t) =>
  testRows(t)
    .filter((x) => x.sc && !x.sc.reason)
    .sort((a, b) => b.sc.total - a.sc.total || (a.r.session.cost ?? 0) - (b.r.session.cost ?? 0));

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const esNum = (v, d) => v.toFixed(d).replace('.', ',');
const fmtCostEs = (c) => (c == null ? '—' : c === 0 ? '$0' : `$${esNum(c, c < 0.1 ? 4 : 2)}`);

const THEMES = {
  light: { bg: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', accent: '#2a78d6', rest: '#898781' },
  dark: { bg: '#1a1a19', ink: '#ffffff', ink2: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', axis: '#383835', accent: '#3987e5', rest: '#898781' },
};

// Instantánea estática del gráfico (nota frente a coste, eje invertido, frontera de eficiencia) para la portada del
// README. Mismo algoritmo que el informe interactivo; anchos de texto estimados (no hay canvas en Node).
function coverSvg(theme) {
  const C = THEMES[theme];
  const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const panels = PUBLIC_TESTS().map((t) => ({ t, rows: scoredRows(t) })).filter((p) => p.rows.length);
  const PW = panels.length > 1 ? 780 : 1200, PH = 560, HEAD = 78;
  const W = PW * Math.max(1, panels.length), H = HEAD + PH + 24;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${SANS}">`];
  out.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  out.push(`<text x="32" y="44" fill="${C.ink}" font-size="26" font-weight="600">${xml(SITE_TITLE)}</text>`);
  const upd = lastUpdate(PUBLIC_TESTS());
  out.push(`<text x="32" y="66" fill="${C.ink2}" font-size="14">Nota (0–10) frente a coste por tarea · azul: frontera de eficiencia${upd ? ` · ${xml(new Date(upd).toISOString().slice(0, 10))}` : ''}</text>`);
  if (!panels.length) out.push(`<text x="32" y="${HEAD + 40}" fill="${C.ink2}" font-size="16">Todavía no hay resultados.</text>`);

  panels.forEach(({ t, rows }, pi) => {
    const ox = pi * PW;
    const M = { top: HEAD + 40, right: 170, bottom: 50, left: 64 };
    const pw = PW - M.left - M.right, ph = PH - 40 - M.bottom;
    const pts = rows.map(({ m, r, sc }) => ({ name: m.name + (sc.stopped ? ' *' : ''), variant: (r.session.variant ?? m.variant ?? 'default').toUpperCase(), x: r.session.cost ?? 0, y: sc.total }));
    // Frontera: nadie tiene a la vez más nota y menos coste.
    const front = new Set();
    let best = -Infinity;
    for (const p of [...pts].sort((a, b) => a.x - b.x || b.y - a.y)) if (p.y > best) { front.add(p); best = p.y; }
    let x1 = Math.max(...pts.map((p) => p.x)) * 1.1 || 1;
    const st = 10 ** Math.floor(Math.log10(x1 / 5)) * ([1, 2, 5, 10].find((k) => x1 / 5 / 10 ** Math.floor(Math.log10(x1 / 5)) <= k) ?? 10);
    x1 = Math.ceil(x1 / st) * st;
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - 1)), y1 = 10;
    const sx = (v) => ox + M.left + (1 - v / x1) * pw;
    const sy = (v) => M.top + (1 - (v - y0) / (y1 - y0)) * ph;
    out.push(`<text x="${ox + M.left}" y="${M.top - 16}" fill="${C.ink}" font-size="16" font-weight="600">${xml(testConfig(t).title ?? t.toUpperCase())}</text>`);
    out.push(`<text x="${ox + M.left + pw}" y="${M.top - 16}" fill="${C.muted}" font-size="12" font-style="italic" text-anchor="end">más eficiente ↗</text>`);
    for (let v = y0; v <= y1; v++) {
      out.push(`<line x1="${ox + M.left}" x2="${ox + M.left + pw}" y1="${sy(v)}" y2="${sy(v)}" stroke="${C.grid}"/>`);
      out.push(`<text x="${ox + M.left - 10}" y="${sy(v) + 4}" fill="${C.muted}" font-size="11" font-family="${MONO}" text-anchor="end">${v}</text>`);
    }
    for (let v = 0; v <= x1 + 1e-9; v += st) {
      out.push(`<line x1="${sx(v)}" x2="${sx(v)}" y1="${M.top}" y2="${M.top + ph}" stroke="${C.grid}"/>`);
      out.push(`<text x="${sx(v)}" y="${M.top + ph + 20}" fill="${C.muted}" font-size="11" font-family="${MONO}" text-anchor="middle">${xml(fmtCostEs(+v.toPrecision(6)))}</text>`);
    }
    out.push(`<line x1="${ox + M.left}" x2="${ox + M.left + pw}" y1="${M.top + ph}" y2="${M.top + ph}" stroke="${C.axis}"/>`);
    out.push(`<text x="${ox + M.left + pw / 2}" y="${M.top + ph + 42}" fill="${C.ink2}" font-size="12" text-anchor="middle">Coste por tarea (USD, precio de lista según opencode) · menos es mejor →</text>`);
    const fp = pts.filter((p) => front.has(p)).sort((a, b) => a.x - b.x);
    if (fp.length > 1) out.push(`<polyline points="${fp.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linejoin="round"/>`);
    for (const p of [...pts].sort((a, b) => front.has(a) - front.has(b))) {
      p.px = sx(p.x); p.py = sy(p.y);
      out.push(`<circle cx="${p.px}" cy="${p.py}" r="5" fill="${front.has(p) ? C.accent : C.rest}" stroke="${C.bg}" stroke-width="2"/>`);
    }
    // Etiquetas con evitación de choques (anchos estimados).
    const taken = pts.map((p) => ({ x0: p.px - 7, x1: p.px + 7, y0: p.py - 7, y1: p.py + 7 }));
    const free = (b) => b.x0 >= ox + M.left && b.x1 <= ox + PW - 4 && b.y0 >= M.top - 4 && b.y1 <= M.top + ph && !taken.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    for (const p of [...pts].sort((a, b) => front.has(b) - front.has(a) || b.y - a.y)) {
      const w = Math.max(p.name.length * 6.9, p.variant.length * 6.6) + 2, h = 26;
      const tries = [[9, -11, 'start'], [-9, -11, 'end'], [0, -36, 'middle'], [0, 10, 'middle'], [9, -26, 'start'], [-9, -26, 'end'], [9, 2, 'start'], [-9, 2, 'end'],
        [30, -38, 'start', 1], [30, 14, 'start', 1], [-30, -38, 'end', 1], [-30, 14, 'end', 1], [44, -62, 'start', 1], [44, 38, 'start', 1], [-44, -62, 'end', 1], [-44, 38, 'end', 1]];
      for (const [dx, dy, ax, lead] of tries) {
        const tx = p.px + dx, ty = p.py + dy;
        const bx0 = ax === 'start' ? tx : ax === 'end' ? tx - w : tx - w / 2;
        const b = { x0: bx0 - 2, x1: bx0 + w + 2, y0: ty - 1, y1: ty + h + 1 };
        if (!free(b)) continue;
        taken.push(b);
        if (lead) {
          const lx = ax === 'start' ? tx - 3 : tx + 3, ly = ty + 7, a = Math.atan2(ly - p.py, lx - p.px);
          out.push(`<line x1="${p.px + Math.cos(a) * 8}" y1="${p.py + Math.sin(a) * 8}" x2="${lx}" y2="${ly}" stroke="${C.axis}"/>`);
        }
        out.push(`<text x="${tx}" y="${ty + 11}" fill="${C.ink}" font-size="12" font-weight="500" text-anchor="${ax}">${xml(p.name)}</text>`);
        out.push(`<text x="${tx}" y="${ty + 23}" fill="${C.muted}" font-size="10" font-family="${MONO}" letter-spacing="0.6" text-anchor="${ax}">${xml(p.variant)}</text>`);
        break;
      }
    }
  });
  out.push('</svg>');
  return out.join('\n') + '\n';
}

// "Destacados" estáticos para el README: top 10 por nota, velocidad (tokens/s) y coste por tarea, un color por
// panel (la identidad de cada barra la da su etiqueta). Misma lógica que la sección de la web.
const HL_COLORS = { light: { score: '#2a78d6', speed: '#1baf7a', cost: '#eb6834' }, dark: { score: '#3987e5', speed: '#199e70', cost: '#d95926' } };

function highlightsSvg(t, theme) {
  const C = THEMES[theme], K = HL_COLORS[theme];
  const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const rows = scoredRows(t);
  const tps = (r) => (r.session.activeMs ? (r.session.tokens.output + r.session.tokens.reasoning) / (r.session.activeMs / 1000) : null);
  const panels = [
    { key: 'score', title: 'Nota', sub: 'Nota 0–10 · más es mejor', get: (x) => x.sc.total, f: (v) => esNum(v, 1), asc: false },
    { key: 'speed', title: 'Velocidad', sub: 'Tokens generados por segundo · más es mejor', get: (x) => tps(x.r), f: (v) => String(Math.round(v)), asc: false },
    { key: 'cost', title: 'Coste por tarea', sub: 'USD por tarea (precio de lista) · menos es mejor', get: (x) => x.r.session.cost, f: (v) => esNum(v, v < 0.1 ? 3 : 2), asc: true },
  ];
  const PW = 520, GAP = 20, H = 470, W = PW * 3 + GAP * 2 + 48;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${SANS}">`, `<rect width="${W}" height="${H}" fill="${C.bg}"/>`];
  panels.forEach((h, pi) => {
    const ox = 24 + pi * (PW + GAP);
    out.push(`<rect x="${ox}" y="16" width="${PW}" height="${H - 32}" rx="12" fill="${C.bg}" stroke="${C.grid}"/>`);
    out.push(`<rect x="${ox + 20}" y="42" width="14" height="14" rx="3" fill="${K[h.key]}"/>`);
    out.push(`<text x="${ox + 44}" y="56" fill="${C.ink}" font-size="22" font-weight="600">${xml(h.title)}</text>`);
    out.push(`<text x="${ox + 20}" y="80" fill="${C.ink2}" font-size="12">${xml(h.sub)}</text>`);
    const vals = rows.map((x) => ({ x, v: h.get(x) })).filter((y) => y.v != null && Number.isFinite(y.v))
      .sort((a, b) => (h.asc ? a.v - b.v : b.v - a.v)).slice(0, 10);
    if (!vals.length) return;
    const lw = vals.map((y) => y.x.m.name.length * 6.1 * Math.SQRT1_2);
    const bottom = Math.max(60, Math.ceil(Math.max(...lw)) + 22);
    const n = vals.length, left0 = ox + 16, pw0 = PW - 32;
    const slot0 = pw0 / n;
    const padL = Math.max(0, Math.ceil(Math.max(...lw.map((w, i) => w - slot0 * (i + 0.5) + 2))));
    const x0 = left0 + padL, pw = pw0 - padL, slot = pw / n, bw = Math.min(24, slot * 0.64), r = Math.min(4, bw / 2);
    const valW = Math.max(...vals.map((y) => h.f(y.v).length * 6.4));
    const rot = valW > slot - 3;
    const top = 112 + (rot ? Math.ceil(valW) - 8 : 0), base = H - 16 - bottom, ph = base - top, max = Math.max(...vals.map((y) => y.v)) || 1;
    for (const f of [1 / 3, 2 / 3, 1]) out.push(`<line x1="${x0}" x2="${x0 + pw}" y1="${base - ph * f}" y2="${base - ph * f}" stroke="${C.grid}"/>`);
    out.push(`<line x1="${x0}" x2="${x0 + pw}" y1="${base}" y2="${base}" stroke="${C.axis}"/>`);
    vals.forEach((y, i) => {
      const cx = x0 + slot * (i + 0.5), bh = Math.max(2, (y.v / max) * ph), ty = base - bh, a = cx - bw / 2, b = cx + bw / 2;
      out.push(`<path d="M${a},${base} V${ty + r} Q${a},${ty} ${a + r},${ty} H${b - r} Q${b},${ty} ${b},${ty + r} V${base} Z" fill="${K[h.key]}"/>`);
      out.push(rot
        ? `<text x="${cx + 3.5}" y="${ty - 5}" fill="${C.ink}" font-size="10.5" font-weight="500" font-family="${MONO}" transform="rotate(-90 ${cx + 3.5} ${ty - 5})">${xml(h.f(y.v))}</text>`
        : `<text x="${cx}" y="${ty - 6}" fill="${C.ink}" font-size="11" font-weight="500" font-family="${MONO}" text-anchor="middle">${xml(h.f(y.v))}</text>`);
      out.push(`<text x="${cx + 3}" y="${base + 14}" fill="${C.ink2}" font-size="11" text-anchor="end" transform="rotate(-45 ${cx + 3} ${base + 14})">${xml(y.x.m.name + (y.x.sc.stopped ? ' *' : ''))}</text>`);
    });
  });
  out.push('</svg>');
  return out.join('\n') + '\n';
}

// Datos para los badges de shields.io (endpoint JSON en el propio repo).
function badgeData(t) {
  const rows = testRows(t);
  const scored = scoredRows(t);
  const top = scored[0];
  return {
    schemaVersion: 1,
    label: testConfig(t).title ?? t.toUpperCase(),
    message: top ? `${scored.length}/${rows.length} modelos · mejor ${esNum(top.sc.total, 1)} ${top.m.name}` : `sin resultados · ${rows.length} modelos`,
    color: top ? 'blue' : 'lightgrey',
  };
}

function publicReadme() {
  const repo = `https://github.com/${PUBLIC_REPO}`;
  const raw = `https://raw.githubusercontent.com/${PUBLIC_REPO}/main`;
  const tests = PUBLIC_TESTS();
  const L = [
    `# ${SITE_TITLE}`,
    '',
    `[![Tests de los scripts](${repo}/actions/workflows/tests.yml/badge.svg)](${repo}/actions/workflows/tests.yml)`,
    `[![Informes al día](${repo}/actions/workflows/reports.yml/badge.svg)](${repo}/actions/workflows/reports.yml)`,
    `[![GitHub Pages](${repo}/actions/workflows/pages/pages-build-deployment/badge.svg)](${PAGES_URL})`,
    ...tests.map((t) => `[![${testConfig(t).title ?? t}](https://img.shields.io/endpoint?url=${encodeURIComponent(`${raw}/badges/${t}.json`)})](${PAGES_URL}#${t})`),
    `![Modelos](https://img.shields.io/badge/modelos-${MODELS.length}-2a78d6) ![Node](https://img.shields.io/badge/node-24-339933?logo=node.js&logoColor=white)`,
    '',
    `<a href="${PAGES_URL}"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/cover-dark.svg"><img alt="Nota frente a coste por tarea de cada modelo, con la frontera de eficiencia" src="assets/cover.svg"></picture></a>`,
    '',
    `**[Web interactiva](${PAGES_URL})**: gráfico de nota frente a coste, tokens, pasos o tiempo, con la frontera de eficiencia, y la clasificación con los **pesos de la nota ajustables** (corrección, autonomía, tests, código y robustez).`,
    '',
    'Cada modelo de opencode-go resuelve la misma tarea en autopiloto, aislado en su carpeta y con su variante de razonamiento más alta. La nota 0–10 combina una suite de tests oculta, la valoración de un juez (código y tests), la autonomía y la robustez. La suite oculta no se publica para que siga siendo válida en futuras tiradas.',
    '',
    '## Resultados',
    '',
  ];
  for (const t of tests) {
    const cfg = testConfig(t);
    const rows = testRows(t);
    const scored = scoredRows(t);
    L.push(`### ${cfg.title ?? t} · ${scored.length} de ${rows.length} modelos con nota`, '', cfg.description ?? '', '');
    if (!scored.length) {
      L.push('_Todavía no hay resultados._', '');
      continue;
    }
    L.push(
      `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/highlights-${t}-dark.svg"><img alt="Destacados de ${xml(cfg.title ?? t)}: top 10 por nota, velocidad y coste por tarea" src="assets/highlights-${t}.svg"></picture>`,
      '',
    );
    L.push('| # | Modelo | Variante | Nota | Suite oculta | Código | Tests | Coste | Tiempo |', '|---|---|---|---|---|---|---|---|---|');
    scored.forEach(({ m, r, j, sc }, i) => {
      L.push(`| ${i + 1} | ${m.name}${sc.stopped ? '\\*' : ''} | \`${r.session.variant ?? 'default'}\` | **${esNum(sc.total, 1)}**${sc.stopped ? '\\*' : ''} | ${j.hidden.passed}/${j.hidden.total} | ${j.verdict.codeQuality.score} | ${j.verdict.testQuality.score} | ${fmtCostEs(r.session.cost)} | ${fmtDur(r.session.activeMs)} |`);
    });
    const stoppedRows = scored.filter((x) => x.sc.stopped);
    if (stoppedRows.length) L.push('', ...stoppedRows.map((x) => `\\* ${x.m.name}: no terminó${x.sc.progress != null ? ` (≈${x.sc.progress} % hecho)` : ''} — ${x.sc.stopped}; se valora lo que había hecho.`));
    L.push('', `[Tabla completa](benchmarks/${t}/RESULTS.md) · [Detalle y comentarios del juez](benchmarks/${t}/DETAILS.md) · [Enunciado](benchmarks/${t}/PROMPT.md) · [Cómo se calcula la nota](benchmarks/${t}/RUBRIC.md) · [Gráfico](${PAGES_URL}#${t})`, '');
  }
  const local = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const guide = local.includes('<!-- guia -->') ? local.slice(local.indexOf('<!-- guia -->') + '<!-- guia -->'.length).trim() : '';
  return `${L.join('\n')}\n${guide ? `\n${guide}\n` : ''}`;
}

function publish(opts) {
  for (const t of fs.readdirSync(path.join(ROOT, 'benchmarks'))) {
    if (fs.existsSync(path.join(ROOT, 'benchmarks', t, 'PROMPT.md'))) report({ ...opts, test: t, fragment: undefined });
  }
  fs.mkdirSync(PUBLISH_DIR, { recursive: true });
  // Vacía la copia (menos .git) para que los borrados también se publiquen.
  for (const e of fs.readdirSync(PUBLISH_DIR)) if (e !== '.git') fs.rmSync(path.join(PUBLISH_DIR, e), { recursive: true, force: true });
  const files = publicFiles();
  for (const rp of files) {
    const dst = path.join(PUBLISH_DIR, rp);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, publishContent(rp));
  }
  // Informes regenerados dentro de la copia, a partir de sus propios resultados (igual que el CI "Informes al día"):
  // si un modelo termina mientras se publica, resultados e informes siguen coincidiendo.
  for (const t of PUBLIC_TESTS()) {
    const r = sh(process.execPath, [path.join(PUBLISH_DIR, 'scripts', 'bench.mjs'), 'report', '--test', t], { cwd: PUBLISH_DIR });
    if (r.status !== 0) throw new Error(`no se pudieron regenerar los informes de ${t} en la copia: ${r.stderr || r.stdout}`);
  }
  fs.writeFileSync(path.join(PUBLISH_DIR, 'index.html'), fullDocument(renderReport(SITE_TITLE, siteData())));
  fs.writeFileSync(path.join(PUBLISH_DIR, 'README.md'), publicReadme());
  fs.mkdirSync(path.join(PUBLISH_DIR, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(PUBLISH_DIR, 'assets', 'cover.svg'), coverSvg('light'));
  fs.writeFileSync(path.join(PUBLISH_DIR, 'assets', 'cover-dark.svg'), coverSvg('dark'));
  for (const t of PUBLIC_TESTS()) {
    if (!scoredRows(t).length) continue;
    fs.writeFileSync(path.join(PUBLISH_DIR, 'assets', `highlights-${t}.svg`), highlightsSvg(t, 'light'));
    fs.writeFileSync(path.join(PUBLISH_DIR, 'assets', `highlights-${t}-dark.svg`), highlightsSvg(t, 'dark'));
  }
  fs.mkdirSync(path.join(PUBLISH_DIR, 'badges'), { recursive: true });
  for (const t of PUBLIC_TESTS()) fs.writeFileSync(path.join(PUBLISH_DIR, 'badges', `${t}.json`), JSON.stringify(badgeData(t), null, 2) + '\n');
  fs.writeFileSync(path.join(PUBLISH_DIR, '.nojekyll'), '');
  // Comprobación final: nada privado en la copia.
  const leaks = sh('grep', ['-rliE', PRIVATE_RE, '--exclude-dir=.git', PUBLISH_DIR]).stdout.trim();
  if (leaks) throw new Error(`quedan datos locales en la copia pública:\n${leaks}`);
  log(`📦 ${files.length + 2} ficheros en ${rel(PUBLISH_DIR)} (suite oculta excluida, rutas anonimizadas)`);

  if (opts['no-push']) return;
  const git = (...a) => sh('git', a, { cwd: PUBLISH_DIR });
  if (!fs.existsSync(path.join(PUBLISH_DIR, '.git'))) return log(`· ${rel(PUBLISH_DIR)} aún no es un repo git: créalo la primera vez (ver README)`);
  git('add', '-A');
  if (!git('status', '--porcelain').stdout.trim()) return log('· sin cambios que publicar');
  const msg = opts.message ?? `Actualiza resultados del benchmark (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`;
  const c = git('commit', '-q', '-m', msg);
  if (c.status !== 0) throw new Error(`git commit falló: ${c.stderr || c.stdout}`);
  const p = git('push', '-q', 'origin', 'HEAD:main');
  if (p.status !== 0) throw new Error(`git push falló: ${p.stderr || p.stdout}`);
  log(`🚀 publicado en https://github.com/${PUBLIC_REPO} · ${PAGES_URL}`);
}

// ---------- CLI ----------

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { test: 'rrule', targets: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (['--all', '--force', '--no-judge', '--no-push', '--experiments'].includes(a)) opts[a.slice(2)] = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = rest[++i];
    else opts.targets.push(a);
  }
  return { cmd, opts };
}

async function main() {
  const { cmd, opts } = parseArgs(process.argv.slice(2));
  // excludeModels (bench.json): fuera de --all para esa prueba; con el slug explícito se puede lanzar igualmente.
  const excluded = new Set(testConfig(opts.test).excludeModels ?? []);
  let slugs = opts.all ? MODELS.map((m) => m.slug).filter((s) => !excluded.has(s)) : opts.targets;
  if (opts.exp || opts.experiments) {
    if (cmd === 'publish' || opts.all) throw new Error('--exp/--experiments no admiten publish ni --all');
    const models = readJson(EXP_REGISTRY) ?? [];
    let model = null;
    if (opts.exp) {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(opts.exp)) throw new Error('--exp: usa un nombre simple, p. ej. deepseek-directo');
      if (MODELS.some((m) => m.slug === opts.exp)) throw new Error(`--exp: ${opts.exp} ya es un modelo de models.json, usa otro nombre`);
      const prev = models.find((m) => m.slug === opts.exp) ?? {};
      model = Object.fromEntries(
        Object.entries({
          slug: opts.exp,
          name: opts.label ?? prev.name ?? opts.model ?? opts.exp,
          id: opts.model ?? prev.id,
          variant: opts.variant ?? prev.variant,
          provider: opts.provider ?? prev.provider,
        }).filter(([, v]) => v != null),
      );
      if (!model.id) throw new Error('--exp necesita --model <proveedor/modelo> la primera vez (p. ej. deepseek/deepseek-flash)');
      const i = models.findIndex((m) => m.slug === model.slug);
      if (JSON.stringify(models[i]) !== JSON.stringify(model)) {
        if (i >= 0) models[i] = model;
        else models.push(model);
        fs.mkdirSync(EXP_DIR, { recursive: true });
        writeAtomic(EXP_REGISTRY, JSON.stringify(models, null, 2) + '\n');
      }
      slugs = [opts.exp];
    } else if (cmd !== 'report') throw new Error('--experiments solo sirve con report; para lanzar o recoger usa --exp <nombre>');
    EXP = { model, models };
  }
  if (cmd === 'publish') return publish(opts);
  if (!['open', 'run', 'collect', 'judge', 'report', 'reset'].includes(cmd) || (cmd !== 'report' && !slugs.length)) {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
    log(src.slice(1, src.findIndex((l, i) => i > 0 && !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(1);
  }
  if (opts.session && slugs.length !== 1) throw new Error('--session solo tiene sentido con un único modelo');

  if (cmd === 'run' && opts.all && !opts.force) {
    // Solo los que aún no se han lanzado: carpeta vacía y sin sesiones creadas después de crear/vaciar la carpeta
    // (p. ej. una TUI de `open` en plena fase plan, que todavía no ha escrito nada). Las sesiones anteriores son de
    // intentos descartados.
    slugs = slugs.filter((s) => {
      const d = workDir(s, opts.test);
      if (!fs.existsSync(d)) return true;
      if (fs.readdirSync(d).some((f) => f !== '.gitkeep')) return false;
      const since = fs.statSync(d).birthtimeMs - 5_000;
      // Un intento cortado por cuota que no llegó a escribir nada vuelve a estar pendiente.
      const prev = readJson(resultFile(s, opts.test));
      if (prev?.quotaBlocked || prev?.accessBlocked) return true;
      const inUse = rootSessions(d).some((x) => x.time_created >= since);
      if (inUse) log(`· ${s}: carpeta vacía pero ya tiene una sesión nueva (¿TUI abierta?), la salto`);
      return !inUse;
    });
    log(`Pendientes (${slugs.length}): ${slugs.join(', ') || 'ninguno'}`);
  }
  if (cmd === 'run' && Number(opts.parallel) > 1 && slugs.length > 1) {
    await runParallel(slugs, opts);
    return report(opts);
  }

  for (const slug of cmd === 'report' ? [] : slugs) {
    try {
      if (cmd === 'reset') {
        if (opts.all) throw new Error('reset no admite --all: indica los modelos');
        reset(slug, opts);
      } else if (cmd === 'open') open(slug, opts);
      else if (cmd === 'run') {
        if (run(slug, opts)?.quotaBlocked) {
          log('⛔ Cuota del proveedor agotada: paro aquí. Vuelve a lanzar cuando se reinicie la ventana de 5 h.');
          break;
        }
      }
      else if (cmd === 'judge') {
        if (opts.all && !fs.existsSync(resultFile(slug, opts.test))) continue;
        judge(slug, opts);
      } else collect(slug, { ...opts, quiet: opts.all });
    } catch (e) {
      log(`💥 ${slug}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  report(opts);
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((e) => {
    log(`💥 ${e.message}`);
    process.exit(1);
  });
}

export { ROOT, MODELS, testConfig, computeScore, sanitize, isolationReport, reportData, renderReport, testRows, lastUpdate, byCategory, highlightsSvg, coverSvg };
