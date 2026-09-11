// Comparación de resultados: reales con tolerancia, tipos estrictos (12 ≠ '12', 1 ≠ true) y, si la consulta no
// tiene ORDER BY, como multiconjunto (SQLite no garantiza orden).
type Value = number | string | null;

const eq = (a: unknown, b: unknown): boolean =>
  a === b ||
  (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));

const key = (row: unknown[]) =>
  JSON.stringify(row.map((v) => (typeof v === 'number' ? `n:${Number(v.toPrecision(12))}` : v === null ? null : `${typeof v}:${v}`)));

const show = (rows: unknown[][]) => JSON.stringify(rows.slice(0, 4)) + (rows.length > 4 ? ` … (${rows.length} filas)` : '');

/** null si coinciden; si no, una explicación corta. */
export function diffRows(got: unknown, expected: Value[][], ordered: boolean): string | null {
  if (!Array.isArray(got) || got.some((r) => !Array.isArray(r))) return `rows no es un array de arrays: ${JSON.stringify(got)?.slice(0, 200)}`;
  const g = got as unknown[][];
  if (g.length !== expected.length) return `${g.length} filas en vez de ${expected.length}. Obtenido: ${show(g)} · esperado: ${show(expected)}`;
  const gs = ordered ? g : [...g].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const es = ordered ? expected : [...expected].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  for (let i = 0; i < es.length; i++) {
    const a = gs[i];
    const b = es[i];
    if (a.length !== b.length || a.some((v, j) => !eq(v, b[j]))) {
      return `${ordered ? 'fila' : 'fila (ordenadas)'} ${i}: ${JSON.stringify(a)} en vez de ${JSON.stringify(b)}`;
    }
  }
  return null;
}
