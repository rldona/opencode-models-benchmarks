import { SqlReal } from "./values.js";

export class SqlError extends Error {
  readonly code: string;

  constructor(message: string, code = "SQL_ERROR") {
    super(message);
    this.name = "SqlError";
    this.code = code;
  }
}

export function sqlError(message: string, code = "SQL_ERROR"): never {
  throw new SqlError(message, code);
}

export function syntaxError(detail: string): never {
  throw new SqlError(`syntax error: ${detail}`, "SYNTAX");
}

export function noSuchTable(name: string): never {
  throw new SqlError(`no such table: ${name}`, "NO_SUCH_TABLE");
}

export function noSuchColumn(name: string): never {
  throw new SqlError(`no such column: ${name}`, "NO_SUCH_COLUMN");
}

export function ambiguousColumn(name: string): never {
  throw new SqlError(`ambiguous column name: ${name}`, "AMBIGUOUS_COLUMN");
}

export function noSuchFunction(name: string): never {
  throw new SqlError(`no such function: ${name}`, "NO_SUCH_FUNCTION");
}

export function aggregateMisuse(name: string): never {
  throw new SqlError(`misuse of aggregate function ${name}()`, "AGGREGATE_MISUSE");
}

export function wrongArity(name: string): never {
  throw new SqlError(`wrong number of arguments to function ${name}()`, "WRONG_ARITY");
}

export function orderByOutOfRange(position: number, count: number): never {
  throw new SqlError(
    `${ordinal(position)} ORDER BY term out of range - should be between 1 and ${count}`,
    "ORDER_BY_RANGE",
  );
}

export function groupByOutOfRange(position: number, count: number): never {
  throw new SqlError(
    `${ordinal(position)} GROUP BY term out of range - should be between 1 and ${count}`,
    "GROUP_BY_RANGE",
  );
}

export function ordinal(n: number): string {
  const abs = Math.abs(n) % 100;
  const suffix =
    abs >= 11 && abs <= 13 ? "th" : abs % 10 === 1 ? "st" : abs % 10 === 2 ? "nd" : abs % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

export function unsupportedFeature(message: string): never {
  throw new SqlError(`unsupported feature: ${message}`, "UNSUPPORTED");
}

export { SqlReal };
