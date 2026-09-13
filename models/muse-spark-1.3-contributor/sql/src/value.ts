export type SqlValue = number | string | null;

export type Val =
  | { t: 'null' }
  | { t: 'int'; v: number }
  | { t: 'real'; v: number }
  | { t: 'text'; v: string };

export const NULL_VAL: Val = { t: 'null' };

export function makeInt(n: number): Val {
  return { t: 'int', v: n };
}
export function makeReal(n: number): Val {
  return { t: 'real', v: n };
}
export function makeText(s: string): Val {
  return { t: 'text', v: s };
}

export function fromSqlValue(sv: SqlValue): Val {
  if (sv === null) return NULL_VAL;
  if (typeof sv === 'string') return { t: 'text', v: sv };
  // number: integer if no decimal part
  if (Number.isInteger(sv)) return { t: 'int', v: sv };
  return { t: 'real', v: sv };
}

export function toSqlValue(v: Val): SqlValue {
  if (v.t === 'null') return null;
  return v.v;
}

export function isNull(v: Val): v is { t: 'null' } {
  return v.t === 'null';
}
export function isNum(v: Val): boolean {
  return v.t === 'int' || v.t === 'real';
}
export function numVal(v: Val): number {
  return (v as { v: number }).v;
}

/** SQLite-like number -> text conversion. Reals that are integer-valued get ".0". */
export function valToText(v: Val): string {
  if (v.t === 'text') return v.v;
  if (v.t === 'int') return String(v.v);
  if (v.t === 'real') {
    const n = v.v;
    if (!Number.isFinite(n)) return String(n);
    const s = String(n);
    if (s.includes('.') || s.includes('e') || s.includes('E')) return s;
    return s + '.0';
  }
  throw new Error('valToText on NULL');
}

export function asciiLower(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) out += String.fromCharCode(c + 32);
    else out += s[i];
  }
  return out;
}

export function asciiUpper(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 97 && c <= 122) out += String.fromCharCode(c - 32);
    else out += s[i];
  }
  return out;
}

/** Byte-by-byte text comparison (ASCII: uppercase < lowercase). Returns -1/0/1. */
export function compareText(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ca = a.charCodeAt(i);
    const cb = b.charCodeAt(i);
    if (ca < cb) return -1;
    if (ca > cb) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

/**
 * Compare two non-null values in SQLite ASC order.
 * numbers < texts; numbers numerically; texts byte-wise.
 * Returns -1/0/1.
 */
export function compareNonNullAsc(a: Val, b: Val): number {
  const aNum = isNum(a);
  const bNum = isNum(b);
  if (aNum && bNum) {
    const av = numVal(a);
    const bv = numVal(b);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  }
  if (aNum && b.t === 'text') return -1;
  if (a.t === 'text' && bNum) return 1;
  // both text
  return compareText((a as { v: string }).v, (b as { v: string }).v);
}

/** Equality for = (null handled by caller). Different types (num vs text) => false. */
export function valuesEqual(a: Val, b: Val): boolean {
  if (a.t === 'null' || b.t === 'null') return false; // caller returns NULL
  const aNum = isNum(a);
  const bNum = isNum(b);
  if (aNum && bNum) return numVal(a) === numVal(b);
  if (a.t === 'text' && b.t === 'text') return a.v === b.v;
  return false;
}

/** Serialize value for GROUP BY / DISTINCT / hash join keys. Numbers normalized (1 == 1.0). */
export function hashKeyPart(v: Val): string {
  if (v.t === 'null') return 'N';
  if (v.t === 'text') return 'T:' + JSON.stringify(v.v);
  return 'N:' + String(numVal(v));
}

export function compositeKey(vals: Val[]): string {
  if (vals.length === 1) return hashKeyPart(vals[0]);
  let s = '';
  for (let i = 0; i < vals.length; i++) {
    if (i > 0) s += '\x1f';
    s += hashKeyPart(vals[i]);
  }
  return s;
}

/** Convert text to number SQLite-style (leading numeric prefix), for truthiness of texts. */
export function sqliteTextToNumber(s: string): number {
  let i = 0;
  while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r' || s[i] === '\f' || s[i] === '\v')) i++;
  const rest = s.slice(i);
  const m = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(rest);
  if (!m) return 0;
  const n = parseFloat(m[0]);
  return Number.isNaN(n) ? 0 : n;
}

/** Tri-state: 'true' | 'false' | 'null' */
export function triState(v: Val): 'true' | 'false' | 'null' {
  if (v.t === 'null') return 'null';
  if (v.t === 'int' || v.t === 'real') return v.v !== 0 ? 'true' : 'false';
  // text: numeric conversion
  const n = sqliteTextToNumber(v.v);
  return n !== 0 ? 'true' : 'false';
}

export function isTrueVal(v: Val): boolean {
  return triState(v) === 'true';
}
