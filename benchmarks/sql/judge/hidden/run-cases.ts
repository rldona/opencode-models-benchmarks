// Registra en vitest los casos de una suite (main o perf). Se copia a __bench__/ solo después del juez.
import { expect, test } from 'vitest';
import { query } from './adapter';
import cases from './cases.json';
import { diffRows } from './compare';
import { dataset } from './datasets.mjs';

type Case = (typeof cases)[number] & { suite?: string; timeLimitMs?: number };

const cache = new Map<string, unknown>();
const tablesFor = (name: string) => {
  if (!cache.has(name)) cache.set(name, dataset(name));
  // Copia por caso: una solución que mute las tablas no afecta a los siguientes.
  return structuredClone(cache.get(name)) as Parameters<typeof query>[0];
};

export function registerCases(suite: 'main' | 'perf') {
  for (const c of cases as Case[]) {
    if ((c.suite ?? 'main') !== suite) continue;
    test(
      `[${c.id}] ${c.category} · ${c.name}`,
      async () => {
        const tables = tablesFor(c.dataset);
        if ('error' in c.expected) {
          let threw = false;
          try {
            await query(tables, c.sql);
          } catch {
            threw = true;
          }
          expect(threw, `debía lanzar un error (SQLite: ${c.expected.sqlite})`).toBe(true);
          return;
        }
        const t0 = performance.now();
        const res = await query(tables, c.sql);
        const ms = performance.now() - t0;
        const diff = diffRows(res?.rows, c.expected.rows as never, c.ordered);
        expect(diff, diff ?? '').toBeNull();
        if (c.timeLimitMs) expect(ms, `tardó ${Math.round(ms)} ms (límite ${c.timeLimitMs} ms)`).toBeLessThan(c.timeLimitMs);
      },
      c.timeLimitMs ? 120_000 : 15_000,
    );
  }
}
