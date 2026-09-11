import { compile } from '../build-tmp/src/index.js';

let failed = false;
function time(label, fn, limitMs) {
  const t0 = Date.now();
  const result = fn();
  const dt = Date.now() - t0;
  const ok = dt < limitMs;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${dt} ms (limit ${limitMs})`);
  if (!ok) failed = true;
  return result;
}

time('exec (a|a)*b on 50k no match', () => compile('(a|a)*b').exec('a'.repeat(50000)), 1000);
time('exec (x+x+)+y on 50k no match', () => compile('(x+x+)+y').exec('x'.repeat(50000)), 1000);
time('exec .*.*=.* on 50k no match', () => compile('.*.*=.*').exec('a'.repeat(50000)), 1000);
time('exec a*b on 100k a', () => compile('a*b').exec('a'.repeat(100000)), 1000);

const text = '1234567890'.repeat(200000) + 'x';
const chunks = [];
for (let i = 0; i < text.length; i += 1024) chunks.push(text.slice(i, i + 1024));
time(
  'stream \\d+ 2MB in 1KB chunks',
  () => {
    const st = compile('\\d+').stream();
    let count = 0;
    for (const c of chunks) count += st.feed(c).length;
    count += st.end().length;
    return count;
  },
  2000,
);

if (failed) {
  console.error('PERF FAILED');
  process.exit(1);
}
console.log('PERF OK');
