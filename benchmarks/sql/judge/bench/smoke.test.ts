// Comprobación mínima para el juez: el adaptador compila y conecta con la solución.
import { expect, test } from 'vitest';
import { query } from './adapter';

const tables = {
  t: { columns: ['a', 'b'], rows: [[1, 'x'], [2, null]] },
};

test('smoke: SELECT con ORDER BY', async () => {
  const res = await query(tables, 'SELECT a, b FROM t ORDER BY a DESC');
  expect(res.rows).toEqual([[2, null], [1, 'x']]);
});

test('smoke: los errores se propagan', async () => {
  let threw = false;
  try {
    await query(tables, 'SELECT nope FROM t');
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
});
