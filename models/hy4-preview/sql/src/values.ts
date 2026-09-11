/**
 * Value model with SQLite storage classes:
 *   number      -> INTEGER
 *   SqlReal     -> REAL
 *   string      -> TEXT
 *   null        -> NULL
 */
export class SqlReal {
  readonly value: number;

  constructor(value: number) {
    this.value = value;
  }
}

export type SqlValue = number | string | SqlReal | null;

const NUM_PREFIX = /^[ \t\r\n]*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/;
const INTEGER_FORM = /^[+-]?\d+$/;

export function isRealValue(v: SqlValue): v is SqlReal {
  return typeof v === "object" && v !== null;
}

export function isNumericValue(v: SqlValue): boolean {
  return typeof v === "number" || (typeof v === "object" && v !== null);
}

export function isIntValue(v: SqlValue): boolean {
  return typeof v === "number";
}

export function numOf(v: SqlValue): number {
  return typeof v === "object" && v !== null ? v.value : (v as number);
}

export function makeReal(n: number): SqlValue {
  return new SqlReal(n);
}

export function makeInt(n: number): SqlValue {
  return Number.isSafeInteger(n) ? n : new SqlReal(n);
}

export interface Numeric {
  n: number;
  int: boolean;
}

export function parseNumericText(s: string): Numeric {
  const m = NUM_PREFIX.exec(s);
  if (!m) return { n: 0, int: true };
  const raw = m[1];
  return { n: Number(raw), int: INTEGER_FORM.test(raw) };
}

export function toNumeric(v: SqlValue): Numeric | null {
  if (v === null) return null;
  if (typeof v === "number") return { n: v, int: true };
  if (typeof v === "object") return { n: v.value, int: false };
  return parseNumericText(v);
}

/** Type ordering class: 0 = NULL, 1 = numeric, 2 = TEXT. */
export function typeClass(v: SqlValue): 0 | 1 | 2 {
  if (v === null) return 0;
  if (typeof v === "string") return 2;
  return 1;
}

