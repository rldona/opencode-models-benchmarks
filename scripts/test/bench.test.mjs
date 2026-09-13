// Tests de los scripts del benchmark (node --test, sin dependencias).
//   node --test scripts/test/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  MODELS,
  ROOT,
  byCategory,
  computeScore,
  isolationReport,
  renderReport,
  reportData,
  sanitize,
  testConfig,
} from '../bench.mjs';
import { diffRows } from '../../benchmarks/sql/judge/hidden/compare.ts';

// ---------- fixtures ----------
function result(test, over = {}) {
  return {
    test,
    session: { inProgress: false, interventions: 0, userMessages: 2, ...over.session },
    project: {
      found: true,
      tests: { ok: true, total: 15, passed: 15, failed: 0 },
      tzRuns: test === 'rrule' ? { UTC: { ok: true }, 'America/New_York': { ok: true }, 'Asia/Kolkata': { ok: true } } : {},
      tsc: { ok: true, errors: 0 },
      extraDeps: [],
      externalImports: [],
      forbiddenImports: [],
      ...over.project,
    },
    warnings: over.warnings ?? [],
    ...(over.flags ?? {}),
  };
}
function verdict(passed, total, over = {}) {
  return {
    verdict: {
      adapter: { ok: true, workarounds: [] },
      coverage: { a: true, b: true, c: true, d: true },
      codeQuality: { score: 9 },
      testQuality: { score: 9 },
      ...over,
    },
    hidden: { passed, total, cases: [] },
  };
}

// ---------- configuración ----------
test('models.json: slugs únicos e ids de opencode-go', () => {
  const slugs = new Set();
  for (const m of MODELS) {
    assert.ok(m.slug && m.name, `modelo incompleto: ${JSON.stringify(m)}`);
    assert.equal(m.id, `opencode-go/${m.slug}`);
    assert.ok(!slugs.has(m.slug), `slug repetido: ${m.slug}`);
    slugs.add(m.slug);
  }
});

// experiments/ no se publica: en el repo público no existe y el test se salta.
const EXP_REGISTRY = path.join(ROOT, 'experiments', 'models.json');
test('experiments/models.json: nombres únicos y distintos de models.json', { skip: !fs.existsSync(EXP_REGISTRY) }, () => {
  const official = new Set(MODELS.map((m) => m.slug));
  const seen = new Set();
  for (const e of JSON.parse(fs.readFileSync(EXP_REGISTRY, 'utf8'))) {
    assert.ok(e.slug && e.name && e.id, `experimento incompleto: ${JSON.stringify(e)}`);
    assert.ok(!official.has(e.slug), `${e.slug} coincide con un modelo oficial`);
    assert.ok(!seen.has(e.slug), `experimento repetido: ${e.slug}`);
    seen.add(e.slug);
  }
});

test('bench.json: los pesos de cada prueba suman 10', () => {
  for (const t of fs.readdirSync(path.join(ROOT, 'benchmarks'))) {
    if (!fs.existsSync(path.join(ROOT, 'benchmarks', t, 'bench.json'))) continue;
    const w = testConfig(t).weights;
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    assert.equal(Math.round(sum * 1000) / 1000, 10, `${t}: los pesos suman ${sum}`);
  }
});

// ---------- nota ----------
test('nota RRULE: solución perfecta en tests, juez 9/9 → 9,8', () => {
  const sc = computeScore(result('rrule'), verdict(19, 19));
  assert.equal(sc.total, 9.8);
  assert.equal(sc.parts.correctness, 4);
  assert.equal(sc.parts.robustness, 1);
});

test('nota SQL: pesos de bench.json (corrección 5) y sin TZ extra', () => {
  const sc = computeScore(result('sql'), verdict(173, 173));
  assert.equal(sc.parts.correctness, 5);
  assert.equal(sc.parts.robustness, 0.5);
  assert.equal(sc.total, 9.8);
  const half = computeScore(result('sql'), verdict(86, 173));
  assert.ok(Math.abs(half.parts.correctness - 2.49) < 0.01);
});

test('autonomía: 1 intervención = mitad, 2 = cero, sin terminar = cero', () => {
  const a = (session) => computeScore(result('rrule', { session }), verdict(19, 19)).parts.autonomy;
  assert.equal(a({ interventions: 0 }), 1);
  assert.equal(a({ interventions: 1 }), 0.5);
  assert.equal(a({ interventions: 2 }), 0);
  assert.equal(a({ interventions: 0, inProgress: true }), 0);
});

test('casos especiales: sin proyecto = 0, motor prohibido = 0, cuota o sin acceso = sin nota', () => {
  assert.equal(computeScore(result('rrule', { project: { found: false } }), null).total, 0);
  const forbidden = computeScore(result('sql', { project: { forbiddenImports: ['node:sqlite (src/db.ts)'] } }), verdict(173, 173));
  assert.equal(forbidden.total, 0);
  assert.match(forbidden.reason, /prohibidos/);
  assert.equal(computeScore(result('rrule', { flags: { quotaBlocked: true } }), verdict(19, 19)), null);
  assert.equal(computeScore(result('rrule', { flags: { accessBlocked: true } }), verdict(19, 19)), null);
});

