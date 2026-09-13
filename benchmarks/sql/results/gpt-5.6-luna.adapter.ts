import type { Query } from './contract';
import { executeSelect } from '../src/sql';

export const query: Query = (tables, sql) => {
  return executeSelect(tables, sql);
};

export const workarounds: string[] = [];
