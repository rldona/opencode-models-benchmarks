// Genera ../hidden/cases.json: casos de curated.mjs, casos al azar y casos de tipos (types.mjs).
//   node benchmarks/regex/judge/oracle/gen-cases.mjs
// Resultados esperados: los de RegExp en V8, y solo se conservan los casos en los que JavaScriptCore (el motor de
// Safari, /System/Library/Frameworks/JavaScriptCore.framework) da exactamente lo mismo. Streaming "a tiempo": para
// cada prefijo se prueban todas las continuaciones cortas y se considera definitiva la parte común de sus
// coincidencias; el caso se descarta si esa parte cambia al alargar las continuaciones (horizonte insuficiente).
// Rendimiento: las huellas se calculan en un proceso aparte con el motor lineal experimental de V8.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunksOf, digest, makeText } from '../hidden/inputs.mjs';
import { errorCases, execCases, perfCases, propsCases, seeds, streamCases, timelyCases } from './curated.mjs';
import { typeCases } from './types.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const runnerPath = path.join(here, 'engine-runner.js');
const { runAll, encMatch } = require(runnerPath);
const JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc';
const out = path.join(here, '..', 'hidden', 'cases.json');

const GROUP = {
  capturas: 'semantica', cuantificadores: 'semantica', alternancia: 'semantica', clases: 'semantica', anclas: 'semantica',
  flags: 'semantica', mayusculas: 'semantica', unicode: 'semantica', sintaxis: 'semantica', azar: 'semantica',
  retro: 'retro', lookahead: 'retro', 'azar-retro': 'retro',
  streaming: 'streaming', 'a-tiempo': 'streaming',
  rendimiento: 'rendimiento', tipos: 'tipos',
};
const problems = [];
const warn = (msg) => problems.push(msg);

