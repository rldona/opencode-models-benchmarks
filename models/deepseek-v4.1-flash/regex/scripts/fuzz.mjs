import { compile } from '../build-tmp/src/index.js';

let seed = Number(process.argv[2] ?? 12345);
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}
function int(n) {
  return Math.floor(rnd() * n);
}

const ATOM_POOL = [
  'a',
  'b',
  'c',
  '1',
  '\\d',
  '\\D',
  '\\w',
  '\\W',
  '\\s',
  '\\S',
  '.',
  '[ab]',
  '[^a]',
  '[a-c]',
  '[^a-c]',
  '[\\d_]',
  '\\t',
  '\\u0061',
  'x',
  '\\u00df',
  '\\u212a',
];

function gen(depth, state) {
  if (depth <= 0) return genAtom(depth, state);
  const r = rnd();
  if (r < 0.15) return `${gen(depth - 1, state)}|${gen(depth - 1, state)}`;
  if (r < 0.3) return `${genAtom(depth - 1, state)}${genQuant()}`;
  if (r < 0.45) return `(${gen(depth - 1, state)})`;
  if (r < 0.55) return `(?:${gen(depth - 1, state)})`;
  if (r < 0.62) return `(?=${gen(depth - 1, state)})`;
  if (r < 0.69) return `(?!${gen(depth - 1, state)})`;
  if (r < 0.78 && state.groupCount > 0) return `\\${1 + int(state.groupCount)}`;
  let out = '';
  const n = 1 + int(3);
  for (let i = 0; i < n; i++) out += gen(depth - 1, state);
  return out;
}

function genAtom(depth, state) {
  if (depth > 0 && rnd() < 0.3) {
    state.groupCount++;
    return `(${gen(depth - 1, state)})`;
  }
  if (rnd() < 0.05) return '^';
  if (rnd() < 0.05) return '$';
  if (rnd() < 0.08) return pick(['\\b', '\\B']);
  return pick(ATOM_POOL);
}

function genQuant() {
  const q = pick(['*', '+', '?', '{0,2}', '{1,2}', '{0,3}', '{2}', '{1,}']);
  return rnd() < 0.3 ? q + '?' : q;
}

const INPUT_ALPHABET = ['a', 'b', 'c', 'x', '1', ' ', '\n', '\u00df', '\u212a', '\u{1F600}', '_'];

function genInput() {
  let out = '';
  const n = int(12);
  for (let i = 0; i < n; i++) out += pick(INPUT_ALPHABET);
  return out;
}

const FLAG_SETS = ['', '', 'i', 'u', 'iu', 'g', 'gu', 'gi', 'y', 'iy', 'm', 'ms', 's', 'su', 'gui', 'giu', 'gy'];

function normalize(m, lastIndex) {
  if (m === null) return { index: -1, captures: [], groups: {}, lastIndex };
  if (Array.isArray(m)) {
    return {
      index: m.index,
      captures: Array.from(m).map((x) => (x === undefined ? undefined : x)),
      groups: m.groups ? { ...m.groups } : {},
      lastIndex,
    };
  }
  return { index: m.index, captures: [...m.captures], groups: { ...m.groups }, lastIndex };
}

function iterate(re, input, collect, unicode) {
  let steps = 0;
  while (steps < 50) {
    const m = re.exec(input);
    if (m === null) break;
    collect.push(normalize(m, re.lastIndex));
    steps++;
    const text = Array.isArray(m) ? m[0] : m.captures[0];
    if (text.length === 0) {
      let next = m.index + 1;
      if (unicode && next < input.length) {
        const cu = input.charCodeAt(m.index);
        const nx = input.charCodeAt(m.index + 1);
        if (cu >= 0xd800 && cu <= 0xdbff && nx >= 0xdc00 && nx <= 0xdfff) next = m.index + 2;
      }
      if (next > input.length) break;
      re.lastIndex = next;
    } else {
      re.lastIndex = m.index + text.length;
    }
  }
}

let tested = 0;
let failed = 0;
for (let iter = 0; iter < 30000; iter++) {
  if (iter % 500 === 0) console.log(`progress ${iter} tested=${tested} failed=${failed}`);
  const state = { groupCount: 0 };
  const pattern = gen(3, state);
  const flags = pick(FLAG_SETS);
  let expected;
  try {
    expected = new RegExp(pattern, flags);
  } catch {
    continue;
  }
  let actual;
  try {
    actual = compile(pattern, flags);
  } catch (e) {
    failed++;
    console.log('COMPILE THREW', JSON.stringify(pattern), flags, e.message);
    if (failed > 10) break;
    continue;
  }
  const input = genInput();
  tested++;
  let em;
  let am;
  if (process.env.FUZZ_TRACE) {
    console.log(`iter ${iter} pattern=${JSON.stringify(pattern)} flags=${flags} input=${JSON.stringify(input)}`);
  }
  try {
    em = expected.exec(input);
    am = actual.exec(input);
  } catch (e) {
    failed++;
    console.log('EXEC THREW', JSON.stringify(pattern), flags, JSON.stringify(input), e.message);
    if (failed > 10) break;
    continue;
  }
  const es = normalize(em, expected.lastIndex);
  const as = normalize(am, actual.lastIndex);
  if (JSON.stringify(es) !== JSON.stringify(as)) {
    failed++;
    console.log('MISMATCH', JSON.stringify(pattern), flags, JSON.stringify(input));
    console.log('  expected', JSON.stringify(es));
    console.log('  actual  ', JSON.stringify(as));
    if (failed > 10) break;
  }
  if ((flags.includes('g') || flags.includes('y')) && failed <= 10) {
    const eArr = [];
    const aArr = [];
    const eRe = new RegExp(pattern, flags);
    const aRe = compile(pattern, flags);
    iterate(eRe, input, eArr, flags.includes('u'));
    iterate(aRe, input, aArr, flags.includes('u'));
    if (JSON.stringify(eArr) !== JSON.stringify(aArr)) {
      failed++;
      console.log('ITER MISMATCH', JSON.stringify(pattern), flags, JSON.stringify(input));
      console.log('  expected', JSON.stringify(eArr));
      console.log('  actual  ', JSON.stringify(aArr));
      if (failed > 10) break;
    }
  }
}
console.log(`tested=${tested} failed=${failed}`);
