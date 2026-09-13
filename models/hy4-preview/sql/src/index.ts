import { SqlError } from "./errors.js";
import { executeSelect, type NormalizedTable, type QueryResult } from "./executor.js";
import { parse } from "./parser.js";
import { SqlReal, type SqlValue } from "./values.js";

export { SqlError } from "./errors.js";
export { SqlReal } from "./values.js";
export type { SqlValue } from "./values.js";
export type { QueryResult } from "./executor.js";

export type Cell = number | string | boolean | bigint | null | undefined | SqlReal;
export type InputRow = readonly Cell[] | Record<string, Cell>;

export interface TableDef {
  columns?: string[];
  columnNames?: string[];
  header?: string[];
  fields?: string[];
  rows?: readonly InputRow[];
  data?: readonly InputRow[];
  values?: readonly InputRow[];
  records?: readonly InputRow[];
}

export type TablesInput = Record<string, TableDef | readonly InputRow[]>;

function normalizeCell(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? value : new SqlReal(value);
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof SqlReal) return value;
  throw new SqlError(`unsupported cell value of type ${typeof value}`, "BAD_VALUE");
}

function readColumns(input: TableDef): string[] {
  const columns = input.columns ?? input.columnNames ?? input.header ?? input.fields;
  if (!columns) throw new SqlError("table definition is missing column names", "BAD_TABLE");
  return columns.map((c) => String(c));
}

function readRows(input: TableDef | readonly InputRow[]): readonly InputRow[] {
  if (Array.isArray(input)) return input;
  const def = input as TableDef;
  const rows = def.rows ?? def.data ?? def.values ?? def.records;
  if (!rows) throw new SqlError("table definition is missing rows", "BAD_TABLE");
  return rows;
}

function normalizeTable(name: string, input: TableDef | readonly InputRow[]): NormalizedTable {
  const rawRows = readRows(input);
  let columns: string[];
  if (Array.isArray(input)) {
    const first = rawRows.find((r) => r !== null && r !== undefined && typeof r === "object" && !Array.isArray(r));
    columns = first && typeof first === "object" ? Object.keys(first as Record<string, Cell>) : [];
  } else {
    columns = readColumns(input as TableDef);
  }

  const rows: SqlValue[][] = new Array(rawRows.length);
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (Array.isArray(raw)) {
      const row: SqlValue[] = new Array(columns.length);
      for (let c = 0; c < columns.length; c++) row[c] = normalizeCell(raw[c]);
      rows[i] = row;
    } else if (raw && typeof raw === "object") {
      const record = raw as Record<string, Cell>;
      const row: SqlValue[] = new Array(columns.length);
      for (let c = 0; c < columns.length; c++) row[c] = normalizeCell(record[columns[c]]);
      rows[i] = row;
    } else {
      throw new SqlError(`invalid row in table ${name}`, "BAD_TABLE");
    }
  }
  return { name, columns, rows };
}

export function normalizeTables(tables: TablesInput): Map<string, NormalizedTable> {
  const normalized = new Map<string, NormalizedTable>();
  for (const [name, table] of Object.entries(tables ?? {})) {
    normalized.set(name.toLowerCase(), normalizeTable(name, table));
  }
  return normalized;
}

export function executeQuery(tables: TablesInput, sql: string): QueryResult {
  const normalized = normalizeTables(tables);
  if (typeof sql !== "string" || sql.trim() === "") {
    throw new SqlError("empty SQL statement", "SYNTAX");
  }
  const stmt = parse(sql);
  return executeSelect(stmt, normalized);
}

export class Database {
  private readonly tables: Map<string, NormalizedTable>;

  constructor(tables: TablesInput) {
    this.tables = normalizeTables(tables);
  }

  query(sql: string): QueryResult {
    const stmt = parse(sql);
    return executeSelect(stmt, this.tables);
  }

  execute(sql: string): QueryResult {
    return this.query(sql);
  }
}

export const query = executeQuery;
export const runQuery = executeQuery;

export default { executeQuery, query, runQuery, Database, SqlError };
