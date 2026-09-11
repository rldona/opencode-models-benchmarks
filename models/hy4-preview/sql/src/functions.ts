import { noSuchFunction, wrongArity } from "./errors.js";
import {
  compare,
  groupKeyOf,
  isRealValue,
  lengthOf,
  makeInt,
  makeReal,
  applyCase,
  valueToText,
  numOf,
  toNumeric,
  type SqlValue,
} from "./values.js";

export type RowGetter = (row: SqlValue[]) => SqlValue;

export interface AggInstance {
  update(row: SqlValue[]): void;
  finish(): SqlValue;
}

interface ScalarDef {
  min: number;
  max: number;
  fn: (args: SqlValue[]) => SqlValue;
}

function roundValue(x: number, digits: number): number {
  if (digits > 30) digits = 30;
  if (digits < -30) digits = -30;
  if (digits === 0) return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
  if (digits > 0) return Number(x.toFixed(digits));
  const f = Math.pow(10, -digits);
  return Math.sign(x) * Math.round(Math.abs(x) / f) * f;
}

const SCALARS: Record<string, ScalarDef> = {
  ABS: {
    min: 1,
    max: 1,
    fn: (args) => {
      const x = toNumeric(args[0]);
      if (!x) return null;
      return x.int ? makeInt(Math.abs(x.n)) : makeReal(Math.abs(x.n));
    },
  },
  ROUND: {
    min: 1,
    max: 2,
    fn: (args) => {
      const x = toNumeric(args[0]);
      if (!x) return null;
      let digits = 0;
      if (args.length > 1) {
        const d = toNumeric(args[1]);
        if (!d) return null;
        digits = Math.trunc(d.n);
      }
      if (!Number.isFinite(digits)) return null;
      return makeReal(roundValue(x.n, digits));
    },
  },
  LOWER: { min: 1, max: 1, fn: (args) => applyCase(args[0], false) },
  UPPER: { min: 1, max: 1, fn: (args) => applyCase(args[0], true) },
  LENGTH: { min: 1, max: 1, fn: (args) => lengthOf(args[0]) },
  COALESCE: {
    min: 1,
    max: Number.POSITIVE_INFINITY,
    fn: (args) => {
      for (const a of args) if (a !== null) return a;
      return null;
    },
  },
  IFNULL: { min: 2, max: 2, fn: (args) => (args[0] !== null ? args[0] : args[1]) },
  CAST_TEXT: { min: 1, max: 1, fn: (args) => valueToText(args[0]) },
  CAST_INTEGER: {
    min: 1,
    max: 1,
    fn: (args) => {
      const x = toNumeric(args[0]);
      if (!x) return null;
      return makeInt(Math.trunc(x.n));
    },
  },
  CAST_REAL: {
    min: 1,
    max: 1,
    fn: (args) => {
      const x = toNumeric(args[0]);
      if (!x) return null;
      return makeReal(x.n);
    },
  },
  CAST_NUMERIC: {
    min: 1,
    max: 1,
    fn: (args) => {
      const x = toNumeric(args[0]);
      if (!x) return null;
      return Number.isInteger(x.n) ? makeInt(x.n) : makeReal(x.n);
    },
  },
  CAST_BLOB: { min: 1, max: 1, fn: (args) => args[0] },
  NULLIF: {
    min: 2,
    max: 2,
    fn: (args) => {
      const a = args[0];
      const b = args[1];
      if (a === null) return null;
      if (b === null) return a;
      return compare(a, b) === 0 ? null : a;
    },
  },
};

export function hasScalar(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCALARS, name);
}

export function callScalar(name: string, args: SqlValue[]): SqlValue {
  const def = SCALARS[name];
  if (!def) noSuchFunction(name);
  if (args.length < def.min || args.length > def.max) wrongArity(name);
  return def.fn(args);
}

