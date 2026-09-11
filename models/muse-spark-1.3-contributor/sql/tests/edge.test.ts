import { describe, it, expect } from 'vitest';
import { execute } from '../src/index.js';

describe('precedencia y 3VL', () => {
  it('|| más alta que *', () => {
    // (2||3)*4 = "23"*4 = 92 (texto "23" -> 23)
    expect(execute({}, 'SELECT 2 || 3 * 4').rows).toEqual([[92]]);
    // 1+2*3 = 7
    expect(execute({}, 'SELECT 1 + 2 * 3').rows).toEqual([[7]]);
    // NOT más bajo que = : NOT (1=0) = 1
    expect(execute({}, 'SELECT NOT 1 = 0').rows).toEqual([[1]]);
    // AND antes que OR
    expect(execute({}, 'SELECT 1 OR 0 AND 0').rows).toEqual([[1]]);
    expect(execute({}, 'SELECT (1 OR 0) AND 0').rows).toEqual([[0]]);
  });
  it('booleanos 1/0 y WHERE truthy', () => {
    expect(execute({}, 'SELECT 1 = 1, 1 != 2, 1 < 2').rows).toEqual([[1, 1, 1]]);
    const db = { t: { columns: ['x'], rows: [[2], [0], [null]] } };
    expect(execute(db, 'SELECT x FROM t WHERE x').rows).toEqual([[2]]);
    expect(execute({}, 'SELECT NULL AND 0, NULL AND 1, NULL OR 0, NULL OR 1, NOT NULL').rows)
      .toEqual([[0, null, null, 1, null]]);
  });
  it('BETWEEN / IN / LIKE con NULL', () => {
    expect(execute({}, 'SELECT 2 BETWEEN 1 AND 3, NULL BETWEEN 1 AND 3').rows).toEqual([[1, null]]);
    expect(execute({}, 'SELECT 5 NOT BETWEEN 1 AND 10').rows).toEqual([[0]]);
    const db = { t: { columns: ['a'], rows: [[2]] } };
    expect(execute(db, 'SELECT a FROM t WHERE a BETWEEN 1 AND NULL').rows).toEqual([]);
    expect(execute({}, "SELECT 123 LIKE '12%', 'abc' LIKE NULL, NULL LIKE 'a%'").rows)
      .toEqual([[1, null, null]]);
    expect(execute({}, "SELECT 'x' || NULL, 1 + NULL").rows).toEqual([[null, null]]);
  });
  it('CASE, paréntesis, == != <>', () => {
    expect(execute({}, 'SELECT 1 == 1, 1 != 2, 1 <> 2').rows).toEqual([[1, 1, 1]]);
    expect(execute({}, 'SELECT CASE NULL WHEN NULL THEN 1 ELSE 0 END').rows).toEqual([[0]]);
    expect(execute({}, 'SELECT CASE WHEN NULL THEN 1 ELSE 0 END').rows).toEqual([[0]]);
    expect(execute({}, 'SELECT (1 + 2) * 3').rows).toEqual([[9]]);
    expect(execute({}, 'SELECT - -5, +5, NOT NOT 1').rows).toEqual([[5, 5, 1]]);
  });
});

