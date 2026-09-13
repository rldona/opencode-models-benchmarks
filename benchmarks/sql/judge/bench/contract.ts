// Contrato común con el que la suite oculta llama a cualquier solución.
// El juez escribe __bench__/adapter.ts exportando `query` con esta firma.

/** Valor de una celda. Un número es entero si Number.isInteger(v); en los datos, los reales tienen parte decimal. */
export type Value = number | string | null;

export interface Table {
  columns: string[];
  rows: Value[][];
}

/** Nombre de tabla → tabla. */
export type Tables = Record<string, Table>;

export interface QueryResult {
  /** Nombres de columna en el orden del SELECT (pueden repetirse). No se evalúan, pero deben venir. */
  columns: string[];
  /** Filas como arrays, en el orden del SELECT. Booleanos como 1/0. */
  rows: Value[][];
}

/**
 * Ejecuta una sentencia SELECT sobre las tablas. Si la solución lanza un error (sintaxis, tabla/columna
 * inexistente, ambigüedad…), el adaptador debe dejar que se propague (excepción o promesa rechazada).
 */
export type Query = (tables: Tables, sql: string) => QueryResult | Promise<QueryResult>;