// ---------- utilidades ----------
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}
const validU = (p) => {
  try {
    new RegExp(p, 'u');
    return true;
  } catch {
    return false;
  }
};
const hasRetro = (p) => /\\[1-9]|\\k<|\(\?[=!]/.test(p.replace(/\\\\/g, ''));
const canon = (v) => JSON.stringify(v);

function jscRun(specs) {
  const tmp = path.join(os.tmpdir(), `regex-specs-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(specs));
  const r = spawnSync(JSC, [runnerPath, '--', tmp], { encoding: 'utf8', maxBuffer: 1 << 30 });
  fs.rmSync(tmp, { force: true });
  if (r.status !== 0) throw new Error(`jsc falló: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// Ejecuta en los dos motores; devuelve los resultados de V8 (null donde JavaScriptCore discrepa).
function bothEngines(specs, labels) {
  const v8 = runAll(specs);
  const jsc = jscRun(specs);
  return v8.map((res, i) => {
    if (canon(res) === canon(jsc[i])) return res;
    warn(`V8 y JavaScriptCore discrepan, descarto: ${labels[i]}\n    V8:  ${canon(res).slice(0, 300)}\n    JSC: ${canon(jsc[i]).slice(0, 300)}`);
    return null;
  });
}

const stepsFor = (flags, entry) =>
  typeof entry === 'string'
    ? /[gy]/.test(flags) ? [{ input: entry }, { input: entry }, { input: entry }] : [{ input: entry }]
    : entry.steps;

function chunkBySizes(text, sizes) {
  const out = [];
  let i = 0;
  for (let k = 0; i < text.length; k++) {
    const n = sizes[k % sizes.length];
    out.push(text.slice(i, i + n));
    i += n;
    if (k > 10 * text.length + 10) throw new Error('tamaños de trozo sin avance');
  }
  return out;
}

function matchAllEnc(re, text) {
  const list = [];
  for (const m of text.matchAll(re)) list.push(encMatch(m));
  return list;
}

// Parte común de las coincidencias de T + S para toda continuación S de longitud <= k sobre `alpha`.
function definitive(re, T, alpha, k) {
  let prefix = null;
  const rec = (S, depth) => {
    const list = matchAllEnc(re, T + S).map(canon);
    if (prefix === null) prefix = list;
    else {
      let i = 0;
      while (i < prefix.length && i < list.length && prefix[i] === list[i]) i++;
      prefix = prefix.slice(0, i);
    }
    if (depth < k) for (const c of alpha) rec(S + c, depth + 1);
  };
  rec('', 0);
  return prefix;
}

// Lo que debe devolver cada llamada (feed por trozo y end) o null si el horizonte no basta.
function timelyExpected(pattern, flags, chunks, alpha, k = 4) {
  const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
  const perCall = [];
  let T = '';
  let prev = [];
  for (const c of chunks) {
    T += c;
    const a = definitive(re, T, alpha, k);
    const b = definitive(re, T, alpha, k + 1);
    if (canon(a) !== canon(b)) return { unstable: `prefijo ${JSON.stringify(T)}: cambia con continuaciones de ${k + 1}` };
    if (canon(a.slice(0, prev.length)) !== canon(prev)) return { unstable: `prefijo ${JSON.stringify(T)}: no extiende lo anterior` };
    perCall.push(a.slice(prev.length).map((x) => JSON.parse(x)));
    prev = a;
  }
  const all = matchAllEnc(re, T).map(canon);
  if (canon(all.slice(0, prev.length)) !== canon(prev)) return { unstable: 'el final no extiende lo definitivo' };
  perCall.push(all.slice(prev.length).map((x) => JSON.parse(x)));
  return { perCall, all: all.map((x) => JSON.parse(x)) };
}

// ---------- casos al azar ----------
function genPattern(rnd, retro) {
  const int = (n) => Math.floor(rnd() * n);
  const pick = (a) => a[int(a.length)];
  let ngroups = 0;
  const leaves = ['a', 'a', 'b', 'b', 'c', '.', '[ab]', '[^a]', '[a-c]', r('\\w'), r('\\d'), r('\\s'), 'A'];
  function r(s) { return s; }
  function quant() {
    return pick(['*', '+', '?', '{0,2}', '{1,2}', '{2}', '{2,}', '*', '+', '?']) + (rnd() < 0.3 ? '?' : '');
  }
  function atom(d) {
    const x = rnd();
    if (x < 0.45 || d >= 3) return pick(leaves);
    if (x < 0.75) {
      ngroups++;
      return `(${alt(d + 1)})`;
    }
    if (x < 0.85) {
      const name = `g${++ngroups}`;
      return `(?<${name}>${alt(d + 1)})`;
    }
    return `(?:${alt(d + 1)})`;
  }
  function term(d) {
    const x = rnd();
    if (x < 0.07) return pick(['^', '$', '\\b', '\\B']);
    if (retro && x < 0.15 && ngroups > 0) return `\\${1 + int(ngroups)}`;
    if (retro && x < 0.21 && d < 3) return `(?${pick(['=', '!'])}${alt(d + 1)})`;
    let a = atom(d);
    if (rnd() < 0.45) a += quant();
    return a;
  }
  function seq(d) {
    const n = rnd() < 0.1 ? 0 : 1 + int(3);
    let s = '';
    for (let i = 0; i < n; i++) s += term(d);
    return s;
  }
  function alt(d) {
    const n = rnd() < 0.3 ? 2 + int(2) : 1;
    return Array.from({ length: n }, () => seq(d)).join('|');
  }
  return alt(0);
}

function genInput(rnd, maxLen = 9) {
  const chars = 'aaabbbccAB 1\n';
  const n = Math.floor(rnd() * (maxLen + 1));
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(rnd() * chars.length)];
  return s;
}

const FUZZ_FLAGS = ['', '', '', 'i', 'm', 's', 'u', 'iu', 'g', 'y', 'gi', 'mu', 'su'];

function fuzzExec(seed, count, retro) {
  const rnd = lcg(seed);
  const cands = [];
  const seen = new Set();
  for (let tries = 0; cands.length < count * 3 && tries < count * 200; tries++) {
    const pattern = genPattern(rnd, retro);
    if (!pattern || pattern.length > 40 || hasRetro(pattern) !== retro || !validU(pattern)) continue;
    const flags = FUZZ_FLAGS[Math.floor(rnd() * FUZZ_FLAGS.length)];
    try {
      new RegExp(pattern, flags);
    } catch {
      continue;
    }
    const input = genInput(rnd);
    const key = `${pattern}/${flags}/${input}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cands.push({ pattern, flags, steps: stepsFor(flags, input) });
  }
  const res = bothEngines(cands, cands.map((c) => `azar ${c.pattern} /${c.flags} ${JSON.stringify(c.steps[0].input)}`));
  // Interesantes: la mayoría con coincidencia y con algún grupo.
  const scored = cands.map((c, i) => ({ c, res: res[i] })).filter((x) => x.res && !x.res.error);
  const withMatch = scored.filter((x) => x.res.steps[0].m && x.res.steps[0].m.captures.length > 1);
  const noMatch = scored.filter((x) => !x.res.steps[0].m);
  return [...withMatch.slice(0, Math.round(count * 0.85)), ...noMatch.slice(0, count - Math.min(withMatch.length, Math.round(count * 0.85)))].slice(0, count);
}

// ---------- construcción ----------
const cases = [];
const push = (c) => cases.push({ id: String(cases.length + 1).padStart(3, '0'), suite: 'main', ...c, group: GROUP[c.category] });

// exec curados
{
  const specs = [];
  const meta = [];
  for (const [category, name, pattern, flags, entries] of execCases) {
    if (!validU(pattern)) warn(`patrón no válido con u (se evalúa igualmente): ${pattern}`);
    entries.forEach((entry, i) => {
      specs.push({ pattern, flags, steps: stepsFor(flags, entry) });
      meta.push({ category, name: entries.length > 1 ? `${name} (${i + 1})` : name });
    });
  }
  const res = bothEngines(specs, meta.map((m, i) => `${m.name} · ${specs[i].pattern}`));
  specs.forEach((spec, i) => {
    if (!res[i]) return;
    if (res[i].error) return warn(`el patrón lanza en V8: ${spec.pattern} /${spec.flags}`);
    push({ ...meta[i], kind: 'exec', pattern: spec.pattern, flags: spec.flags, steps: spec.steps, expected: res[i].steps });
  });
}

// errores y propiedades
{
  const specs = errorCases.map(([, pattern, flags]) => ({ pattern, flags, props: true }));
  const res = bothEngines(specs, errorCases.map(([n]) => n));
  errorCases.forEach(([name, pattern, flags], i) => {
    if (!res[i]) return;
    if (res[i].error !== 'SyntaxError') return warn(`no lanza SyntaxError: ${name} (${pattern} /${flags})`);
    push({ category: 'sintaxis', name: `error: ${name}`, kind: 'error', pattern, flags });
  });
  const pspecs = propsCases.map(([, pattern, flags]) => ({ pattern, flags, props: true }));
  const pres = bothEngines(pspecs, propsCases.map(([n]) => n));
  propsCases.forEach(([name, pattern, flags], i) => {
    if (pres[i] && !pres[i].error) push({ category: 'sintaxis', name: `source y flags: ${name}`, kind: 'props', pattern, flags, expected: pres[i] });
  });
}

// azar
for (const x of fuzzExec(seeds.exec, 150, false)) {
  push({ category: 'azar', name: `azar ${x.c.pattern} /${x.c.flags}`, kind: 'exec', pattern: x.c.pattern, flags: x.c.flags, steps: x.c.steps, expected: x.res.steps });
}
for (const x of fuzzExec(seeds.retro, 35, true)) {
  push({ category: 'azar-retro', name: `azar ${x.c.pattern} /${x.c.flags}`, kind: 'exec', pattern: x.c.pattern, flags: x.c.flags, steps: x.c.steps, expected: x.res.steps });
}

// streaming (resultado final): curados + al azar
{
  const items = streamCases.map((s) => ({ ...s, chunks: chunkBySizes(s.text, s.chunks) }));
  const rnd = lcg(seeds.stream);
  for (let tries = 0; items.length < streamCases.length + 25 && tries < 5000; tries++) {
    const pattern = genPattern(rnd, rnd() < 0.3);
    if (!pattern || pattern.length > 30 || !validU(pattern)) continue;
    const flags = ['', 'i', 'm', 'u', 'iu', 's'][Math.floor(rnd() * 6)];
    let text = '';
    for (let i = 0; i < 3; i++) text += genInput(rnd, 8) + ' ';
    const sizes = [1 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 6)];
    const all = matchAllEnc(new RegExp(pattern, flags + 'g'), text);
    if (all.length < 2 || all.every((m) => m.captures[0] === '')) continue;
    items.push({ name: `azar ${pattern} /${flags}`, pattern, flags, text, chunks: chunkBySizes(text, sizes) });
  }
  const res = bothEngines(items.map((s) => ({ pattern: s.pattern, flags: s.flags, text: s.text })), items.map((s) => `stream ${s.name}`));
  items.forEach((s, i) => {
    if (res[i] && !res[i].error) push({ category: 'streaming', name: `stream: ${s.name}`, kind: 'stream', pattern: s.pattern, flags: s.flags, chunks: s.chunks, expected: res[i].all });
  });
}

// streaming a tiempo: curados + al azar (sin retrorreferencias ni lookahead)
{
  const items = timelyCases.map((s) => {
    const cuts = [0, ...s.split, s.text.length];
    return { ...s, chunks: cuts.slice(1).map((c, i) => s.text.slice(cuts[i], c)) };
  });
  const rnd = lcg(seeds.timely);
  let fuzzOk = 0;
  for (let tries = 0; fuzzOk < 14 && tries < 400; tries++) {
    const pattern = genPattern(rnd, false);
    if (!pattern || pattern.length > 16 || !validU(pattern) || /\{/.test(pattern)) continue;
    const flags = ['', 'm', 'i'][Math.floor(rnd() * 3)];
    const text = genInput(rnd, 6).replace(/[A1]/g, 'a');
    if (text.length < 3) continue;
    const all = matchAllEnc(new RegExp(pattern, flags + 'g'), text);
    if (!all.some((m) => m.captures[0] !== '')) continue;
    items.push({ name: `azar ${pattern} /${flags}`, pattern, flags, text, chunks: chunksOf(text, 1), alpha: 'abc \n', fuzz: true });
    fuzzOk++;
  }
  const checks = bothEngines(items.map((s) => ({ pattern: s.pattern, flags: s.flags, text: s.text })), items.map((s) => `a tiempo ${s.name}`));
  items.forEach((s, i) => {
    if (!checks[i] || checks[i].error) return;
    const t = timelyExpected(s.pattern, s.flags, s.chunks, s.alpha);
    if (t.unstable) return s.fuzz ? undefined : warn(`a tiempo descartado (${s.name}): ${t.unstable}`);
    if (canon(t.all) !== canon(checks[i].all)) return warn(`a tiempo: final distinto del de los motores (${s.name})`);
    push({ category: 'a-tiempo', name: `a tiempo: ${s.name}`, kind: 'timely', pattern: s.pattern, flags: s.flags, chunks: s.chunks, expected: t.perCall });
  });
}

// rendimiento: huellas con el motor lineal experimental de V8 (proceso aparte)
{
  const script = `
    const { encMatch } = require(${JSON.stringify(runnerPath)});
    import(${JSON.stringify(path.join(here, '..', 'hidden', 'inputs.mjs'))}).then(({ makeText, digest }) => {
      const cases = JSON.parse(process.argv[1]);
      const res = cases.map((c) => {
        if (c.known === null) return { ...digest([]), ms: 0 };
        const text = makeText(c.text);
        const t0 = Date.now();
        let list;
        if (c.stream) list = [...text.matchAll(new RegExp(c.pattern, c.flags + 'g'))].map(encMatch);
        else { const m = new RegExp(c.pattern, c.flags).exec(text); list = m ? [encMatch(m)] : []; }
        return { ...digest(list), ms: Date.now() - t0 };
      });
      console.log(JSON.stringify(res));
    });`;
  const r = spawnSync(process.execPath, ['--enable-experimental-regexp-engine-on-excessive-backtracks', '-e', script, JSON.stringify(perfCases)], {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 1 << 30,
  });
  if (r.status !== 0) throw new Error(`cálculo de rendimiento falló: ${r.stderr || r.error}`);
  const res = JSON.parse(r.stdout);
  perfCases.forEach((c, i) => {
    const { ms, ...expected } = res[i];
    if (ms > 5000) warn(`V8 tardó ${ms} ms en ${c.name}`);
    // Los "sin coincidencia evidente" se comprueban con el mismo texto a escala reducida (cada parte ≤ 12 veces),
    // que V8 resuelve rápido.
    const small = c.text.parts && makeText({ parts: c.text.parts.map(([s, n]) => [s, Math.min(n, 12)]) });
    if (c.known === null && (!small || new RegExp(c.pattern, c.flags).exec(small) !== null)) {
      throw new Error(`${c.name}: marcado sin coincidencia pero la versión reducida del texto coincide`);
    }
    push({
      suite: 'perf',
      category: 'rendimiento',
      name: c.name,
      kind: c.stream ? 'perf-stream' : 'perf-exec',
      pattern: c.pattern,
      flags: c.flags,
      text: c.text,
      ...(c.stream ? { chunk: c.stream } : {}),
      limitMs: c.limitMs,
      expected,
    });
  });
}

// tipos
for (const [name, code] of typeCases) push({ suite: 'types', category: 'tipos', name, kind: 'type', code });

fs.writeFileSync(out, JSON.stringify(cases, null, 1) + '\n');
const by = (k) => Object.entries(cases.reduce((a, c) => ((a[c[k]] = (a[c[k]] ?? 0) + 1), a), {})).map(([x, n]) => `${x} ${n}`).join(' · ');
console.log(`${cases.length} casos → ${path.relative(process.cwd(), out)}`);
console.log(`  por bloque: ${by('group')}`);
console.log(`  por categoría: ${by('category')}`);
if (problems.length) console.log(`\n${problems.length} avisos:\n- ${problems.join('\n- ')}`);
