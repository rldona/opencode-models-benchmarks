import { describe, expect, it } from 'vitest';
import { query, SqlError } from '../src/index';
import type { Database } from '../src/index';

const t: Database = {
  t: { columns: ['a', 'b'], rows: [[1, 10], [2, 20], [3, null], [null, 30]] },
};

const dur: Database = {
  dur: { columns: ['v'], rows: [[1], [1], [2], [null], [null]] },
};

const empty: Database = {
  empty: { columns: ['x'], rows: [] },
};

const allNull: Database = {
  n: { columns: ['x'], rows: [[null], [null]] },
};

const users: Database = {
  users: { columns: ['id', 'name'], rows: [[1, 'alice'], [2, 'bob'], [3, 'carol']] },
  orders: {
    columns: ['id', 'user_id', 'amount'],
    rows: [[10, 1, 100], [11, 1, 50], [12, 2, 75]],
  },
};

const sales: Database = {
  sales: {
    columns: ['region', 'amount'],
    rows: [['east', 10], ['east', 20], ['west', 5], ['west', null], ['north', 7]],
  },
};

describe('literales y aritmetica', () => {
  it('suma sin FROM', () => {
    expect(query({}, 'SELECT 1 + 1')).toEqual({ columns: ['1 + 1'], rows: [[2]] });
  });

  it('division entera trunca hacia cero', () => {
    expect(query({}, 'SELECT 7 / 2, -7 / 2, 7 / -2').rows).toEqual([[3, -3, -3]]);
  });

  it('division real con literal real', () => {
    expect(query({}, 'SELECT 7 / 2.0, 7.0 / 2').rows).toEqual([[3.5, 3.5]]);
  });

  it('division y modulo por cero son NULL', () => {
    expect(query({}, 'SELECT 7 / 0, 7 % 0, 0.0 / 0').rows).toEqual([[null, null, null]]);
  });

  it('modulo con signo del dividendo', () => {
    expect(query({}, 'SELECT 7 % 2, -7 % 2, 7 % -2, 5.5 % 2').rows).toEqual([[1, -1, 1, 1.5]]);
  });

  it('literales texto con escape y NULL', () => {
    expect(query({}, "SELECT 'it''s', NULL")).toEqual({ columns: ["'it''s'", 'NULL'], rows: [["it's", null]] });
  });

  it('comparaciones entre tipos', () => {
    expect(query({}, "SELECT 1 = 1.0, 1 = '1', 2 < '1'").rows).toEqual([[1, 0, 1]]);
  });

  it('texto se coacciona a numero en aritmetica', () => {
    expect(query({}, "SELECT '2' + 3, 'a' + 1").rows).toEqual([[5, 1]]);
  });

  it('conversion de numeros a texto con ||', () => {
    expect(query({}, "SELECT 1 || 'a', 2.0 || '', 1 || NULL").rows).toEqual([['1a', '2.0', null]]);
  });

  it('precedencia exacta de SQLite', () => {
    expect(query({}, 'SELECT 2 * 3 || 4, 2 + 3 * 4, 0 = 1 < 2').rows).toEqual([[68, 14, 0]]);
  });

  it('unario menos', () => {
    expect(query({}, 'SELECT -3, - -3, -(1 + 2)').rows).toEqual([[-3, 3, -3]]);
  });
});

describe('SELECT, alias y columnas', () => {
  it('SELECT * expande columnas', () => {
    expect(query(t, 'SELECT * FROM t')).toEqual({
      columns: ['a', 'b'],
      rows: [[1, 10], [2, 20], [3, null], [null, 30]],
    });
  });

  it('tabla.* expande solo esa tabla', () => {
    const db: Database = {
      e: { columns: ['id', 'v'], rows: [[1, 'a']] },
      d: { columns: ['id', 'w'], rows: [[1, 'b']] },
    };
    const r = query(db, 'SELECT e.*, d.w FROM e JOIN d ON e.id = d.id');
    expect(r.columns).toEqual(['id', 'v', 'w']);
    expect(r.rows).toEqual([[1, 'a', 'b']]);
  });

  it('alias con y sin AS', () => {
    expect(query(t, 'SELECT a AS x, b y FROM t LIMIT 1')).toEqual({
      columns: ['x', 'y'],
      rows: [[1, 10]],
    });
  });

  it('nombres de columna duplicados', () => {
    const db: Database = {
      e: { columns: ['id', 'v'], rows: [[1, 'a']] },
      d: { columns: ['id', 'w'], rows: [[1, 'b']] },
    };
    const r = query(db, 'SELECT e.id, d.id FROM e JOIN d ON e.id = d.id');
    expect(r.columns).toEqual(['id', 'id']);
    expect(r.rows).toEqual([[1, 1]]);
  });

  it('DISTINCT elimina duplicados incluyendo NULL', () => {
    expect(query(dur, 'SELECT DISTINCT v FROM dur').rows).toEqual([[1], [2], [null]]);
  });

  it('identificadores entre comillas dobles', () => {
    const db: Database = { 'my table': { columns: ['a b'], rows: [[1]] } };
    expect(query(db, 'SELECT "a b" FROM "my table"').rows).toEqual([[1]]);
    expect(query(t, 'SELECT t."a" FROM t LIMIT 1').rows).toEqual([[1]]);
  });
});

