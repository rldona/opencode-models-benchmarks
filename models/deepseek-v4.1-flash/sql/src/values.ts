import type { Cell } from './types';

export function makeReal(n: number): Cell {
  return Number.isInteger(n) && Number.isFinite(n) ? { r: n } : n;
}

export function isBoxedReal(v: Cell): v is { r: number } {
  return typeof v === 'object' && v !== null;
}

export function isNumVal(v: Cell): boolean {
  return typeof v === 'number' || isBoxedReal(v);
}

export function isRealVal(v: Cell): boolean {
  return isBoxedReal(v) || (typeof v === 'number' && !Number.isInteger(v));
}

export function numOf(v: Cell): number {
  return isBoxedReal(v) ? v.r : (v as number);
}

export function textToNumber(s: string): number {
  const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.trimStart());
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : 0;
}

export function textToCell(s: string): Cell {
  const t = s.trim();
  if (/^[+-]?\d+$/.test(t)) return Number(t);
  return makeReal(textToNumber(t));
}

export function numeric(v: Cell): Cell | null {
  if (v === null) return null;
  if (typeof v === 'string') return textToCell(v);
  return v;
}

export function formatReal(n: number): string {
  if (Object.is(n, -0)) return '0.0';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toFixed(1);
  let s = n.toPrecision(15);
  const eIdx = s.indexOf('e');
  if (eIdx >= 0) {
    let mant = s.slice(0, eIdx);
    const exp = s.slice(eIdx);
    if (mant.includes('.')) {
      mant = mant.replace(/0+$/, '');
      if (mant.endsWith('.')) mant += '0';
    } else {
      mant += '.0';
    }
    return mant + exp;
  }
  if (s.includes('.')) {
    s = s.replace(/0+$/, '');
    if (s.endsWith('.')) s += '0';
  }
  return s;
}

export function toText(v: Cell): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : formatReal(v);
  if (v === null) return '';
  return formatReal(v.r);
}

export function compareCells(a: Cell, b: Cell): number {
  if (a === null) return b === null ? 0 : -1;
  if (b === null) return 1;
  const an = isNumVal(a);
  const bn = isNumVal(b);
  if (an && bn) {
    const x = numOf(a);
    const y = numOf(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (an) return -1;
  if (bn) return 1;
  const x = a as string;
  const y = b as string;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function truth3(v: Cell): 0 | 1 | null {
  if (v === null) return null;
  return isTrueValue(v) ? 1 : 0;
}

export function isTrueValue(v: Cell): boolean {
  if (v === null) return false;
  if (typeof v === 'string') return textToNumber(v) !== 0;
  return numOf(v) !== 0;
}

export function and3(a: 0 | 1 | null, b: 0 | 1 | null): 0 | 1 | null {
  if (a === 0 || b === 0) return 0;
  if (a === null || b === null) return null;
  return 1;
}

export function or3(a: 0 | 1 | null, b: 0 | 1 | null): 0 | 1 | null {
  if (a === 1 || b === 1) return 1;
  if (a === null || b === null) return null;
  return 0;
}

export function not3(a: 0 | 1 | null): 0 | 1 | null {
  return a === null ? null : a === 1 ? 0 : 1;
}

export function valueKey(v: Cell): string {
  if (v === null) return 'z';
  if (typeof v === 'string') return 's' + v.length + ':' + v;
  const n = numOf(v);
  return 'n' + (Object.is(n, -0) ? 0 : n);
}

function arith(a: Cell, b: Cell, f: (x: number, y: number) => number): Cell {
  const x = numeric(a);
  const y = numeric(b);
  if (x === null || y === null) return null;
  const r = f(numOf(x), numOf(y));
  return isRealVal(x) || isRealVal(y) ? makeReal(r) : r;
}

export function addValues(a: Cell, b: Cell): Cell {
  return arith(a, b, (x, y) => x + y);
}

export function subValues(a: Cell, b: Cell): Cell {
  return arith(a, b, (x, y) => x - y);
}

export function mulValues(a: Cell, b: Cell): Cell {
  return arith(a, b, (x, y) => x * y);
}

export function divValues(a: Cell, b: Cell): Cell {
  const x = numeric(a);
  const y = numeric(b);
  if (x === null || y === null) return null;
  const yn = numOf(y);
  if (yn === 0) return null;
  const xn = numOf(x);
  if (isRealVal(x) || isRealVal(y)) return makeReal(xn / yn);
  return Math.trunc(xn / yn);
}

export function modValues(a: Cell, b: Cell): Cell {
  const x = numeric(a);
  const y = numeric(b);
  if (x === null || y === null) return null;
  const yn = numOf(y);
  if (yn === 0) return null;
  const r = numOf(x) % yn;
  return isRealVal(x) || isRealVal(y) ? makeReal(r) : r;
}

export function negValue(a: Cell): Cell {
  const x = numeric(a);
  if (x === null) return null;
  const n = -numOf(x);
  return isRealVal(x) ? makeReal(n) : n;
}

export function concatValues(a: Cell, b: Cell): Cell {
  if (a === null || b === null) return null;
  return toText(a) + toText(b);
}

export function roundValue(x: Cell, n: Cell): Cell {
  if (x === null || n === null) return null;
  const xv = numeric(x);
  const nv = numeric(n);
  if (xv === null || nv === null) return null;
  const digits = Math.max(-30, Math.min(30, Math.trunc(numOf(nv))));
  const f = Math.pow(10, digits);
  const scaled = numOf(xv) * f;
  const r = (Math.sign(scaled) * Math.round(Math.abs(scaled))) / f;
  return makeReal(Object.is(r, -0) ? 0 : r);
}

const likeCache = new Map<string, RegExp>();

function likeToRegExp(p: string): RegExp {
  let out = '^';
  for (const ch of p) {
    if (ch === '%') out += '[\\s\\S]*';
    else if (ch === '_') out += '[\\s\\S]';
    else if (ch >= 'a' && ch <= 'z') out += `[${ch}${ch.toUpperCase()}]`;
    else if (ch >= 'A' && ch <= 'Z') out += `[${ch.toLowerCase()}${ch}]`;
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(out + '$');
}

export function likeValues(v: Cell, p: Cell): Cell {
  if (v === null || p === null) return null;
  const s = toText(v);
  const pat = toText(p);
  let re = likeCache.get(pat);
  if (!re) {
    re = likeToRegExp(pat);
    likeCache.set(pat, re);
  }
  return re.test(s) ? 1 : 0;
}
