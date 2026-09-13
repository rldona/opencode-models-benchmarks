import type { Query } from './contract';
import { query as solutionQuery } from '../src/index';

export const query: Query = (tables, sql) => {
  return solutionQuery(tables, sql);
};

export const workarounds: string[] = [];