describe('logica de tres valores con NULL', () => {
  it('NOT IN con NULL devuelve NULL y filtra', () => {
    expect(query(t, 'SELECT a FROM t WHERE a NOT IN (1, NULL)').rows).toEqual([]);
    expect(query(t, 'SELECT a FROM t WHERE a IN (1, NULL)').rows).toEqual([[1]]);
  });

  it('NOT IN sin NULL funciona', () => {
    expect(query(t, 'SELECT a FROM t WHERE a NOT IN (1, 2)').rows).toEqual([[3]]);
  });

  it('WHERE considera verdadero cualquier numero distinto de cero', () => {
    expect(query(t, 'SELECT a FROM t WHERE 2').rows).toEqual([[1], [2], [3], [null]]);
    expect(query(t, 'SELECT a FROM t WHERE 0').rows).toEqual([]);
  });

  it('tablas de verdad de AND, OR y NOT', () => {
    expect(
      query({}, 'SELECT NULL AND 0, NULL AND 1, NULL OR 1, NULL OR 0, NOT NULL').rows,
    ).toEqual([[0, null, 1, null, null]]);
  });

  it('IS NULL e IS NOT NULL', () => {
    expect(query(t, 'SELECT a IS NULL, a IS NOT NULL FROM t').rows).toEqual([
      [0, 1],
      [0, 1],
      [0, 1],
      [1, 0],
    ]);
  });

  it('BETWEEN con NULL', () => {
    expect(
      query({}, 'SELECT 5 BETWEEN 1 AND 10, 5 BETWEEN NULL AND 10, 5 BETWEEN 1 AND NULL, 5 NOT BETWEEN 1 AND 10').rows,
    ).toEqual([[1, null, null, 0]]);
  });

  it('comparaciones con NULL dan NULL', () => {
    expect(query({}, 'SELECT NULL = NULL, NULL != 1, NULL < 1').rows).toEqual([
      [null, null, null],
    ]);
  });
});

describe('LIKE, CASE y funciones escalares', () => {
  it('LIKE no distingue mayusculas ASCII', () => {
    expect(
      query({}, "SELECT 'Hello' LIKE 'h%', 'Hello' LIKE 'h_llo', 'Hello' LIKE '%E%', 'abc' LIKE 'd%'").rows,
    ).toEqual([[1, 1, 1, 0]]);
  });

  it('LIKE convierte numeros a texto', () => {
    expect(query({}, "SELECT 123 LIKE '1%', NULL LIKE 'a'").rows).toEqual([[1, null]]);
  });

  it('comparacion de texto byte a byte', () => {
    expect(query({}, "SELECT 'Z' < 'a', 'a' < 'b', 'abc' = 'abc'").rows).toEqual([[1, 1, 1]]);
  });

  it('LOWER y UPPER solo ASCII', () => {
    expect(query({}, "SELECT LOWER('AbC'), UPPER('aá')").rows).toEqual([['abc', 'Aá']]);
  });

  it('LENGTH convierte numeros a texto', () => {
    expect(query({}, "SELECT LENGTH('abc'), LENGTH(12345), LENGTH(1.5), LENGTH(NULL)").rows).toEqual([
      [3, 5, 3, null],
    ]);
  });

  it('COALESCE, IFNULL y NULLIF', () => {
    expect(
      query({}, "SELECT COALESCE(NULL, NULL, 2), IFNULL(NULL, 'x'), NULLIF(1, 1), NULLIF(1, 2)").rows,
    ).toEqual([[2, 'x', null, 1]]);
  });

  it('ABS y ROUND alejandose de cero', () => {
    expect(
      query({}, 'SELECT ABS(-5), ROUND(2.5), ROUND(-2.5), ROUND(3.14159, 2), ROUND(NULL)').rows,
    ).toEqual([[5, 3, -3, 3.14, null]]);
  });

  it('CASE con y sin expresion base', () => {
    expect(
      query(
        {},
        "SELECT CASE WHEN 1 THEN 'a' ELSE 'b' END, CASE 2 WHEN 1 THEN 'x' WHEN 2 THEN 'y' ELSE 'z' END",
      ).rows,
    ).toEqual([['a', 'y']]);
  });
});

