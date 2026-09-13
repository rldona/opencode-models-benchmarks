import type { Query } from './contract';
import { executeQuery } from '../src/index.js';

// La API pública de la solución (executeQuery) acepta tablas como
// { columns, rows } y devuelve { columns, rows } con filas como arrays de
// number | string | null: exactamente la forma del contrato. No hace falta
// traducir nada más que los tipos.
export const query: Query = (tables, sql) => {
  return executeQuery(tables, sql);
};
