// Suite oculta de tipos: escribe un fichero con todos los casos (uno por bloque), lo compila una vez con `tsc` y cada
// caso pasa si su bloque no tiene errores. El tsc es el fijado por el benchmark (BENCH_TSC, igual para todos los
// modelos); si no está, el de la solución. Se copia a __bench__/ solo después del juez.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import cases from './cases.json';

const here = path.dirname(fileURLToPath(import.meta.url));
const typeCases = (cases as { id: string; suite: string; category: string; name: string; code?: string }[]).filter((c) => c.suite === 'types');

const lines = [
  '// Generado por hidden-types.test.ts',
  "import { compile } from './adapter';",
  'type Eq<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;',
  'declare function ok<T extends true>(): void;',
  'declare const s: string;',
  'void ok; void s; void compile;',
];
const ranges = new Map<string, [number, number]>();
for (const c of typeCases) {
  lines.push(`function case_${c.id}() {`);
  const start = lines.length + 1;
  lines.push(...c.code!.split('\n').map((l) => `  ${l}`));
  ranges.set(c.id, [start - 1, lines.length + 1]); // incluye la cabecera y el cierre del bloque
  lines.push('}', `void case_${c.id};`);
}
fs.writeFileSync(path.join(here, 'types-check.ts'), lines.join('\n') + '\n');
fs.writeFileSync(
  path.join(here, 'tsconfig.types.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM'],
      types: [],
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      noUnusedLocals: false,
      noUnusedParameters: false,
    },
    files: ['types-check.ts'],
  }),
);

const tsc = process.env.BENCH_TSC && fs.existsSync(process.env.BENCH_TSC) ? process.env.BENCH_TSC : path.join(here, '..', 'node_modules', '.bin', 'tsc');
const r = spawnSync(tsc, ['-p', path.join(here, 'tsconfig.types.json'), '--pretty', 'false'], { encoding: 'utf8', timeout: 90_000 });
const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
// Errores del fichero de casos: "…types-check.ts(12,5): error TS2322: …". Los de la solución no cuentan.
const errors: { line: number; text: string }[] = [];
for (const m of output.matchAll(/types-check\.ts\((\d+),\d+\): error (TS\d+: .*)/g)) errors.push({ line: Number(m[1]), text: m[2] });
const setupError = r.error ? String(r.error) : !fs.existsSync(tsc) ? `no hay tsc en ${tsc}` : null;

for (const c of typeCases) {
  test(`[${c.id}] ${c.category} · ${c.name}`, () => {
    expect(setupError, setupError ?? '').toBeNull();
    const [from, to] = ranges.get(c.id)!;
    const mine = errors.filter((e) => e.line >= from && e.line <= to).map((e) => `línea ${e.line - from}: ${e.text}`);
    const header = errors.filter((e) => e.line < 7).map((e) => e.text);
    expect([...header, ...mine], [...header, ...mine].join('\n')).toEqual([]);
  });
}