describe('FROM, JOIN y productos cartesianos', () => {
  it('INNER JOIN por igualdad', () => {
    expect(
      query(
        users,
        'SELECT users.name, orders.amount FROM users JOIN orders ON users.id = orders.user_id ORDER BY orders.amount',
      ).rows,
    ).toEqual([['alice', 50], ['bob', 75], ['alice', 100]]);
  });

  it('LEFT JOIN con filas sin pareja', () => {
    expect(
      query(
        users,
        'SELECT users.name, orders.amount FROM users LEFT JOIN orders ON users.id = orders.user_id ORDER BY users.id, orders.amount',
      ).rows,
    ).toEqual([['alice', 50], ['alice', 100], ['bob', 75], ['carol', null]]);
  });

  it('LEFT OUTER JOIN con condicion extra sin pareja', () => {
    expect(
      query(
        users,
        'SELECT users.name, orders.amount FROM users LEFT OUTER JOIN orders ON users.id = orders.user_id AND orders.amount > 80 ORDER BY users.id',
      ).rows,
    ).toEqual([['alice', 100], ['bob', null], ['carol', null]]);
  });

  it('FROM con alias', () => {
    expect(query(users, 'SELECT u.name FROM users AS u WHERE u.id = 2').rows).toEqual([['bob']]);
  });

  it('producto cartesiano con comas', () => {
    expect(query(users, 'SELECT COUNT(*) FROM users, orders').rows).toEqual([[9]]);
  });

  it('JOIN con igualdad invertida y condiciones AND', () => {
    expect(
      query(
        users,
        'SELECT u.name, o.amount FROM users u JOIN orders o ON o.user_id = u.id AND o.amount >= 75 ORDER BY o.amount',
      ).rows,
    ).toEqual([['bob', 75], ['alice', 100]]);
  });
});

describe('GROUP BY, HAVING y agregados', () => {
  it('agregados ignoran NULL', () => {
    expect(
      query(
        t,
        'SELECT COUNT(*), COUNT(a), COUNT(b), SUM(a), SUM(b), AVG(a), AVG(b), MIN(b), MAX(b) FROM t',
      ).rows,
    ).toEqual([[4, 3, 3, 6, 60, 2, 20, 10, 30]]);
  });

  it('COUNT 0 y SUM NULL sobre columna todo NULL', () => {
    expect(query(allNull, 'SELECT COUNT(*), COUNT(x), SUM(x), AVG(x) FROM n').rows).toEqual([
      [2, 0, null, null],
    ]);
  });

  it('agregados sobre tabla vacia', () => {
    expect(query(empty, 'SELECT COUNT(*), SUM(x), AVG(x), MIN(x), MAX(x) FROM empty').rows).toEqual([
      [0, null, null, null, null],
    ]);
  });

  it('COUNT DISTINCT', () => {
    expect(query(t, 'SELECT COUNT(DISTINCT b) FROM t').rows).toEqual([[3]]);
  });

  it('AVG siempre es real', () => {
    const db: Database = { r: { columns: ['x'], rows: [[3]] } };
    expect(query(db, 'SELECT AVG(x) / 2 FROM r').rows).toEqual([[1.5]]);
  });

  it('SUM de reales conserva el tipo real', () => {
    const db: Database = { r: { columns: ['x'], rows: [[1.5], [1.5]] } };
    expect(query(db, 'SELECT SUM(x) / 4 FROM r').rows).toEqual([[0.75]]);
  });

  it('GROUP BY con HAVING por alias', () => {
    expect(
      query(
        sales,
        'SELECT region, COUNT(*) AS n, SUM(amount) AS total FROM sales GROUP BY region HAVING n > 1 ORDER BY region',
      ).rows,
    ).toEqual([['east', 2, 30], ['west', 2, 5]]);
  });

  it('ORDER BY sobre el resultado de un agregado', () => {
    expect(
      query(
        sales,
        'SELECT region, SUM(amount) AS total FROM sales GROUP BY region ORDER BY total DESC',
      ).rows,
    ).toEqual([['east', 30], ['north', 7], ['west', 5]]);
  });

  it('GROUP BY por posicion y DISTINCT multiculumna', () => {
    expect(
      query(sales, 'SELECT region AS r, SUM(amount) AS total FROM sales GROUP BY 1 ORDER BY total DESC')
        .rows,
    ).toEqual([['east', 30], ['north', 7], ['west', 5]]);
    const db: Database = {
      m: { columns: ['x', 'y'], rows: [[1, 'a'], [1, 'a'], [1, 'b'], [null, null], [null, null]] },
    };
    expect(query(db, 'SELECT DISTINCT x, y FROM m').rows).toEqual([
      [1, 'a'],
      [1, 'b'],
      [null, null],
    ]);
  });

  it('HAVING con condicion sobre columna y ORDER BY con agregado', () => {
    expect(
      query(
        sales,
        "SELECT region, COUNT(*) FROM sales GROUP BY region HAVING region != 'north' ORDER BY region",
      ).rows,
    ).toEqual([['east', 2], ['west', 2]]);
    expect(
      query(
        sales,
        'SELECT region, SUM(amount) FROM sales GROUP BY region ORDER BY SUM(amount) DESC',
      ).rows,
    ).toEqual([['east', 30], ['north', 7], ['west', 5]]);
  });

  it('MIN y MAX con textos', () => {
    const db: Database = { m: { columns: ['x'], rows: [['b'], [null], ['a'], ['c']] } };
    expect(query(db, 'SELECT MIN(x), MAX(x) FROM m').rows).toEqual([['a', 'c']]);
  });

  it('HAVING con agregado y GROUP BY por expresion', () => {
    expect(
      query(
        sales,
        'SELECT amount % 2, COUNT(*) FROM sales GROUP BY amount % 2 HAVING SUM(amount) > 10 ORDER BY 1',
      ).rows,
    ).toEqual([[0, 2], [1, 2]]);
  });
});

