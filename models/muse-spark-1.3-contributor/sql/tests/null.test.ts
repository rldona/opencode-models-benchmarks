import { describe, it, expect } from 'vitest';
import { execute } from '../src/index.js';

function db1() {
  return {
    t: { columns: ['a', 'b'], rows: [[1, 'x'], [2, null], [3, 'y']] as any[][] },
  };
}

describe('NULL en NOT IN', () => {
  it('NOT IN con NULL filtra (3VL)', () => {
    const db = { t: { columns: ['a'], rows: [[1], [2], [3]] } };
    // 1 NOT IN (2, NULL) => NULL => no pasa WHERE
    const r = execute(db, 'SELECT a FROM t WHERE a NOT IN (2, NULL) ORDER BY a');
    expect(r.rows).toEqual([]);
    // 3 NOT IN (1, 2) => true
    const r2 = execute(db, 'SELECT a FROM t WHERE a NOT IN (1, 2) ORDER BY a');
    expect(r2.rows).toEqual([[3]]);
    // IN con NULL: 1 IN (1, NULL) => true
    const r3 = execute(db, 'SELECT a FROM t WHERE a IN (1, NULL) ORDER BY a');
    expect(r3.rows).toEqual([[1]]);
    // 2 IN (1, NULL) => NULL => filtra
    const r4 = execute({ t: { columns: ['a'], rows: [[2]] } }, 'SELECT a FROM t WHERE a IN (1, NULL)');
    expect(r4.rows).toEqual([]);
  });

  it('NULL en agregados: SUM ignora NULL, COUNT 0, SUM vacío NULL', () => {
    const db = { t: { columns: ['x'], rows: [[1], [null], [3]] } };
    const r = execute(db, 'SELECT COUNT(*), COUNT(x), SUM(x), AVG(x), MIN(x), MAX(x) FROM t');
    expect(r.rows[0][0]).toBe(3);
    expect(r.rows[0][1]).toBe(2);
    expect(r.rows[0][2]).toBe(4);
    expect(r.rows[0][3]).toBe(2);
    expect(r.rows[0][4]).toBe(1);
    expect(r.rows[0][5]).toBe(3);
    const empty = { t: { columns: ['x'], rows: [] as any[][] } };
    const r2 = execute(empty, 'SELECT SUM(x), COUNT(*), COUNT(x), AVG(x) FROM t');
    expect(r2.rows[0][0]).toBe(null);
    expect(r2.rows[0][1]).toBe(0);
    expect(r2.rows[0][2]).toBe(0);
    expect(r2.rows[0][3]).toBe(null);
    // COUNT DISTINCT ignora NULL
    const db2 = { t: { columns: ['x'], rows: [[1], [1], [null], [2]] } };
    const r3 = execute(db2, 'SELECT COUNT(DISTINCT x) FROM t');
    expect(r3.rows[0][0]).toBe(2);
  });
});
