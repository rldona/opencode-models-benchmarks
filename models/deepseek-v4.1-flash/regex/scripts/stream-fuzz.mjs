import { compile } from '../build-tmp/src/index.js';

let seed = Number(process.argv[2] ?? 999);
const iterations = Number(process.argv[3] ?? 5000);
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
  '\\w',
  '\\s',
  '.',
  '[ab]',
  '[^a]',
  '[a-c]',
  'x',
  '\\u00df',
  '\\u212a',
  '\\u{1F600}',
];

function genAtom(depth, state) {
  if (depth > 0 && rnd() < 0.25) {
    state.groupCount++;
    return `(${gen(depth - 1, state)})`;
  }
  if (rnd() < 0.05) return '^';
  if (rnd() < 0.05) return '$';
  if (rnd() < 0.08) return pick(['\\b', '\\B']);
  return pick(ATOM_POOL);
}

function genQuant() {
  const q = pick(['*', '+', '?', '{0,2}', '{1,2}', '{0,3}', '{2,3}', '{1,}']);
  return rnd() < 0.3 ? q + '?' : q;
}

function gen(depth, state) {
  if (depth <= 0) return genAtom(depth, state);
  const r = rnd();
  if (r < 0.12) return `${gen(depth - 1, state)}|${gen(depth - 1, state)}`;
  if (r < 0.3) return `${genAtom(depth - 1, state)}${genQuant()}`;
  if (r < 0.45) return `(${gen(depth - 1, state)})`;
  if (r < 0.55) return `(?:${gen(depth - 1, state)})`;
  if (r < 0.62) return `(?=${gen(depth - 1, state)})`;
  if (r < 0.68) return `(?!${gen(depth - 1, state)})`;
  if (r < 0.78 && state.groupCount > 0) return `\\${1 + int(state.groupCount)}`;
  let out = '';
  const n = 1 + int(3);
  for (let i = 0; i < n; i++) out += gen(depth - 1, state);
  return out;
}

const INPUT_ALPHABET = ['a', 'b', 'c', 'x', '1', ' ', '\n', '\u00df', '\u212a', '\u{1F600}', '_'];
const FLAG_SETS = ['', 'i', 'u', 'iu', 'g', 'gu', 'gi', 'gui', 'm', 'ms', 's', 'su', 'giu', 'y', 'iy', 'gy', 'guy'];

function genInput() {
  let out = '';
  const n = int(20);
  for (let i = 0; i < n; i++) out += pick(INPUT_ALPHABET);
  return out;
}

function normalize(m) {
  return {
    index: m.index,
    captures: Array.from(m).map((x) => (x === undefined ? undefined : x)),
    groups: m.groups ? { ...m.groups } : {},
  };
}

function chunkify(text, cuts) {
  const chunks = [];
  let prev = 0;
  for (const c of cuts) {
    if (c > prev) chunks.push(text.slice(prev, c));
    prev = Math.max(prev, c);
  }
  chunks.push(text.slice(prev));
  return chunks;
}

let tested = 0;
let failed = 0;
for (let iter = 0; iter < iterations; iter++) {
  if (iter % 10 === 0 || process.env.SFUZZ_TRACE) console.log(`progress ${iter} tested=${tested} failed=${failed}`);
  const state = { groupCount: 0 };
  const pattern = gen(3, state);
  const flags = pick(FLAG_SETS);
  let expected;
  try {
    expected = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
  } catch {
    continue;
  }
  let actual;
  try {
    actual = compile(pattern, flags);
  } catch (e) {
    if (pattern.includes('\\u{') && !flags.includes('u')) continue;
    failed++;
    console.log('COMPILE THREW', JSON.stringify(pattern), flags, e.message);
    if (failed > 5) break;
    continue;
  }
  const input = genInput();
  tested++;
  if (tested <= 3 || process.env.SFUZZ_TRACE) {
    console.log(`case tested=${tested} pattern=${JSON.stringify(pattern)} flags=${flags} input=${JSON.stringify(input)}`);
  }
  const expectedMatches = [...input.matchAll(expected)].map(normalize);
  const stream = actual.stream();
  const actualMatches = [];
  let pos = 0;
  while (pos <= input.length) {
    const size = 1 + int(4);
    const chunk = input.slice(pos, pos + size);
    pos += size;
    for (const m of stream.feed(chunk)) {
      actualMatches.push({ index: m.index, captures: [...m.captures], groups: { ...m.groups } });
    }
  }
  for (const m of stream.end()) {
    actualMatches.push({ index: m.index, captures: [...m.captures], groups: { ...m.groups } });
  }
  if (JSON.stringify(expectedMatches) !== JSON.stringify(actualMatches)) {
    failed++;
    console.log('STREAM MISMATCH', JSON.stringify(pattern), flags, JSON.stringify(input));
    console.log('  expected', JSON.stringify(expectedMatches));
    console.log('  actual  ', JSON.stringify(actualMatches));
    if (failed > 5) break;
  }
}
console.log(`tested=${tested} failed=${failed}`);
