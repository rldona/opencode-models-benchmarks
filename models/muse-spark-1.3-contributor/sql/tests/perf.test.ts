import { describe, it, expect } from 'vitest';
import { execute } from '../src/index.js';

describe('rendimiento', () => {
  it('JOIN por igualdad 100k x 5k < 2s', () => {
    const N = 100000;
    const M = 5000;
    const bigRows: any[][] = new Array(N);
    for (let i = 0; i < N; i++) bigRows[i] = [i % M, i];
    const smallRows: any[][] = new Array(M);
    for (let i = 0; i < M; i++) smallRows[i] = [i, i * 10];
    const db = {
      big: { columns: ['k', 'v'], rows: bigRows },
      small: { columns: ['k', 'w'], rows: smallRows },
    };
    const t0 = performance.now();
    const r = execute(db, 'SELECT big.k, w FROM big JOIN small ON big.k = small.k ORDER BY big.v LIMIT 5');
    const dt = performance.now() - t0;
    console.log('JOIN time ms:', dt, 'rows:', r.rows.length);
    expect(r.rows.length).toBe(5);
    expect(dt).toBeLessThan(2000);
  });

  it('GROUP BY 100k en 5k grupos < 2s', () => {
    const N = 100000;
    const G = 5000;
    const rows: any[][] = new Array(N);
    for (let i = 0; i < N; i++) rows[i] = [i % G, 1];
    const db = { t: { columns: ['g', 'v'], rows } };
    const t0 = performance.now();
    const r = execute(db, 'SELECT g, COUNT(*), SUM(v) FROM t GROUP BY g ORDER BY g');
    const dt = performance.now() - t0;
    console.log('GROUP time ms:', dt, 'groups:', r.rows.length);
    expect(r.rows.length).toBe(G);
    expect(dt).toBeLessThan(2000);
  });
});