export function checkScalarCall(name: string, argCount: number): void {
  const def = SCALARS[name];
  if (!def) noSuchFunction(name);
  if (argCount < def.min || argCount > def.max) wrongArity(name);
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

class CounterAgg implements AggInstance {
  private count = 0;

  update(): void {
    this.count++;
  }

  finish(): SqlValue {
    return this.count;
  }
}

class CountExprAgg implements AggInstance {
  private count = 0;
  private readonly seen: Set<string> | null;

  constructor(
    private readonly get: RowGetter,
    distinct: boolean,
  ) {
    this.seen = distinct ? new Set() : null;
  }

  update(row: SqlValue[]): void {
    const v = this.get(row);
    if (v === null) return;
    if (this.seen) {
      const key = groupKeyOf(v);
      if (this.seen.has(key)) return;
      this.seen.add(key);
    }
    this.count++;
  }

  finish(): SqlValue {
    return this.count;
  }
}

class SumAgg implements AggInstance {
  private sum = 0;
  private int = true;
  private has = false;
  private readonly distinctValues: Map<string, SqlValue> | null;

  constructor(
    private readonly get: RowGetter,
    distinct: boolean,
  ) {
    this.distinctValues = distinct ? new Map() : null;
  }

  private add(v: SqlValue): void {
    const x = toNumeric(v);
    if (!x) return;
    this.has = true;
    if (!x.int) this.int = false;
    this.sum += x.n;
    if (this.int && !Number.isSafeInteger(this.sum)) this.int = false;
  }

  update(row: SqlValue[]): void {
    const v = this.get(row);
    if (v === null) return;
    if (this.distinctValues) {
      const key = groupKeyOf(v);
      if (this.distinctValues.has(key)) return;
      this.distinctValues.set(key, v);
    }
    this.add(v);
  }

  finish(): SqlValue {
    if (!this.has) return null;
    return this.int ? this.sum : makeReal(this.sum);
  }
}

class AvgAgg implements AggInstance {
  private sum = 0;
  private count = 0;
  private readonly distinctValues: Map<string, SqlValue> | null;

  constructor(
    private readonly get: RowGetter,
    distinct: boolean,
  ) {
    this.distinctValues = distinct ? new Map() : null;
  }

  private add(v: SqlValue): void {
    const x = toNumeric(v);
    if (!x) return;
    this.sum += x.n;
    this.count++;
  }

  update(row: SqlValue[]): void {
    const v = this.get(row);
    if (v === null) return;
    if (this.distinctValues) {
      const key = groupKeyOf(v);
      if (this.distinctValues.has(key)) return;
      this.distinctValues.set(key, v);
    }
    this.add(v);
  }

  finish(): SqlValue {
    if (this.count === 0) return null;
    return makeReal(this.sum / this.count);
  }
}

class TotalAgg implements AggInstance {
  private sum = 0;
  private readonly distinctValues: Map<string, SqlValue> | null;

  constructor(
    private readonly get: RowGetter,
    distinct: boolean,
  ) {
    this.distinctValues = distinct ? new Map() : null;
  }

  update(row: SqlValue[]): void {
    const v = this.get(row);
    if (v === null) return;
    if (this.distinctValues) {
      const key = groupKeyOf(v);
      if (this.distinctValues.has(key)) return;
      this.distinctValues.set(key, v);
    }
    const x = toNumeric(v);
    if (x) this.sum += x.n;
  }

  finish(): SqlValue {
    return makeReal(this.sum);
  }
}

class MinMaxAgg implements AggInstance {
  private current: SqlValue = null;

  constructor(
    private readonly get: RowGetter,
    private readonly max: boolean,
  ) {}

  update(row: SqlValue[]): void {
    const v = this.get(row);
    if (v === null) return;
    if (this.current === null) {
      this.current = v;
      return;
    }
    const c = compare(v, this.current);
    if (this.max ? c > 0 : c < 0) this.current = v;
  }

  finish(): SqlValue {
    return this.current;
  }
}

export function createAggregate(
  name: string,
  star: boolean,
  distinct: boolean,
  getters: RowGetter[],
): AggInstance {
  switch (name) {
    case "COUNT":
      if (star) {
        if (distinct) wrongArity("COUNT");
        return new CounterAgg();
      }
      if (getters.length !== 1) wrongArity("COUNT");
      return new CountExprAgg(getters[0], distinct);
    case "SUM":
      if (star || getters.length !== 1) wrongArity("SUM");
      return new SumAgg(getters[0], distinct);
    case "AVG":
      if (star || getters.length !== 1) wrongArity("AVG");
      return new AvgAgg(getters[0], distinct);
    case "TOTAL":
      if (star || getters.length !== 1) wrongArity("TOTAL");
      return new TotalAgg(getters[0], distinct);
    case "MIN":
      if (star || getters.length !== 1) wrongArity("MIN");
      return new MinMaxAgg(getters[0], false);
    case "MAX":
      if (star || getters.length !== 1) wrongArity("MAX");
      return new MinMaxAgg(getters[0], true);
    default:
      return noSuchFunction(name);
  }
}

export function isRealBoxed(v: SqlValue): boolean {
  return isRealValue(v);
}

export function numericOf(v: SqlValue): number {
  return numOf(v);
}
