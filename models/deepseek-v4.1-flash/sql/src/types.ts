export type SqlValue = number | string | null;

export interface TableData {
  columns: string[];
  rows: SqlValue[][];
}

export type Database = Record<string, TableData>;

export interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
}

export class SqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlError';
  }
}

export interface Real {
  readonly r: number;
}

export type Cell = null | number | string | Real;