test('penalización por importar paquetes externos', () => {
  const sc = computeScore(result('rrule', { project: { externalImports: ['luxon'] } }), verdict(19, 19));
  assert.equal(sc.parts.penalty, -1.5);
  assert.equal(sc.total, 8.3);
});

// ---------- publicación ----------
test('sanitize: rutas locales, usuario, ids de cuenta y registro npm interno', () => {
  const home = os.homedir();
  const user = os.userInfo().username;
  const out = sanitize(
    [
      `${ROOT}/models/x/rrule/src/a.ts`,
      `${home}/.npm/_cacache`,
      `drwxr-xr-x  2 ${user}  staff`,
      'https://opencode.ai/workspace/wrk_…/go',
      '"resolved": "https://registry.npmjs.org/vitest/-/vitest-3.2.4.tgz"',
    ].join('\n'),
  );
  assert.ok(!out.includes(home) && !out.includes(ROOT), out);
  assert.match(out, /^\.\/models\/x\/rrule\/src\/a\.ts$/m);
  assert.match(out, /~\/\.npm/);
  assert.match(out, / user +staff/);
  assert.match(out, /wrk_…/);
  assert.match(out, /https:\/\/registry\.npmjs\.org\/vitest\/-\/vitest-3\.2\.4\.tgz/);
});

// ---------- aislamiento ----------
test('aislamiento: distingue acceso al repo, exploración fuera y rutas inexistentes', () => {
  const dir = path.join(ROOT, 'models', 'demo-model', 'rrule');
  const tool = (tool, input, status = 'completed', error) => ({ type: 'tool', tool, state: { input, status, error } });
  const exportJson = {
    messages: [
      {
        info: { role: 'assistant' },
        parts: [
          tool('read', { filePath: path.join(ROOT, 'README.md') }),
          tool('bash', { command: 'ls ~/' }),
          tool('bash', { command: `node -e "import { x } from '../src/index'"` }),
          tool('read', { filePath: path.join(ROOT, 'models.json') }, 'error', 'The user rejected permission to use this specific tool call.'),
        ],
      },
    ],
  };
  const r = isolationReport([exportJson], dir, 'demo-model');
  assert.equal(r.leaked, true);
  assert.equal(r.explored, true);
  assert.ok(r.externalAccess.some((a) => a.kind === 'repo' && a.blocked));
  assert.ok(!r.externalAccess.some((a) => a.target.includes('src/index')), 'una ruta que no existe no es un acceso');
});

// ---------- informe ----------
test('informe: la plantilla genera un script válido y sin cierres de <script> en los datos', () => {
  const rows = [
    { m: { slug: 'a', name: 'Modelo </script> A', variant: 'max' }, r: result('rrule', { session: { cost: 0.03, tokens: { output: 10, reasoning: 5 }, steps: 3, activeMs: 1000 } }), j: verdict(19, 19), sc: null },
  ];
  rows[0].sc = computeScore(rows[0].r, rows[0].j);
  const data = reportData('rrule', rows);
  assert.equal(data.models[0].fractions.correctness, 1);
  const html = renderReport('Prueba', { tests: [data] });
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.ok(!script.includes('</script>'), 'los datos deben escapar </script>');
  assert.doesNotThrow(() => new vm.Script(script));
});

test('aciertos por categoría', () => {
  assert.equal(byCategory([{ category: 'expr', passed: true }, { category: 'expr', passed: false }, { category: 'null', passed: true }]), '**expr 1/2** · null 1/1');
});

// ---------- comparación de la suite SQL ----------
test('diffRows: tipos estrictos, reales con tolerancia y orden solo con ORDER BY', () => {
  assert.equal(diffRows([[1, 'a']], [[1, 'a']], true), null);
  assert.equal(diffRows([[0.1 + 0.2]], [[0.3]], true), null);
  assert.notEqual(diffRows([['12']], [[12]], true), null);
  assert.equal(diffRows([[2], [1]], [[1], [2]], false), null);
  assert.notEqual(diffRows([[2], [1]], [[1], [2]], true), null);
  assert.notEqual(diffRows([[1]], [[1], [2]], false), null);
});

// ---------- imágenes del README ----------
test('SVG de portada y destacados: bien formados y sin valores NaN', async () => {
  const { highlightsSvg, coverSvg } = await import('../bench.mjs');
  for (const svg of [coverSvg('light'), coverSvg('dark'), highlightsSvg('rrule', 'light'), highlightsSvg('rrule', 'dark')]) {
    assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<\/svg>\n$/);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), 'valores no numéricos en el SVG');
  }
  const hl = highlightsSvg('rrule', 'light');
  for (const t of ['Nota', 'Velocidad', 'Coste por tarea']) assert.ok(hl.includes(`>${t}<`), `falta el panel ${t}`);
});
