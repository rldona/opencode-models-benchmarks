import { parse } from './parser';
import { execute } from './engine';
import type { Database, QueryResult } from './types';

export function query(tables: Database, sql: string): QueryResult {
  return execute(tables, parse(sql));
}

export { SqlError } from './types';
export type { Database, QueryResult, SqlValue, TableData } from './types';