/** Total order used by ORDER BY, MIN, MAX (NULLs are the smallest value). */
export function compare(a: SqlValue, b: SqlValue): number {
  const ca = typeClass(a);
  const cb = typeClass(b);
  if (ca !== cb) return ca - cb;
  if (ca === 0) return 0;
  if (ca === 2) {
    const sa = a as string;
    const sb = b as string;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  const na = numOf(a);
  const nb = numOf(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* Arithmetic                                                          */
/* ------------------------------------------------------------------ */

export function addValues(a: SqlValue, b: SqlValue): SqlValue {
  const x = toNumeric(a);
  const y = toNumeric(b);
  if (!x || !y) return null;
  const n = x.n + y.n;
  return x.int && y.int ? makeInt(n) : makeReal(n);
}

export function subValues(a: SqlValue, b: SqlValue): SqlValue {
  const x = toNumeric(a);
  const y = toNumeric(b);
  if (!x || !y) return null;
  const n = x.n - y.n;
  return x.int && y.int ? makeInt(n) : makeReal(n);
}

export function mulValues(a: SqlValue, b: SqlValue): SqlValue {
  const x = toNumeric(a);
  const y = toNumeric(b);
  if (!x || !y) return null;
  const n = x.n * y.n;
  return x.int && y.int ? makeInt(n) : makeReal(n);
}

export function divValues(a: SqlValue, b: SqlValue): SqlValue {
  const x = toNumeric(a);
  const y = toNumeric(b);
  if (!x || !y) return null;
  if (y.n === 0) return null;
  if (x.int && y.int) return makeInt(Math.trunc(x.n / y.n));
  return makeReal(x.n / y.n);
}

export function modValues(a: SqlValue, b: SqlValue): SqlValue {
  const x = toNumeric(a);
  const y = toNumeric(b);
  if (!x || !y) return null;
  if (y.n === 0) return null;
  if (x.int && y.int) {
    const l = Math.abs(x.n) % Math.abs(y.n);
    return makeInt(x.n < 0 ? -l : l);
  }
  const r = x.n % y.n;
  return makeReal(r);
}

export function negateValue(v: SqlValue): SqlValue {
  const x = toNumeric(v);
  if (!x) return null;
  return x.int ? makeInt(-x.n) : makeReal(-x.n);
}

/* ------------------------------------------------------------------ */
/* Text conversion                                                     */
/* ------------------------------------------------------------------ */

export function realToText(x: number): string {
  if (Number.isNaN(x)) return "NULL";
  if (x === Infinity) return "Inf";
  if (x === -Infinity) return "-Inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const a = Math.abs(x);
  if (a >= 1e-4 && a < 1e15) {
    let s = String(Number(x.toPrecision(15)));
    if (!s.includes(".") && !s.includes("e")) s += ".0";
    return s;
  }
  let s = Number(x.toPrecision(15)).toExponential();
  const ei = s.indexOf("e");
  const mantissa = s.slice(0, ei);
  const exponent = s.slice(ei);
  if (!mantissa.includes(".")) s = `${mantissa}.0${exponent}`;
  return s;
}

export function valueToText(v: SqlValue): string | null {
  if (v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return realToText(v.value);
}

export function concatValues(a: SqlValue, b: SqlValue): SqlValue {
  if (a === null || b === null) return null;
  return (valueToText(a) as string) + (valueToText(b) as string);
}

export function lengthOf(v: SqlValue): SqlValue {
  if (v === null) return null;
  return (valueToText(v) as string).length;
}

export function lowerAscii(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : s[i];
  }
  return out;
}

export function upperAscii(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code >= 97 && code <= 122 ? String.fromCharCode(code - 32) : s[i];
  }
  return out;
}

export function applyCase(v: SqlValue, upper: boolean): SqlValue {
  if (v === null) return null;
  const s = valueToText(v) as string;
  return upper ? upperAscii(s) : lowerAscii(s);
}

export function lowerChar(code: number): number {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

/** SQLite LIKE: `%` any sequence, `_` single char, ASCII case insensitive. */
export function likeMatch(str: string, pat: string, escape: string | null): boolean {
  let s = 0;
  let p = 0;
  let star = -1;
  let mark = 0;
  while (s < str.length) {
    if (p < pat.length) {
      let pc = pat[p];
      if (escape !== null && pc === escape) {
        p++;
        if (p >= pat.length) return false;
        pc = pat[p];
        if (lowerChar(str.charCodeAt(s)) !== lowerChar(pc.charCodeAt(0))) {
          if (star >= 0) {
            p = star + 1;
            mark++;
            s = mark;
            continue;
          }
          return false;
        }
        s++;
        p++;
        continue;
      }
      if (pc === "%") {
        star = p;
        mark = s;
        p++;
        continue;
      }
      const matches = pc === "_" || lowerChar(str.charCodeAt(s)) === lowerChar(pc.charCodeAt(0));
      if (!matches) {
        if (star >= 0) {
          p = star + 1;
          mark++;
          s = mark;
          continue;
        }
        return false;
      }
      s++;
      p++;
    } else if (star >= 0) {
      p = star + 1;
      mark++;
      s = mark;
    } else {
      return false;
    }
  }
  while (p < pat.length) {
    if (pat[p] === "%") {
      p++;
      continue;
    }
    if (escape !== null && pat[p] === escape) {
      p += 2;
      continue;
    }
    return false;
  }
  return true;
}

export function likeValues(a: SqlValue, b: SqlValue, escape: string | null): SqlValue {
  if (a === null || b === null) return null;
  const s = valueToText(a) as string;
  const p = valueToText(b) as string;
  return likeMatch(s, p, escape) ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* Three valued logic                                                  */
/* ------------------------------------------------------------------ */

export function truthy(v: SqlValue): boolean {
  if (v === null) return false;
  if (typeof v === "string") return parseNumericText(v).n !== 0;
  return numOf(v) !== 0;
}

export function notValue(v: SqlValue): SqlValue {
  return v === null ? null : truthy(v) ? 0 : 1;
}

export function andValues(a: SqlValue, b: SqlValue): SqlValue {
  if (a === null || b === null) {
    if ((a !== null && !truthy(a)) || (b !== null && !truthy(b))) return 0;
    return null;
  }
  return truthy(a) && truthy(b) ? 1 : 0;
}

export function orValues(a: SqlValue, b: SqlValue): SqlValue {
  if (a === null || b === null) {
    if ((a !== null && truthy(a)) || (b !== null && truthy(b))) return 1;
    return null;
  }
  return truthy(a) || truthy(b) ? 1 : 0;
}

export function compareOp(a: SqlValue, b: SqlValue, test: (c: number) => boolean): SqlValue {
  if (a === null || b === null) return null;
  return test(compare(a, b)) ? 1 : 0;
}

export function isOp(a: SqlValue, b: SqlValue, negate: boolean): SqlValue {
  const eq = a === null || b === null ? a === b : compare(a, b) === 0;
  return (negate ? !eq : eq) ? 1 : 0;
}

export function inOp(x: SqlValue, list: readonly SqlValue[]): SqlValue {
  if (x === null) return null;
  let hasNull = false;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (item === null) {
      hasNull = true;
      continue;
    }
    if (compare(x, item) === 0) return 1;
  }
  return hasNull ? null : 0;
}

/* ------------------------------------------------------------------ */
/* Keys (equality semantics: 2 and 2.0 are equal, '2' is not)          */
/* ------------------------------------------------------------------ */

export function groupKeyOf(v: SqlValue): string {
  if (v === null) return "n";
  if (typeof v === "string") return `t${v.length}:${v}`;
  return `v${numOf(v)}`;
}

export function rowKey(values: readonly SqlValue[]): string {
  let key = "";
  for (let i = 0; i < values.length; i++) {
    if (i > 0) key += "\u0001";
    key += groupKeyOf(values[i]);
  }
  return key;
}

/** Unwrap internal REAL boxes so results are plain JS values. */
export function outputValue(v: SqlValue): number | string | null {
  return typeof v === "object" && v !== null ? v.value : v;
}
