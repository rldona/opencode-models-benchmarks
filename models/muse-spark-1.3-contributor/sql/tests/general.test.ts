import { describe, it, expect } from 'vitest';
import { execute } from '../src/index.js';

describe('funcionalidades generales', () => {
  it('SELECT sin FROM', () => {
    expect(execute({}, 'SELECT 1 + 1').rows).toEqual([[2]]);
    expect(execute({}, 'SELECT 1 + 1;').rows).toEqual([[2]]);
    expect(execute({}, 'select 1 + 1').rows).toEqual([[2]]);
  });
  it('DISTINCT, *, tbl.*, alias', () => {
    const db = {
      e: { columns: ['id', 'v'], rows: [[1, 'a'], [1, 'a'], [2, 'b']] },
      d: { columns: ['id'], rows: [[10]] },
    };
    expect(execute(db, 'SELECT DISTINCT id FROM e ORDER BY id').rows).toEqual([[1], [2]]);
    expect(execute(db, 'SELECT * FROM e ORDER BY id, v').rows).toEqual([[1, 'a'], [1, 'a'], [2, 'b']]);
    expect(execute(db, 'SELECT e.id, d.id FROM e, d ORDER BY e.id LIMIT 1').columns).toEqual(['id', 'id']);
    expect(execute(db, 'SELECT v AS x FROM e ORDER BY x LIMIT 1').columns).toEqual(['x']);
    expect(execute(db, 'SELECT e.* FROM e ORDER BY id LIMIT 1').rows).toEqual([[1, 'a']]);
  });
  it('WHERE, operadores, precedencia', () => {
    const db = { t: { columns: ['a', 'b'], rows: [[1, 2], [3, 4]] } };
    // || mayor que * : 'a' || 'b' ... test numérico: 1+2*3=7
    expect(execute({}, 'SELECT 1 + 2 * 3').rows).toEqual([[7]]);
    expect(execute({}, "SELECT 'a' || 'b' || 'c'").rows).toEqual([['abc']]);
    expect(execute({}, 'SELECT 1 OR 0 AND 0').rows).toEqual([[1]]); // AND antes que OR
    expect(execute({}, 'SELECT NOT 0').rows).toEqual([[1]]);
    expect(execute(db, 'SELECT a FROM t WHERE a < b AND b > 3').rows).toEqual([[3]]);
  });
  it('IS NULL, BETWEEN, IN lista, LIKE, CASE', () => {
    const db = { t: { columns: ['a', 'b'], rows: [[1, 'Hello'], [null, 'world'], [3, 'HELLO']] } };
    expect(execute(db, 'SELECT a FROM t WHERE a IS NULL').rows).toEqual([[null]]);
    expect(execute(db, 'SELECT a FROM t WHERE a IS NOT NULL ORDER BY a').rows).toEqual([[1], [3]]);
    expect(execute(db, 'SELECT a FROM t WHERE a BETWEEN 1 AND 2').rows).toEqual([[1]]);
    expect(execute(db, 'SELECT a FROM t WHERE a IN (1, 3) ORDER BY a').rows).toEqual([[1], [3]]);
    // LIKE case-insensitive ASCII, % _
    expect(execute(db, "SELECT b FROM t WHERE b LIKE 'hello' ORDER BY b").rows).toEqual([['HELLO'], ['Hello']]);
    expect(execute(db, "SELECT b FROM t WHERE b LIKE 'H_llo' ORDER BY b").rows).toEqual([['HELLO'], ['Hello']]);
    // CASE con y sin base
    expect(execute({}, 'SELECT CASE WHEN 1 > 2 THEN 10 ELSE 20 END').rows).toEqual([[20]]);
    expect(execute({}, 'SELECT CASE 2 WHEN 1 THEN 10 WHEN 2 THEN 20 ELSE 30 END').rows).toEqual([[20]]);
  });
  it('funciones escalares', () => {
    expect(execute({}, 'SELECT ABS(-5), ROUND(3.5), ROUND(3.4)').rows).toEqual([[5, 4, 3]]);
    expect(execute({}, 'SELECT ROUND(-3.5)').rows).toEqual([[-4]]);
    expect(execute({}, "SELECT LOWER('AbC'), UPPER('AbC'), LENGTH('abc'), LENGTH(123)").rows).toEqual([['abc', 'ABC', 3, 3]]);
    expect(execute({}, 'SELECT COALESCE(NULL, NULL, 5)').rows).toEqual([[5]]);
    expect(execute({}, 'SELECT IFNULL(NULL, 7)').rows).toEqual([[7]]);
    expect(execute({}, 'SELECT NULLIF(1, 1), NULLIF(1, 2)').rows).toEqual([[null, 1]]);
    // ||, LIKE, LENGTH convierten números a texto
    expect(execute({}, "SELECT 123 || 'x'").rows).toEqual([['123x']]);
    expect(execute({}, "SELECT LENGTH(1234)").rows).toEqual([[4]]);
  });
  it('textos byte a byte, LOWER solo ASCII, ORDER BY', () => {
    // 'Z' (90) < 'a' (97)
    expect(execute({}, "SELECT 'a' > 'Z'").rows).toEqual([[1]]);
    expect(execute({}, "SELECT LOWER('ABCÑ')").rows).toEqual([['abcÑ']]);
  });
  it('errores como excepciones', () => {
    const db = { t: { columns: ['a'], rows: [[1]] }, s: { columns: ['a'], rows: [[1]] } };
    expect(() => execute(db, 'SELECT z FROM t')).toThrow();
    expect(() => execute(db, 'SELECT * FROM missing')).toThrow();
    expect(() => execute(db, 'SELECT a FROM t, s')).toThrow(); // ambigua
    expect(() => execute(db, 'SELECT NOSUCHFN(a) FROM t')).toThrow();
    expect(() => execute(db, 'SELECT a FROM t WHERE SUM(a) > 1')).toThrow(); // agregado en WHERE
    expect(() => execute(db, 'SELECT a FROM t ORDER BY 2')).toThrow();
    expect(() => execute(db, 'SELEC a FROM t')).toThrow();
  });
  it('identificadores case-insensitive y comillas dobles, texto con escape', () => {
    const db = { MiTabla: { columns: ['MiCol'], rows: [[1]] } };
    expect(execute(db, 'SeLeCT MICOL FrOm MITABLA').rows).toEqual([[1]]);
    expect(execute(db, 'SELECT "MiCol" FROM "MiTabla"').rows).toEqual([[1]]);
    expect(execute({}, "SELECT 'a''b'").rows).toEqual([["a'b"]]);
  });
  it('COUNT(*) vs COUNT(expr), SUM/AVG con NULL ya cubierto', () => {
    const db = { t: { columns: ['x'], rows: [[null], [null]] } };
    expect(execute(db, 'SELECT COUNT(*), COUNT(x) FROM t').rows).toEqual([[2, 0]]);
  });
});
