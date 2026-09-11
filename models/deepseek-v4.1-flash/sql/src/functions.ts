import { SqlError } from './types';
import type { Cell } from './types';
import {
  compareCells,
  isBoxedReal,
  isRealVal,
  makeReal,
  numOf,
  numeric,
  roundValue,
  toText,
} from './values';

export interface ScalarDef {
  minArgs: number;
  maxArgs: number;
  fn: (args: Cell[]) => Cell;
}

export const AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max']);

function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function asciiUpper(s: string): string {
  return s.replace(/[a-z]/g, (c) => c.toUpperCase());
}

export const SCALAR_FUNCTIONS: Record<string, ScalarDef> = {
  abs: {
    minArgs: 1,
    maxArgs: 1,
    fn: (args) => {
      const x = args[0];
      if (x === null) return null;
      const n = numeric(x);
      if (n === null) return null;
      const v = Math.abs(numOf(n));
      return isRealVal(n) ? makeReal(v) : v;
    },
  },
  round: {
    minArgs: 1,
    maxArgs: 2,
    fn: (args) => roundValue(args[0], args.length > 1 ? args[1] : 0),
  },
  lower: {
    minArgs: 1,
    maxArgs: 1,
    fn: (args) => (args[0] === null ? null : asciiLower(toText(args[0]))),
  },
  upper: {
    minArgs: 1,
    maxArgs: 1,
    fn: (args) => (args[0] === null ? null : asciiUpper(toText(args[0]))),
  },
  length: {
    minArgs: 1,
    maxArgs: 1,
    fn: (args) => (args[0] === null ? null : toText(args[0]).length),
  },
  coalesce: {
    minArgs: 2,
    maxArgs: Number.POSITIVE_INFINITY,
    fn: (args) => {
      for (const a of args) if (a !== null) return a;
      return null;
    },
  },
  ifnull: {
    minArgs: 2,
    maxArgs: 2,
    fn: (args) => (args[0] === null ? args[1] : args[0]),
  },
  nullif: {
    minArgs: 2,
    maxArgs: 2,
    fn: (args) => {
      const a = args[0];
      const b = args[1];
      if (a === null) return null;
      if (b !== null && compareCells(a, b) === 0) return null;
      return a;
    },
  },
  typeof: {
    minArgs: 1,
    maxArgs: 1,
    fn: (args) => {
      const v = args[0];
      if (v === null) return 'null';
      if (typeof v === 'string') return 'text';
      return isBoxedReal(v) || !Number.isInteger(numOf(v)) ? 'real' : 'integer';
    },
  },
};

export function scalarArityError(name: string): SqlError {
  return new SqlError(`wrong number of arguments to function ${name}()`);
}
