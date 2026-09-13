import { simpleCaseFold } from './casefold.js';
import type { ClassPiece } from './parser.js';

const legacyCache = new Int32Array(0x10000).fill(-1);

export function canonicalize(cp: number, unicode: boolean, ignoreCase: boolean): number {
  if (!ignoreCase) return cp;
  if (unicode) return simpleCaseFold.get(cp) ?? cp;
  return canonicalizeLegacy(cp);
}

export function canonicalizeLegacy(cu: number): number {
  const cached = legacyCache[cu];
  if (cached !== undefined && cached >= 0) return cached;
  const upper = String.fromCharCode(cu).toUpperCase();
  let result = cu;
  if (upper.length === 1) {
    const mapped = upper.charCodeAt(0);
    if (!(cu >= 128 && mapped < 128)) result = mapped;
  }
  legacyCache[cu] = result;
  return result;
}

export function codePointAt(input: string, pos: number): number {
  const cu = input.charCodeAt(pos);
  if (cu >= 0xd800 && cu <= 0xdbff && pos + 1 < input.length) {
    const next = input.charCodeAt(pos + 1);
    if (next >= 0xdc00 && next <= 0xdfff) {
      return ((cu - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
    }
  }
  return cu;
}

export function charLengthAt(input: string, pos: number): number {
  const cu = input.charCodeAt(pos);
  if (cu >= 0xd800 && cu <= 0xdbff && pos + 1 < input.length) {
    const next = input.charCodeAt(pos + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return 2;
  }
  return 1;
}

export function advanceIndex(text: string, index: number, unicode: boolean): number {
  if (unicode) {
    const cu = text.charCodeAt(index);
    if (cu >= 0xd800 && cu <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) return index + 2;
    }
  }
  return index + 1;
}

export function isLineTerminator(cp: number): boolean {
  return cp === 0x0a || cp === 0x0d || cp === 0x2028 || cp === 0x2029;
}

const SPACE_RANGES: readonly [number, number][] = [
  [0x09, 0x0d],
  [0x20, 0x20],
  [0xa0, 0xa0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
];

export function isDigit(cp: number): boolean {
  return cp >= 0x30 && cp <= 0x39;
}

export function isBasicWord(cp: number): boolean {
  return (
    (cp >= 0x30 && cp <= 0x39) ||
    (cp >= 0x41 && cp <= 0x5a) ||
    (cp >= 0x61 && cp <= 0x7a) ||
    cp === 0x5f
  );
}

export function isSpacePiece(cp: number, unicode: boolean): boolean {
  void unicode;
  for (const [from, to] of SPACE_RANGES) {
    if (cp >= from && cp <= to) return true;
  }
  return false;
}

export type CharMatcher = (input: string, pos: number) => number;

function isMidPair(input: string, pos: number): boolean {
  const cu = input.charCodeAt(pos);
  if (cu >= 0xdc00 && cu <= 0xdfff && pos > 0) {
    const prev = input.charCodeAt(pos - 1);
    return prev >= 0xd800 && prev <= 0xdbff;
  }
  return false;
}

export interface ClassPredicateOptions {
  unicode: boolean;
  ignoreCase: boolean;
}

function rangeContains(ranges: readonly number[], cp: number): boolean {
  let lo = 0;
  let hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const from = ranges[mid * 2]!;
    const to = ranges[mid * 2 + 1]!;
    if (cp < from) hi = mid - 1;
    else if (cp > to) lo = mid + 1;
    else return true;
  }
  return false;
}

function normalizeRanges(ranges: number[]): number[] {
  if (ranges.length === 0) return ranges;
  const pairs: [number, number][] = [];
  for (let i = 0; i < ranges.length; i += 2) {
    pairs.push([ranges[i]!, ranges[i + 1]!]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: number[] = [];
  let curFrom = pairs[0]![0];
  let curTo = pairs[0]![1];
  for (let i = 1; i < pairs.length; i++) {
    const [from, to] = pairs[i]!;
    if (from <= curTo + 1) {
      if (to > curTo) curTo = to;
    } else {
      out.push(curFrom, curTo);
      curFrom = from;
      curTo = to;
    }
  }
  out.push(curFrom, curTo);
  return out;
}

export function buildClassMatcher(
  pieces: readonly ClassPiece[],
  negated: boolean,
  options: ClassPredicateOptions,
): CharMatcher {
  const { unicode, ignoreCase } = options;
  const maxCp = unicode ? 0x10ffff : 0xffff;

  const rangeValues: number[] = [];
  let digitsPositive = false;
  let digitsNegative = false;
  let wordPositive = false;
  let wordNegative = false;
  let spacePositive = false;
  let spaceNegative = false;

  for (const piece of pieces) {
    switch (piece.kind) {
      case 'range':
        rangeValues.push(piece.from, Math.min(piece.to, maxCp));
        break;
      case 'digits':
        if (piece.neg) digitsNegative = true;
        else digitsPositive = true;
        break;
      case 'word':
        if (piece.neg) wordNegative = true;
        else wordPositive = true;
        break;
      case 'space':
        if (piece.neg) spaceNegative = true;
        else spacePositive = true;
        break;
    }
  }

  let normalized: number[];
  if (ignoreCase) {
    // Predefined sets are fold-closed, so they are handled as boolean
    // predicates below; only explicit ranges need folding into canonical form.
    const folded: number[] = [];
    for (let i = 0; i < rangeValues.length; i += 2) {
      const from = rangeValues[i]!;
      const to = rangeValues[i + 1]!;
      for (let cp = from; cp <= to; cp++) {
        const c = canonicalize(cp, unicode, true);
        folded.push(c, c);
      }
    }
    normalized = normalizeRanges(folded);
  } else {
    normalized = normalizeRanges(rangeValues);
  }

  const hasRanges = rangeValues.length > 0;
  const wordUsesFold = ignoreCase && unicode;

  return (input, pos) => {
    if (pos >= input.length) return -1;
    if (unicode && isMidPair(input, pos)) return -1;
    const rawCp = unicode ? codePointAt(input, pos) : input.charCodeAt(pos);
    const c = ignoreCase ? canonicalize(rawCp, unicode, true) : rawCp;
    let inSet = hasRanges && rangeContains(normalized, c);
    if (digitsPositive) inSet = inSet || isDigit(c);
    if (digitsNegative) inSet = inSet || !isDigit(c);
    if (spacePositive) inSet = inSet || isSpacePiece(c, unicode);
    if (spaceNegative) inSet = inSet || !isSpacePiece(c, unicode);
    if (wordPositive || wordNegative) {
      const isWord = wordUsesFold ? isBasicWord(canonicalize(rawCp, true, true)) : isBasicWord(rawCp);
      if (wordPositive && wordNegative) inSet = true;
      else if (wordPositive) inSet = inSet || isWord;
      else inSet = inSet || !isWord;
    }
    if (inSet !== negated) {
      return pos + (unicode ? charLengthAt(input, pos) : 1);
    }
    return -1;
  };
}

export function buildCharMatcher(cp: number, options: ClassPredicateOptions): CharMatcher {
  const { unicode, ignoreCase } = options;
  if (!unicode && cp > 0xffff) {
    // A literal astral character without the u flag is a surrogate pair.
    return (input, pos) => {
      if (pos >= input.length) return -1;
      const units = String.fromCodePoint(cp);
      if (input.startsWith(units, pos)) return pos + units.length;
      return -1;
    };
  }
  const target = canonicalize(cp, unicode, ignoreCase);
  return (input, pos) => {
    if (pos >= input.length) return -1;
    if (unicode && isMidPair(input, pos)) return -1;
    const rawCp = unicode ? codePointAt(input, pos) : input.charCodeAt(pos);
    if (canonicalize(rawCp, unicode, ignoreCase) !== target) return -1;
    return pos + (unicode ? charLengthAt(input, pos) : 1);
  };
}

export function buildAnyMatcher(dotAll: boolean, unicode: boolean): CharMatcher {
  return (input, pos) => {
    if (pos >= input.length) return -1;
    if (unicode && isMidPair(input, pos)) return -1;
    const cp = unicode ? codePointAt(input, pos) : input.charCodeAt(pos);
    if (!dotAll && isLineTerminator(cp)) return -1;
    return pos + (unicode ? charLengthAt(input, pos) : 1);
  };
}

export function isWordCharAt(
  input: string,
  unitPos: number,
  unicode: boolean,
  ignoreCase: boolean,
): boolean {
  if (unitPos < 0 || unitPos >= input.length) return false;
  const cp = unicode ? codePointAt(input, unitPos) : input.charCodeAt(unitPos);
  if (isBasicWord(cp)) return true;
  if (unicode && ignoreCase) return isBasicWord(canonicalize(cp, true, true));
  return false;
}

export function isWordCharBefore(
  input: string,
  unitPos: number,
  unicode: boolean,
  ignoreCase: boolean,
): boolean {
  if (unitPos <= 0) return false;
  let cp: number;
  if (!unicode) {
    cp = input.charCodeAt(unitPos - 1);
  } else {
    const cu = input.charCodeAt(unitPos - 1);
    if (cu >= 0xdc00 && cu <= 0xdfff && unitPos >= 2) {
      const prev = input.charCodeAt(unitPos - 2);
      if (prev >= 0xd800 && prev <= 0xdbff) {
        cp = ((prev - 0xd800) << 10) + (cu - 0xdc00) + 0x10000;
      } else {
        cp = cu;
      }
    } else {
      cp = cu;
    }
  }
  if (isBasicWord(cp)) return true;
  if (unicode && ignoreCase) return isBasicWord(canonicalize(cp, true, true));
  return false;
}
