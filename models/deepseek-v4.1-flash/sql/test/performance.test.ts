import { describe, expect, it } from 'vitest';
import { query } from '../src/index';
import type { Database } from '../src/index';

function buildJoinData(): Database {
  const n = 100_000;
  const m = 5_000;
  const left: number[][] = new Array(n);
  for (let i = 0; i < n; i++) left[i] = [i, i % 997];
  const right: (number | string)[][] = new Array(m);
  for (let i = 0; i < m; i++) right[i] = [i, 'v' + i];
  return {
    a: { columns: ['k', 'v'], rows: left },
    b: { columns: ['k', 'w'], rows: right },
  };
}

function buildGroupData(): Database {
  const n = 100_000;
  const rows: number[][] = new Array(n);
  for (let i = 0; i < n; i++) rows[i] = [i % 5_000, i];
  return { t: { columns: ['g', 'v'], rows } };
}

describe('rendimiento', () => {
  it('JOIN por igualdad 100.000 x 5.000 por debajo de 2 s', () => {
    const db = buildJoinData();
    const t0 = Date.now();
    const result = query(db, 'SELECT a.k, b.w FROM a JOIN b ON a.k = b.k');
    const elapsed = Date.now() - t0;
    expect(result.rows.length).toBe(5_000);
    expect(elapsed).toBeLessThan(2_000);
  }, 30_000);

  it('GROUP BY de 100.000 filas en 5.000 grupos por debajo de 2 s', () => {
    const db = buildGroupData();
    const t0 = Date.now();
    const result = query(
      db,
      'SELECT g, COUNT(*) AS c, SUM(v) AS s FROM t GROUP BY g',
    );
    const elapsed = Date.now() - t0;
    expect(result.rows.length).toBe(5_000);
    expect(elapsed).toBeLessThan(2_000);
  }, 30_000);
});
