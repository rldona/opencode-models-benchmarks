// Registra en vitest los casos de ejecución de una suite (main o perf). Se copia a __bench__/ solo después del juez.
import { expect, test } from 'vitest';
import * as adapter from './adapter';
import cases from './cases.json';
import type { Compile, Match } from './contract';
import { chunksOf, digest, makeText } from './inputs.mjs';

const compile = (adapter as unknown as { compile: Compile }).compile;

type Enc = { index: number; captures: (string | null)[]; groups: Record<string, string | null> } | null;
type Case = {
  id: string;
  suite: string;
  category: string;
  name: string;
  kind: string;
  pattern: string;
  flags: string;
  steps?: { input: string; lastIndex?: number }[];
  chunks?: string[];
  text?: Parameters<typeof makeText>[0];
  chunk?: number;
  limitMs?: number;
  expected?: unknown;
};

// Misma codificación que el oráculo: undefined → null; groups sin grupos con nombre (o undefined) → {}.
function enc(m: Match | null | undefined): Enc {
  if (m == null) return null;
  const groups: Record<string, string | null> = {};
  for (const k of Object.keys(m.groups ?? {}).sort()) groups[k] = m.groups[k] ?? null;
  return { index: m.index, captures: Array.from(m.captures, (x) => (x === undefined ? null : x)), groups };
}

const short = (v: unknown) => {
  const s = JSON.stringify(v);
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
};

function run(c: Case) {
  if (c.kind === 'error') {
    let err: unknown = null;
    try {
      compile(c.pattern, c.flags);
    } catch (e) {
      err = e;
    }
    expect(err, `/${c.pattern}/${c.flags} debía lanzar SyntaxError`).toBeInstanceOf(SyntaxError);
    return;
  }
  const re = compile(c.pattern, c.flags);
  if (c.kind === 'props') {
    expect({ source: re.source, flags: re.flags }).toEqual(c.expected);
    return;
  }
  if (c.kind === 'exec') {
    const expected = c.expected as { m: Enc; li: number }[];
    c.steps!.forEach((st, i) => {
      if (st.lastIndex !== undefined) re.lastIndex = st.lastIndex;
      const got = { m: enc(re.exec(st.input)), li: re.lastIndex };
      expect(got, `exec nº ${i + 1} sobre ${JSON.stringify(st.input)}: esperado ${short(expected[i])}, obtenido ${short(got)}`).toEqual(expected[i]);
    });
    return;
  }
  if (c.kind === 'stream') {
    const s = re.stream();
    const got: Enc[] = [];
    for (const ch of c.chunks!) got.push(...s.feed(ch).map(enc));
    got.push(...s.end().map(enc));
    expect(got, `coincidencias: esperado ${short(c.expected)}, obtenido ${short(got)}`).toEqual(c.expected);
    return;
  }
  if (c.kind === 'timely') {
    const s = re.stream();
    const perCall = [...c.chunks!.map((ch) => s.feed(ch).map(enc)), s.end().map(enc)];
    const labels = [...c.chunks!.map((ch) => `feed(${JSON.stringify(ch)})`), 'end()'];
    const expected = c.expected as Enc[][];
    perCall.forEach((got, i) => {
      expect(got, `${labels[i]}: esperado ${short(expected[i])}, obtenido ${short(got)}`).toEqual(expected[i]);
    });
    return;
  }
  if (c.kind === 'perf-exec' || c.kind === 'perf-stream') {
    const text = makeText(c.text!);
    const t0 = performance.now();
    let list: Enc[];
    if (c.kind === 'perf-exec') {
      const m = re.exec(text);
      list = m ? [enc(m)] : [];
    } else {
      const s = re.stream();
      list = [];
      for (const ch of chunksOf(text, c.chunk!)) for (const m of s.feed(ch)) list.push(enc(m));
      for (const m of s.end()) list.push(enc(m));
    }
    const ms = performance.now() - t0;
    expect(digest(list), 'resultado distinto del esperado').toEqual(c.expected);
    expect(ms, `tardó ${Math.round(ms)} ms (límite ${c.limitMs} ms)`).toBeLessThan(c.limitMs!);
    return;
  }
  throw new Error(`tipo de caso desconocido: ${c.kind}`);
}

export function registerCases(suite: 'main' | 'perf') {
  for (const c of cases as Case[]) {
    if (c.suite !== suite) continue;
    test(`[${c.id}] ${c.category} · ${c.name}`, () => run(c), suite === 'perf' ? 20_000 : 10_000);
  }
}
