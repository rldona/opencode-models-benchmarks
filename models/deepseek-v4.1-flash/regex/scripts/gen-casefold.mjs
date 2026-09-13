import { writeFileSync } from 'node:fs';

const url = 'https://www.unicode.org/Public/UCD/latest/ucd/CaseFolding.txt';
const text = await (await fetch(url)).text();

const map = new Map();
for (const line of text.split('\n')) {
  const m = /^([0-9A-F]+); ([CS]); ([0-9A-F]+);/.exec(line);
  if (!m) continue;
  const src = parseInt(m[1], 16);
  const status = m[2];
  const dst = parseInt(m[3], 16);
  if (status === 'C') {
    map.set(src, dst);
  } else if (!map.has(src)) {
    map.set(src, dst);
  }
}

const entries = [...map.entries()].sort((a, b) => a[0] - b[0]);
let out = '// Generated from Unicode CaseFolding.txt (statuses C and S). Do not edit by hand.\n';
out += 'export const simpleCaseFold: ReadonlyMap<number, number> = new Map<number, number>([\n';
for (const [src, dst] of entries) {
  out += `  [0x${src.toString(16)}, 0x${dst.toString(16)}],\n`;
}
out += ']);\n';

writeFileSync(new URL('../src/casefold.ts', import.meta.url), out);
console.log(`wrote ${entries.length} entries`);
