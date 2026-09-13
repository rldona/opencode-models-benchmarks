import { describe, it, expect } from 'vitest';
import { execute } from '../src/index.js';

describe('GROUP BY con HAVING', () => {
  it('agrupa y filtra', () => {
    const db = {
      t: { columns: ['g', 'v'], rows: [[ 'a', 10 ], ['a', 20], ['b', 5], ['b', 6], ['c', 100]] },
    };
    const r = execute(db, 'SELECT g, SUM(v) AS s FROM t GROUP BY g HAVING SUM(v) > 20 ORDER BY g');
    expect(r.columns).toEqual(['g', 's']);
    expect(r.rows).toEqual([['a', 30], ['c', 100]]);
  });

  it('GROUP BY de expresiones', () => {
    const db = { t: { columns: ['x'], rows: [[1], [2], [3], [4]] } };
    const r = execute(db, 'SELECT x % 2 AS m, COUNT(*) AS c FROM t GROUP BY x % 2 ORDER BY m');
    expect(r.rows).toEqual([[0, 2], [1, 2]]);
  });
});

describe('ORDER BY con NULL y LIMIT/OFFSET', () => {
  it('NULL primero en ASC y al final en DESC', () => {
    const db = { t: { columns: ['x'], rows: [[3], [null], [1], [2]] } };
    const asc = execute(db, 'SELECT x FROM t ORDER BY x ASC');
    expect(asc.rows).toEqual([[null], [1], [2], [3]]);
    const desc = execute(db, 'SELECT x FROM t ORDER BY x DESC');
    expect(desc.rows).toEqual([[3], [2], [1], [null]]);
  });

  it('LIMIT/OFFSET y posición y alias', () => {
    const db = { t: { columns: ['a', 'b'], rows: [[1, 10], [2, 20], [3, 30], [4, 40]] } };
    const r = execute(db, 'SELECT a AS s FROM t ORDER BY s DESC LIMIT 2 OFFSET 1');
    expect(r.rows).toEqual([[3], [2]]);
    const r2 = execute(db, 'SELECT a, b FROM t ORDER BY 2 DESC LIMIT 2');
    expect(r2.rows).toEqual([[4, 40], [3, 30]]);
    expect(() => execute(db, 'SELECT a FROM t ORDER BY 5')).toThrow();
  });
});

describe('división entera frente a real', () => {
  it('7/2=3, -7/2=-3, 7/2.0=3.5, AVG real, div cero NULL', () => {
    const r1 = execute({}, 'SELECT 7 / 2');
    expect(r1.rows[0][0]).toBe(3);
    const r2 = execute({}, 'SELECT -7 / 2');
    expect(r2.rows[0][0]).toBe(-3);
    const r3 = execute({}, 'SELECT 7 / 2.0');
    expect(r3.rows[0][0]).toBe(3.5);
    const r4 = execute({}, 'SELECT 7 % 2, 7 / 0, 7 % 0');
    expect(r4.rows[0]).toEqual([1, null, null]);
    const db = { t: { columns: ['x'], rows: [[2], [4]] } };
    const r5 = execute(db, 'SELECT AVG(x) FROM t');
    expect(r5.rows[0][0]).toBe(3);
    // AVG siempre real: AVG(x)/2 con AVG=3 real /2 int => 1.5 (real)
    const r6 = execute(db, 'SELECT AVG(x) / 2 FROM t');
    expect(r6.rows[0][0]).toBe(1.5);
    // int/int => int
    const r7 = execute({}, 'SELECT 5 / 2');
    expect(r7.rows[0][0]).toBe(2);
  });
});
