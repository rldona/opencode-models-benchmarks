import type { Query } from './contract';
import { execute } from '../src/index.js';

export const query: Query = (tables, sql) => {
  const db: Record<string, { columns: string[]; rows: (number | string | null)[][] }> = {};
  for (const [name, table] of Object.entries(tables)) {
    db[name] = { columns: table.columns, rows: table.rows };
  }
  const result = execute(db, sql);
  return { columns: result.columns, rows: result.rows };
};

export const workarounds: string[] = [];