describe('ORDER BY, LIMIT y OFFSET', () => {
  it('ORDER BY pone NULL primero en ASC y ultimo en DESC', () => {
    expect(query(t, 'SELECT b FROM t ORDER BY b ASC').rows).toEqual([[null], [10], [20], [30]]);
    expect(query(t, 'SELECT b FROM t ORDER BY b DESC').rows).toEqual([[30], [20], [10], [null]]);
  });

  it('ORDER BY por alias y por posicion', () => {
    expect(query(t, 'SELECT a AS x FROM t ORDER BY x DESC').rows).toEqual([[3], [2], [1], [null]]);
    expect(query(t, 'SELECT a, b FROM t ORDER BY 2 ASC').rows).toEqual([
      [3, null],
      [1, 10],
      [2, 20],
      [null, 30],
    ]);
  });

  it('LIMIT y OFFSET', () => {
    expect(query(t, 'SELECT a FROM t ORDER BY a LIMIT 2 OFFSET 1').rows).toEqual([[1], [2]]);
    expect(query(t, 'SELECT a FROM t ORDER BY a LIMIT 1, 2').rows).toEqual([[1], [2]]);
  });

  it('ORDER BY con expresion', () => {
    expect(query(t, 'SELECT a FROM t ORDER BY b DESC').rows).toEqual([[null], [2], [1], [3]]);
  });
});

describe('errores', () => {
  it('error de sintaxis', () => {
    expect(() => query(t, 'SELECT FROM t')).toThrow(SqlError);
    expect(() => query(t, 'SELECT 1 +')).toThrow(/syntax error/);
  });

  it('tabla inexistente', () => {
    expect(() => query(t, 'SELECT * FROM missing')).toThrow(/no such table: missing/);
  });

  it('columna inexistente', () => {
    expect(() => query(t, 'SELECT nope FROM t')).toThrow(/no such column: nope/);
  });

  it('columna ambigua', () => {
    expect(() =>
      query(users, 'SELECT id FROM users JOIN orders ON users.id = orders.user_id'),
    ).toThrow(/ambiguous column name: id/);
  });

  it('funcion desconocida', () => {
    expect(() => query(t, 'SELECT bogus(1) FROM t')).toThrow(/no such function: bogus/);
  });

  it('agregado mal usado', () => {
    expect(() => query(t, 'SELECT a FROM t WHERE COUNT(*) > 0')).toThrow(/misuse of aggregate/);
    expect(() => query(t, 'SELECT SUM(COUNT(a)) FROM t')).toThrow(/misuse of aggregate/);
    expect(() => query(t, 'SELECT COUNT(COUNT(a)) FROM t')).toThrow(/misuse of aggregate/);
  });

  it('posicion de ORDER BY fuera de rango', () => {
    expect(() => query(t, 'SELECT a FROM t ORDER BY 5')).toThrow(/ORDER BY term out of range/);
    expect(() => query(t, 'SELECT a FROM t ORDER BY 0')).toThrow(/ORDER BY term out of range/);
    expect(() => query(t, 'SELECT a FROM t GROUP BY 5')).toThrow(/GROUP BY term out of range/);
  });

  it('aridad incorrecta de funciones y agregados', () => {
    expect(() => query(t, 'SELECT SUM(*) FROM t')).toThrow(/wrong number of arguments/);
    expect(() => query(t, 'SELECT COUNT(a, b) FROM t')).toThrow(/wrong number of arguments/);
    expect(() => query(t, 'SELECT COUNT() FROM t')).toThrow(/wrong number of arguments/);
    expect(() => query(t, 'SELECT ABS(1, 2) FROM t')).toThrow(/wrong number of arguments/);
  });
});
