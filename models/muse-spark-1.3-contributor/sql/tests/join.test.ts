import { describe, it, expect } from 'vitest';
import { execute } from '../src/index.js';

describe('LEFT JOIN con filas sin pareja', () => {
  it('conserva izquierdas con NULL', () => {
    const db = {
      e: { columns: ['id', 'name'], rows: [[1, 'a'], [2, 'b'], [3, 'c']] },
      d: { columns: ['id', 'eid'], rows: [[10, 1], [11, 1]] },
    };
    const r = execute(db, 'SELECT e.id, d.id FROM e LEFT JOIN d ON d.eid = e.id ORDER BY e.id, d.id');
    expect(r.columns).toEqual(['id', 'id']);
    expect(r.rows).toEqual([[1, 10], [1, 11], [2, null], [3, null]]);
  });

  it('INNER JOIN filtra sin pareja', () => {
    const db = {
      a: { columns: ['x'], rows: [[1], [2]] },
      b: { columns: ['x'], rows: [[2], [3]] },
    };
    const r = execute(db, 'SELECT a.x, b.x FROM a JOIN b ON a.x = b.x ORDER BY a.x');
    expect(r.rows).toEqual([[2, 2]]);
  });

  it('comma cartesian product', () => {
    const db = {
      a: { columns: ['x'], rows: [[1], [2]] },
      b: { columns: ['y'], rows: [[10], [20]] },
    };
    const r = execute(db, 'SELECT x, y FROM a, b ORDER BY x, y');
    expect(r.rows).toEqual([[1, 10], [1, 20], [2, 10], [2, 20]]);
  });
});