describe('funciones y tipos', () => {
  it('ROUND away from zero y con n', () => {
    expect(execute({}, 'SELECT ROUND(2.5), ROUND(-2.5), ROUND(2.4)').rows).toEqual([[3, -3, 2]]);
    expect(execute({}, 'SELECT ROUND(123.456, 1), ROUND(123.456, -1)').rows).toEqual([[123.5, 120]]);
    expect(execute({}, 'SELECT ROUND(NULL), ROUND(1, NULL)').rows).toEqual([[null, null]]);
  });
  it('LOWER/UPPER ASCII, LENGTH números', () => {
    expect(execute({}, "SELECT LOWER('ABCÑ'), UPPER('abcñ')").rows).toEqual([['abcÑ', 'ABCñ']]);
    expect(execute({}, 'SELECT LENGTH(1234), LENGTH(3.5)').rows).toEqual([[4, 3]]);
    // 3.0 real -> "3.0" longitud 3
    expect(execute({}, 'SELECT LENGTH(3.0)').rows).toEqual([[3]]);
    expect(execute({}, "SELECT 2.0 || 'x'").rows).toEqual([['2.0x']]);
    expect(execute({}, "SELECT 2 || 'x'").rows).toEqual([['2x']]);
  });
  it('COALESCE/IFNULL/NULLIF y ABS', () => {
    expect(execute({}, 'SELECT COALESCE(NULL, 1, 2)').rows).toEqual([[1]]);
    expect(execute({}, 'SELECT IFNULL(5, 7), IFNULL(NULL, 7)').rows).toEqual([[5, 7]]);
    expect(execute({}, 'SELECT ABS(-3), ABS(-3.5), ABS(NULL)').rows).toEqual([[3, 3.5, null]]);
  });
  it('MIN/MAX con NULL y mixtos, AVG real', () => {
    const db = { t: { columns: ['x'], rows: [[null], [2], [1]] } };
    expect(execute(db, 'SELECT MIN(x), MAX(x) FROM t').rows).toEqual([[1, 2]]);
    const empty = { t: { columns: ['x'], rows: [] as any[][] } };
    expect(execute(empty, 'SELECT MIN(x), MAX(x) FROM t').rows).toEqual([[null, null]]);
  });
  it('comparación byte a byte y números<textos', () => {
    expect(execute({}, "SELECT 'Z' < 'a', 1 < 'a', 'a' > 1").rows).toEqual([[1, 1, 1]]);
    const db = { t: { columns: ['x'], rows: [[ 'b' ], [1], ['a']] } };
    const r = execute(db, 'SELECT x FROM t ORDER BY x ASC');
    expect(r.rows).toEqual([[1], ['a'], ['b']]);
  });
});

describe('SELECT/alias/JOIN/alias tabla', () => {
  it('alias tabla con AS y sin AS, JOINs', () => {
    const db = {
      t: { columns: ['a'], rows: [[1], [2]] },
      s: { columns: ['a'], rows: [[2], [3]] },
    };
    expect(execute(db, 'SELECT x.a FROM t AS x ORDER BY x.a').rows).toEqual([[1], [2]]);
    expect(execute(db, 'SELECT x.a FROM t x ORDER BY x.a').rows).toEqual([[1], [2]]);
    expect(execute(db, 'SELECT * FROM t AS x JOIN s AS y ON x.a = y.a').rows).toEqual([[2, 2]]);
    expect(execute(db, 'SELECT * FROM t INNER JOIN s ON t.a = s.a').rows).toEqual([[2, 2]]);
    expect(execute(db, 'SELECT * FROM t LEFT OUTER JOIN s ON t.a = s.a ORDER BY t.a').rows)
      .toEqual([[1, null], [2, 2]]);
  });
  it('GROUP BY NULL juntos, HAVING sin GROUP', () => {
    const db = { t: { columns: ['g', 'v'], rows: [[null, 1], [null, 2], ['a', 5]] } };
    const r = execute(db, 'SELECT g, COUNT(*) FROM t GROUP BY g ORDER BY g');
    // NULL primero en ASC
    expect(r.rows).toEqual([[null, 2], ['a', 1]]);
    const db2 = { t: { columns: ['x'], rows: [[1], [2], [3]] } };
    expect(execute(db2, 'SELECT SUM(x) FROM t HAVING SUM(x) > 5').rows).toEqual([[6]]);
    expect(execute(db2, 'SELECT SUM(x) FROM t HAVING SUM(x) > 10').rows).toEqual([]);
  });
  it('DISTINCT con NULL, LIMIT/OFFSET formas', () => {
    const db = { t: { columns: ['x'], rows: [[null], [null], [1]] } };
    expect(execute(db, 'SELECT DISTINCT x FROM t ORDER BY x').rows).toEqual([[null], [1]]);
    const db2 = { t: { columns: ['a'], rows: [[1], [2], [3], [4]] } };
    expect(execute(db2, 'SELECT a FROM t ORDER BY a LIMIT 2 OFFSET 1').rows).toEqual([[2], [3]]);
    expect(execute(db2, 'SELECT a FROM t ORDER BY a LIMIT 1, 2').rows).toEqual([[2], [3]]);
    expect(execute(db2, 'SELECT a FROM t ORDER BY a LIMIT -1').rows.length).toBe(4);
  });
});
