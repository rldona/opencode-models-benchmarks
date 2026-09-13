import type { Match, Regex, RegexStream } from './types';

type Flags = {
  readonly global: boolean;
  readonly ignoreCase: boolean;
  readonly multiline: boolean;
  readonly dotAll: boolean;
  readonly unicode: boolean;
  readonly sticky: boolean;
  readonly text: string;
};

type AssertionKind = 'start' | 'end' | 'word' | 'not-word';
type PredicateKind = 'digit' | 'not-digit' | 'word' | 'not-word' | 'space' | 'not-space';

type ClassItem =
  | { readonly kind: 'literal'; readonly value: number }
  | { readonly kind: 'range'; readonly from: number; readonly to: number }
  | { readonly kind: 'predicate'; readonly predicate: PredicateKind };

type Node =
  | { readonly kind: 'empty' }
  | { readonly kind: 'sequence'; readonly nodes: Node[] }
  | { readonly kind: 'alternate'; readonly alternatives: Node[] }
  | { readonly kind: 'literal'; readonly value: number }
  | { readonly kind: 'dot' }
  | { readonly kind: 'class'; readonly negated: boolean; readonly items: ClassItem[] }
  | { readonly kind: 'assert'; readonly assertion: AssertionKind }
  | { readonly kind: 'group'; readonly index: number; readonly name?: string; readonly child: Node }
  | {
      readonly kind: 'repeat';
      readonly child: Node;
      readonly min: number;
      readonly max: number | null;
      readonly greedy: boolean;
      readonly reset: number[];
    }
  | { readonly kind: 'backref'; readonly index?: number; readonly name?: string }
  | { readonly kind: 'lookahead'; readonly child: Node; readonly negative: boolean };

type EscapeResult =
  | { readonly kind: 'literal'; readonly value: number }
  | { readonly kind: 'predicate'; readonly predicate: PredicateKind }
  | { readonly kind: 'assert'; readonly assertion: AssertionKind }
  | { readonly kind: 'backref'; readonly index?: number; readonly name?: string };

type ParsedPattern = {
  readonly root: Node;
  readonly captures: number;
  readonly names: Map<string, number>;
  readonly hasComplexFeatures: boolean;
};

type Unit = { readonly value: number; readonly width: number };

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function readUnit(text: string, index: number, unicode: boolean): Unit {
  const first = text.charCodeAt(index);
  if (unicode && isHighSurrogate(first) && index + 1 < text.length) {
    const second = text.charCodeAt(index + 1);
    if (isLowSurrogate(second)) {
      return {
        value: 0x10000 + ((first - 0xd800) << 10) + second - 0xdc00,
        width: 2,
      };
    }
  }
  return { value: first, width: 1 };
}

function isSurrogateInterior(text: string, index: number, unicode: boolean): boolean {
  return (
    unicode &&
    index > 0 &&
    index < text.length &&
    isHighSurrogate(text.charCodeAt(index - 1)) &&
    isLowSurrogate(text.charCodeAt(index))
  );
}

function previousUnit(text: string, index: number, unicode: boolean): Unit | null {
  if (index <= 0) return null;
  if (unicode && index >= 2) {
    const low = text.charCodeAt(index - 1);
    const high = text.charCodeAt(index - 2);
    if (isLowSurrogate(low) && isHighSurrogate(high)) {
      return {
        value: 0x10000 + ((high - 0xd800) << 10) + low - 0xdc00,
        width: 2,
      };
    }
  }
  return { value: text.charCodeAt(index - 1), width: 1 };
}

function advanceIndex(text: string, index: number, unicode: boolean): number {
  return index + readUnit(text, index, unicode).width;
}

function isDecimal(value: number): boolean {
  return value >= 0x30 && value <= 0x39;
}

function isAsciiLetter(value: number): boolean {
  return (value >= 0x41 && value <= 0x5a) || (value >= 0x61 && value <= 0x7a);
}

function isAsciiNameStart(value: number): boolean {
  return isAsciiLetter(value) || value === 0x24 || value === 0x5f;
}

function isAsciiNameContinue(value: number): boolean {
  return isAsciiNameStart(value) || isDecimal(value);
}

function isLineTerminator(value: number): boolean {
  return value === 0x0a || value === 0x0d || value === 0x2028 || value === 0x2029;
}

function isWhiteSpace(value: number): boolean {
  return (
    (value >= 0x09 && value <= 0x0d) ||
    value === 0x20 ||
    value === 0xa0 ||
    value === 0x1680 ||
    (value >= 0x2000 && value <= 0x200a) ||
    value === 0x2028 ||
    value === 0x2029 ||
    value === 0x202f ||
    value === 0x205f ||
    value === 0x3000 ||
    value === 0xfeff
  );
}

function simpleCanonical(value: number): number {
  const oneCodePoint = (text: string): number | null => {
    const first = text.codePointAt(0);
    if (first === undefined) return null;
    const width = first > 0xffff ? 2 : 1;
    return text.length === width ? first : null;
  };
  const lower = oneCodePoint(String.fromCodePoint(value).toLowerCase());
  if (lower !== null) {
    const folded = oneCodePoint(String.fromCodePoint(lower).toUpperCase());
    if (folded !== null) return folded;
    return lower;
  }
  const upper = oneCodePoint(String.fromCodePoint(value).toUpperCase());
  return upper ?? value;
}

function canonicalValue(value: number, unicode: boolean): number {
  if (unicode) {
    if (value === 0x0130 || value === 0x0131) return value;
    return simpleCanonical(value);
  }
  if (value <= 0xffff) {
    if (value === 0x0130 || value === 0x0131 || value === 0x017f || value === 0x212a) return value;
    const text = String.fromCodePoint(value).toUpperCase();
    const first = text.codePointAt(0);
    const width = first !== undefined && first > 0xffff ? 2 : 1;
    return first !== undefined && text.length === width ? first : value;
  }
  return value;
}

function sameCharacter(left: number, right: number, flags: Flags): boolean {
  return flags.ignoreCase
    ? canonicalValue(left, flags.unicode) === canonicalValue(right, flags.unicode)
    : left === right;
}

function isWordValue(value: number, flags: Flags): boolean {
  if (value < 0) return false;
  const canonical = flags.ignoreCase ? canonicalValue(value, flags.unicode) : value;
  return (
    (canonical >= 0x41 && canonical <= 0x5a) ||
    (canonical >= 0x61 && canonical <= 0x7a) ||
    (canonical >= 0x30 && canonical <= 0x39) ||
    canonical === 0x5f
  );
}

function classItemMatches(item: ClassItem, value: number, flags: Flags): boolean {
  const canonical = flags.ignoreCase ? canonicalValue(value, flags.unicode) : value;
  switch (item.kind) {
    case 'literal':
      return sameCharacter(value, item.value, flags);
    case 'range': {
      const from = flags.ignoreCase ? canonicalValue(item.from, flags.unicode) : item.from;
      const to = flags.ignoreCase ? canonicalValue(item.to, flags.unicode) : item.to;
      return canonical >= Math.min(from, to) && canonical <= Math.max(from, to);
    }
    case 'predicate':
      switch (item.predicate) {
        case 'digit':
          return canonical >= 0x30 && canonical <= 0x39;
        case 'not-digit':
          return !(canonical >= 0x30 && canonical <= 0x39);
        case 'word':
          return isWordValue(value, flags);
        case 'not-word':
          return !isWordValue(value, flags);
        case 'space':
          return isWhiteSpace(value);
        case 'not-space':
          return !isWhiteSpace(value);
      }
  }
}

function classMatches(node: Extract<Node, { kind: 'class' }>, value: number, flags: Flags): boolean {
  const matched = node.items.some((item) => classItemMatches(item, value, flags));
  return node.negated ? !matched : matched;
}

function isLineStart(text: string, index: number, flags: Flags): boolean {
  if (index === 0) return true;
  if (!flags.multiline) return false;
  const previous = previousUnit(text, index, flags.unicode);
  if (!previous || !isLineTerminator(previous.value)) return false;
  return true;
}

function isLineEnd(text: string, index: number, flags: Flags): boolean {
  if (index === text.length) return true;
  if (!flags.multiline) return false;
  const next = readUnit(text, index, flags.unicode);
  if (!isLineTerminator(next.value)) return false;
  return true;
}

function assertionMatches(
  assertion: AssertionKind,
  text: string,
  index: number,
  flags: Flags,
): boolean {
  switch (assertion) {
    case 'start':
      return isLineStart(text, index, flags);
    case 'end':
      return isLineEnd(text, index, flags);
    case 'word': {
      const previous = previousUnit(text, index, flags.unicode);
      const next = index < text.length ? readUnit(text, index, flags.unicode) : null;
      return isWordValue(previous?.value ?? -1, flags) !== isWordValue(next?.value ?? -1, flags);
    }
    case 'not-word': {
      const previous = previousUnit(text, index, flags.unicode);
      const next = index < text.length ? readUnit(text, index, flags.unicode) : null;
      return isWordValue(previous?.value ?? -1, flags) === isWordValue(next?.value ?? -1, flags);
    }
  }
}

function throwSyntax(): never {
  throw new SyntaxError('Invalid regular expression');
}

class Parser {
  private readonly pattern: string;
  private readonly flags: Flags;
  private position = 0;
  private captureCount = 0;
  private readonly names = new Map<string, number>();
  private readonly numericReferences: number[] = [];
  private readonly namedReferences: string[] = [];

  public constructor(pattern: string, flags: Flags) {
    this.pattern = pattern;
    this.flags = flags;
  }

  public parse(): ParsedPattern {
    const root = this.parseDisjunction(false);
    if (this.position !== this.pattern.length) throwSyntax();
    for (const reference of this.numericReferences) {
      if (reference <= 0 || reference > this.captureCount) throwSyntax();
    }
    for (const reference of this.namedReferences) {
      if (!this.names.has(reference)) throwSyntax();
    }
    return {
      root,
      captures: this.captureCount,
      names: this.names,
      hasComplexFeatures: containsComplex(root),
    };
  }

  private peekCode(offset = 0): number {
    if (this.position + offset >= this.pattern.length) return -1;
    return this.pattern.charCodeAt(this.position + offset);
  }

  private parseDisjunction(inGroup: boolean): Node {
    const alternatives: Node[] = [this.parseSequence(inGroup)];
    while (this.peekCode() === 0x7c) {
      this.position += 1;
      alternatives.push(this.parseSequence(inGroup));
    }
    return alternatives.length === 1 ? alternatives[0] : { kind: 'alternate', alternatives };
  }

  private parseSequence(inGroup: boolean): Node {
    const nodes: Node[] = [];
    while (this.position < this.pattern.length) {
      const code = this.peekCode();
      if (code === 0x7c || code === 0x29) break;
      nodes.push(this.parseTerm(inGroup));
    }
    if (!inGroup && this.peekCode() === 0x29) throwSyntax();
    return nodes.length === 0 ? { kind: 'empty' } : nodes.length === 1 ? nodes[0] : { kind: 'sequence', nodes };
  }

  private parseTerm(inGroup: boolean): Node {
    const atom = this.parseAtom(inGroup);
    const code = this.peekCode();
    let min: number | null = null;
    let max: number | null = null;
    if (code === 0x2a) {
      min = 0;
      max = null;
      this.position += 1;
    } else if (code === 0x2b) {
      min = 1;
      max = null;
      this.position += 1;
    } else if (code === 0x3f) {
      min = 0;
      max = 1;
      this.position += 1;
    } else if (code === 0x7b) {
      const quantifier = this.parseBraceQuantifier();
      if (quantifier) {
        min = quantifier.min;
        max = quantifier.max;
      }
    }
    const hasQuantifier = min !== null;
    if (!hasQuantifier) return atom;
    if (atom.kind === 'assert' || atom.kind === 'lookahead') throwSyntax();
    let greedy = true;
    if (this.peekCode() === 0x3f) {
      greedy = false;
      this.position += 1;
    }
    const repeat: Node = {
      kind: 'repeat',
      child: atom,
      min: min as number,
      max,
      greedy,
      reset: collectCaptureIndices(atom),
    };
    return repeat;
  }

  private parseBraceQuantifier(): { min: number; max: number | null } | null {
    const saved = this.position;
    this.position += 1;
    const start = this.position;
    while (isDecimal(this.peekCode())) this.position += 1;
    if (this.position === start) {
      this.position = saved;
      throwSyntax();
    }
    const min = Number(this.pattern.slice(start, this.position));
    if (this.peekCode() === 0x7d) {
      this.position += 1;
      return { min, max: min };
    }
    if (this.peekCode() !== 0x2c) throwSyntax();
    this.position += 1;
    const maxStart = this.position;
    while (isDecimal(this.peekCode())) this.position += 1;
    if (this.peekCode() !== 0x7d) throwSyntax();
    const max = this.position === maxStart ? null : Number(this.pattern.slice(maxStart, this.position));
    this.position += 1;
    if (max !== null && max < min) throwSyntax();
    return { min, max };
  }

  private parseAtom(inGroup: boolean): Node {
    const code = this.peekCode();
    if (code < 0) return { kind: 'empty' };
    if (code === 0x28) return this.parseGroup();
    if (code === 0x5b) return this.parseClass();
    if (code === 0x5e) {
      this.position += 1;
      return { kind: 'assert', assertion: 'start' };
    }
    if (code === 0x24) {
      this.position += 1;
      return { kind: 'assert', assertion: 'end' };
    }
    if (code === 0x2e) {
      this.position += 1;
      return { kind: 'dot' };
    }
    if (code === 0x5c) {
      const escaped = this.parseEscape(false);
      switch (escaped.kind) {
        case 'literal':
          return escaped;
        case 'predicate':
          return { kind: 'class', negated: false, items: [{ kind: 'predicate', predicate: escaped.predicate }] };
        case 'assert':
          return escaped;
        case 'backref':
          return escaped;
      }
    }
    if (code === 0x29 && !inGroup) throwSyntax();
    if (code === 0x7b || code === 0x7d || code === 0x2a || code === 0x2b || code === 0x3f) throwSyntax();
    if (code === 0x5d) throwSyntax();
    const unit = readUnit(this.pattern, this.position, this.flags.unicode);
    this.position += unit.width;
    return { kind: 'literal', value: unit.value };
  }

  private parseGroup(): Node {
    this.position += 1;
    let kind: 'capture' | 'plain' | 'lookahead' | 'negative-lookahead' = 'capture';
    let name: string | undefined;
    if (this.peekCode() === 0x3f) {
      this.position += 1;
      const marker = this.peekCode();
      if (marker === 0x3a) {
        kind = 'plain';
        this.position += 1;
      } else if (marker === 0x3d) {
        kind = 'lookahead';
        this.position += 1;
      } else if (marker === 0x21) {
        kind = 'negative-lookahead';
        this.position += 1;
      } else if (marker === 0x3c) {
        this.position += 1;
        if (this.peekCode() === 0x3d || this.peekCode() === 0x21) throwSyntax();
        const start = this.position;
        if (!isAsciiNameStart(this.peekCode())) throwSyntax();
        this.position += 1;
        while (isAsciiNameContinue(this.peekCode())) this.position += 1;
        if (this.peekCode() !== 0x3e) throwSyntax();
        name = this.pattern.slice(start, this.position);
        this.position += 1;
        if (this.names.has(name)) throwSyntax();
      } else {
        throwSyntax();
      }
    }
    let index = 0;
    if (kind === 'capture') {
      index = ++this.captureCount;
      if (name !== undefined) this.names.set(name, index);
    }
    const child = this.parseDisjunction(true);
    if (this.peekCode() !== 0x29) throwSyntax();
    this.position += 1;
    if (kind === 'capture') return { kind: 'group', index, name, child };
    if (kind === 'lookahead' || kind === 'negative-lookahead') {
      return { kind: 'lookahead', child, negative: kind === 'negative-lookahead' };
    }
    return child;
  }

  private parseClass(): Node {
    this.position += 1;
    let negated = false;
    if (this.peekCode() === 0x5e) {
      negated = true;
      this.position += 1;
    }
    const items: ClassItem[] = [];
    let closed = false;
    while (this.position < this.pattern.length) {
      if (this.peekCode() === 0x5d) {
        this.position += 1;
        closed = true;
        break;
      }
      const first = this.parseClassAtom();
      if (first.kind === 'literal' && this.peekCode() === 0x2d && this.peekCode(1) !== 0x5d) {
        this.position += 1;
        const second = this.parseClassAtom();
        if (second.kind !== 'literal' || first.value > second.value) throwSyntax();
        items.push({ kind: 'range', from: first.value, to: second.value });
      } else if (first.kind !== 'literal' && this.peekCode() === 0x2d && this.peekCode(1) !== 0x5d) {
        throwSyntax();
      } else {
        items.push(first);
      }
    }
    if (!closed) throwSyntax();
    return { kind: 'class', negated, items };
  }

  private parseClassAtom(): ClassItem {
    if (this.peekCode() === 0x5c) {
      const escaped = this.parseEscape(true);
      if (escaped.kind === 'literal') return escaped;
      if (escaped.kind === 'predicate') return { kind: 'predicate', predicate: escaped.predicate };
      throwSyntax();
    }
    const unit = readUnit(this.pattern, this.position, this.flags.unicode);
    this.position += unit.width;
    if (unit.value === 0x2d && this.peekCode() === 0x5d) return { kind: 'literal', value: unit.value };
    return { kind: 'literal', value: unit.value };
  }

  private parseEscape(inClass: boolean): EscapeResult {
    this.position += 1;
    const code = this.peekCode();
    if (code < 0) throwSyntax();
    this.position += 1;
    switch (code) {
      case 0x74:
        return { kind: 'literal', value: 0x09 };
      case 0x6e:
        return { kind: 'literal', value: 0x0a };
      case 0x76:
        return { kind: 'literal', value: 0x0b };
      case 0x66:
        return { kind: 'literal', value: 0x0c };
      case 0x72:
        return { kind: 'literal', value: 0x0d };
      case 0x62:
        return inClass
          ? { kind: 'literal', value: 0x08 }
          : { kind: 'assert', assertion: 'word' };
      case 0x42:
        if (inClass) throwSyntax();
        return { kind: 'assert', assertion: 'not-word' };
      case 0x64:
        return { kind: 'predicate', predicate: 'digit' };
      case 0x44:
        return { kind: 'predicate', predicate: 'not-digit' };
      case 0x77:
        return { kind: 'predicate', predicate: 'word' };
      case 0x57:
        return { kind: 'predicate', predicate: 'not-word' };
      case 0x73:
        return { kind: 'predicate', predicate: 'space' };
      case 0x53:
        return { kind: 'predicate', predicate: 'not-space' };
      case 0x30:
        if (isDecimal(this.peekCode())) throwSyntax();
        return { kind: 'literal', value: 0 };
      case 0x63: {
        const control = this.peekCode();
        if (!isAsciiLetter(control)) throwSyntax();
        this.position += 1;
        return { kind: 'literal', value: control % 32 };
      }
      case 0x78:
        return { kind: 'literal', value: this.readHex(2) };
      case 0x75:
        if (this.peekCode() === 0x7b) {
          if (!this.flags.unicode) throwSyntax();
          this.position += 1;
          const start = this.position;
          while (this.isHex(this.peekCode())) this.position += 1;
          if (start === this.position || this.peekCode() !== 0x7d) throwSyntax();
          const value = Number.parseInt(this.pattern.slice(start, this.position), 16);
          this.position += 1;
          if (value > 0x10ffff) throwSyntax();
          return { kind: 'literal', value };
        }
        return { kind: 'literal', value: this.readHex(4) };
      case 0x6b: {
        if (inClass || this.peekCode() !== 0x3c) throwSyntax();
        this.position += 1;
        const start = this.position;
        if (!isAsciiNameStart(this.peekCode())) throwSyntax();
        this.position += 1;
        while (isAsciiNameContinue(this.peekCode())) this.position += 1;
        if (this.peekCode() !== 0x3e) throwSyntax();
        const name = this.pattern.slice(start, this.position);
        this.position += 1;
        this.namedReferences.push(name);
        return { kind: 'backref', name };
      }
      default:
        if (isDecimal(code)) {
          if (code === 0x30) throwSyntax();
          const start = this.position - 1;
          while (isDecimal(this.peekCode())) this.position += 1;
          const index = Number(this.pattern.slice(start, this.position));
          this.numericReferences.push(index);
          return { kind: 'backref', index };
        }
        if ('^$\\.*+?()[]{}|/'.includes(String.fromCharCode(code))) {
          return { kind: 'literal', value: code };
        }
        if (code === 0x2d && (inClass || !this.flags.unicode)) return { kind: 'literal', value: code };
        throwSyntax();
    }
  }

  private isHex(value: number): boolean {
    return (
      (value >= 0x30 && value <= 0x39) ||
      (value >= 0x41 && value <= 0x46) ||
      (value >= 0x61 && value <= 0x66)
    );
  }

  private readHex(count: number): number {
    const start = this.position;
    for (let index = 0; index < count; index += 1) {
      if (!this.isHex(this.peekCode())) throwSyntax();
      this.position += 1;
    }
    return Number.parseInt(this.pattern.slice(start, this.position), 16);
  }
}

function collectCaptureIndices(node: Node, out: number[] = []): number[] {
  switch (node.kind) {
    case 'group':
      out.push(node.index);
      collectCaptureIndices(node.child, out);
      break;
    case 'sequence':
      for (const child of node.nodes) collectCaptureIndices(child, out);
      break;
    case 'alternate':
      for (const child of node.alternatives) collectCaptureIndices(child, out);
      break;
    case 'repeat':
      collectCaptureIndices(node.child, out);
      break;
    case 'lookahead':
      collectCaptureIndices(node.child, out);
      break;
    default:
      break;
  }
  return out;
}

function containsComplex(node: Node): boolean {
  switch (node.kind) {
    case 'backref':
    case 'lookahead':
      return true;
    case 'sequence':
      return node.nodes.some(containsComplex);
    case 'alternate':
      return node.alternatives.some(containsComplex);
    case 'group':
    case 'repeat':
      return containsComplex(node.child);
    default:
      return false;
  }
}

type FlagsInput = string | undefined;

function parseFlags(input: FlagsInput): Flags {
  const value = input ?? '';
  const allowed = 'gimsuy';
  const seen = new Set<string>();
  for (const character of value) {
    if (!allowed.includes(character) || seen.has(character)) throw new SyntaxError('Invalid flags');
    seen.add(character);
  }
  const text = [...allowed].filter((character) => seen.has(character)).join('');
  return {
    global: seen.has('g'),
    ignoreCase: seen.has('i'),
    multiline: seen.has('m'),
    dotAll: seen.has('s'),
    unicode: seen.has('u'),
    sticky: seen.has('y'),
    text,
  };
}

type CaptureState = number[];
type EvaluationState = { readonly position: number; readonly captures: CaptureState };

function cloneCaptures(captures: CaptureState): CaptureState {
  return captures.slice();
}

function resetCaptures(captures: CaptureState, indices: number[]): CaptureState {
  const result = captures.slice();
  for (const index of indices) {
    result[index * 2 - 2] = -1;
    result[index * 2 - 1] = -1;
  }
  return result;
}

function compareBackreference(
  input: string,
  position: number,
  start: number,
  end: number,
  flags: Flags,
): number | null {
  let captured = start;
  let current = position;
  if (isSurrogateInterior(input, current, flags.unicode)) return null;
  while (captured < end) {
    const capturedUnit = readUnit(input, captured, flags.unicode);
    if (current >= input.length) return null;
    const currentUnit = readUnit(input, current, flags.unicode);
    if (!sameCharacter(capturedUnit.value, currentUnit.value, flags)) return null;
    captured += capturedUnit.width;
    current += currentUnit.width;
  }
  return current;
}

function matchNode(
  node: Node,
  state: EvaluationState,
  input: string,
  flags: Flags,
  names: Map<string, number>,
): EvaluationState[] {
  switch (node.kind) {
    case 'empty':
      return [state];
    case 'literal': {
      if (state.position >= input.length || isSurrogateInterior(input, state.position, flags.unicode)) return [];
      const unit = readUnit(input, state.position, flags.unicode);
      return sameCharacter(unit.value, node.value, flags)
        ? [{ position: state.position + unit.width, captures: state.captures }]
        : [];
    }
    case 'dot': {
      if (state.position >= input.length || isSurrogateInterior(input, state.position, flags.unicode)) return [];
      const unit = readUnit(input, state.position, flags.unicode);
      if (!flags.dotAll && isLineTerminator(unit.value)) return [];
      return [{ position: state.position + unit.width, captures: state.captures }];
    }
    case 'class': {
      if (state.position >= input.length || isSurrogateInterior(input, state.position, flags.unicode)) return [];
      const unit = readUnit(input, state.position, flags.unicode);
      return classMatches(node, unit.value, flags)
        ? [{ position: state.position + unit.width, captures: state.captures }]
        : [];
    }
    case 'assert':
      return assertionMatches(node.assertion, input, state.position, flags) ? [state] : [];
    case 'sequence': {
      let states: EvaluationState[] = [state];
      for (const child of node.nodes) {
        const next: EvaluationState[] = [];
        for (const current of states) next.push(...matchNode(child, current, input, flags, names));
        states = next;
        if (states.length === 0) break;
      }
      return states;
    }
    case 'alternate': {
      const states: EvaluationState[] = [];
      for (const alternative of node.alternatives) {
        states.push(...matchNode(alternative, state, input, flags, names));
      }
      return states;
    }
    case 'group': {
      const captures = cloneCaptures(state.captures);
      captures[node.index * 2 - 2] = state.position;
      const results = matchNode(node.child, { position: state.position, captures }, input, flags, names);
      return results.map((result) => {
        const resultCaptures = cloneCaptures(result.captures);
        resultCaptures[node.index * 2 - 1] = result.position;
        return { position: result.position, captures: resultCaptures };
      });
    }
    case 'repeat':
      return matchRepeat(node, state, input, flags, names, 0);
    case 'backref': {
      const index = node.index ?? (node.name === undefined ? 0 : names.get(node.name) ?? 0);
      const start = state.captures[index * 2 - 2];
      const end = state.captures[index * 2 - 1];
      if (start < 0 || end < 0) return [state];
      const position = compareBackreference(input, state.position, start, end, flags);
      return position === null ? [] : [{ position, captures: state.captures }];
    }
    case 'lookahead': {
      const results = matchNode(node.child, state, input, flags, names);
      if (node.negative) return results.length === 0 ? [state] : [];
      return results.length === 0
        ? []
        : [{ position: state.position, captures: results[0].captures }];
    }
  }
}

function matchRepeat(
  node: Extract<Node, { kind: 'repeat' }>,
  state: EvaluationState,
  input: string,
  flags: Flags,
  names: Map<string, number>,
  count: number,
): EvaluationState[] {
  const canStop = count >= node.min;
  const canContinue = node.max === null || count < node.max;
  const stopped = canStop ? [state] : [];
  if (!canContinue) return stopped;
  const before = state.position;
  const childState = {
    position: state.position,
    captures: resetCaptures(state.captures, node.reset),
  };
  const continued: EvaluationState[] = [];
  for (const result of matchNode(node.child, childState, input, flags, names)) {
    if (node.max === null && result.position === before) continue;
    continued.push(...matchRepeat(node, result, input, flags, names, count + 1));
  }
  return node.greedy ? [...continued, ...stopped] : [...stopped, ...continued];
}

type Ref = { readonly instruction: number; readonly slot: 'out' | 'out1' };
type Instruction =
  | { op: 'char'; value: number; out: number }
  | { op: 'class'; node: Extract<Node, { kind: 'class' }>; out: number }
  | { op: 'dot'; out: number }
  | { op: 'assert'; assertion: AssertionKind; out: number }
  | { op: 'save-start'; index: number; out: number }
  | { op: 'save-end'; index: number; out: number }
  | { op: 'reset'; indices: number[]; out: number }
  | { op: 'jump'; out: number }
  | { op: 'split'; out: number; out1: number }
  | { op: 'match' };

type Fragment = { readonly start: number; readonly outs: Ref[] };

class NfaCompiler {
  private readonly instructions: Instruction[] = [];
  public root = 0;

  public compile(root: Node): Instruction[] {
    const fragment = this.compileNode(root);
    this.root = fragment.start;
    const match = this.emit({ op: 'match' });
    this.patch(fragment.outs, match);
    return this.instructions;
  }

  private emit(instruction: Instruction): number {
    this.instructions.push(instruction);
    return this.instructions.length - 1;
  }

  private patch(refs: Ref[], target: number): void {
    for (const ref of refs) {
      const instruction = this.instructions[ref.instruction];
      if (ref.slot === 'out' && instruction.op !== 'match') instruction.out = target;
      else if (instruction.op === 'split') instruction.out1 = target;
    }
  }

  private compileNode(node: Node): Fragment {
    switch (node.kind) {
      case 'empty': {
        const start = this.emit({ op: 'jump', out: -1 });
        return { start, outs: [{ instruction: start, slot: 'out' }] };
      }
      case 'literal': {
        const start = this.emit({ op: 'char', value: node.value, out: -1 });
        return { start, outs: [{ instruction: start, slot: 'out' }] };
      }
      case 'class': {
        const start = this.emit({ op: 'class', node, out: -1 });
        return { start, outs: [{ instruction: start, slot: 'out' }] };
      }
      case 'dot': {
        const start = this.emit({ op: 'dot', out: -1 });
        return { start, outs: [{ instruction: start, slot: 'out' }] };
      }
      case 'assert': {
        const start = this.emit({ op: 'assert', assertion: node.assertion, out: -1 });
        return { start, outs: [{ instruction: start, slot: 'out' }] };
      }
      case 'group': {
        const begin = this.emit({ op: 'save-start', index: node.index, out: -1 });
        const child = this.compileNode(node.child);
        const end = this.emit({ op: 'save-end', index: node.index, out: -1 });
        this.patch([{ instruction: begin, slot: 'out' }], child.start);
        this.patch(child.outs, end);
        return { start: begin, outs: [{ instruction: end, slot: 'out' }] };
      }
      case 'sequence': {
        let fragment = this.compileNode(node.nodes[0] ?? { kind: 'empty' });
        for (let index = 1; index < node.nodes.length; index += 1) {
          const next = this.compileNode(node.nodes[index]);
          this.patch(fragment.outs, next.start);
          fragment = { start: fragment.start, outs: next.outs };
        }
        return fragment;
      }
      case 'alternate': {
        const fragments = node.alternatives.map((alternative) => this.compileNode(alternative));
        let result = fragments[fragments.length - 1];
        if (!result) return this.compileNode({ kind: 'empty' });
        for (let index = fragments.length - 2; index >= 0; index -= 1) {
          const split = this.emit({ op: 'split', out: fragments[index].start, out1: result.start });
          result = { start: split, outs: [...fragments[index].outs, ...result.outs] };
        }
        return result;
      }
      case 'repeat':
        return this.compileRepeat(node);
      case 'backref':
      case 'lookahead':
        throw new Error('Complex nodes cannot be compiled to the regular NFA');
    }
  }

  private compileIteration(node: Extract<Node, { kind: 'repeat' }>): Fragment {
    const reset = this.emit({ op: 'reset', indices: node.reset, out: -1 });
    const child = this.compileNode(node.child);
    this.patch([{ instruction: reset, slot: 'out' }], child.start);
    return { start: reset, outs: child.outs };
  }

  private compileRepeat(node: Extract<Node, { kind: 'repeat' }>): Fragment {
    let result: Fragment | null = null;
    for (let count = 0; count < node.min; count += 1) {
      const iteration = this.compileIteration(node);
      if (!result) result = iteration;
      else {
        this.patch(result.outs, iteration.start);
        result = { start: result.start, outs: iteration.outs };
      }
    }
    if (node.max === null) {
      const iteration = this.compileIteration(node);
      const split = this.emit({ op: 'split', out: -1, out1: -1 });
      this.patch(iteration.outs, split);
      if (node.greedy) {
        this.instructions[split] = { op: 'split', out: iteration.start, out1: -1 };
      } else {
        this.instructions[split] = { op: 'split', out: -1, out1: iteration.start };
      }
      const loop: Fragment = { start: split, outs: [{ instruction: split, slot: node.greedy ? 'out1' : 'out' }] };
      if (!result) return loop;
      this.patch(result.outs, loop.start);
      return { start: result.start, outs: loop.outs };
    }
    const optional = node.max - node.min;
    if (optional > 0) {
      for (let count = 0; count < optional; count += 1) {
        const iteration = this.compileIteration(node);
        const split = node.greedy
          ? this.emit({ op: 'split', out: iteration.start, out1: -1 })
          : this.emit({ op: 'split', out: -1, out1: iteration.start });
        this.patch(iteration.outs, -1);
        const fragment: Fragment = {
          start: split,
          outs: [
            ...iteration.outs.map((ref) => ref),
            { instruction: split, slot: node.greedy ? 'out1' : 'out' },
          ],
        };
        if (!result) result = fragment;
        else {
          this.patch(result.outs, fragment.start);
          result = { start: result.start, outs: fragment.outs };
        }
      }
    }
    return result ?? this.compileNode({ kind: 'empty' });
  }
}

type NfaThread = { readonly instruction: number; readonly start: number; readonly captures: CaptureState };
type NfaCandidate = { readonly start: number; readonly end: number; readonly captures: CaptureState };
type NfaClosed = { readonly active: NfaThread[]; readonly candidate: NfaCandidate | null };

function closeNfa(
  seed: NfaThread[],
  instructions: Instruction[],
  input: string,
  position: number,
  flags: Flags,
  endKnown: boolean,
): NfaClosed {
  const active: NfaThread[] = [];
  const seen = new Set<number>();
  let candidate: NfaCandidate | null = null;
  const visit = (thread: NfaThread): void => {
    if (candidate || seen.has(thread.instruction)) return;
    seen.add(thread.instruction);
    const instruction = instructions[thread.instruction];
    switch (instruction.op) {
      case 'jump':
        visit({ ...thread, instruction: instruction.out });
        return;
      case 'split':
        visit({ ...thread, instruction: instruction.out });
        visit({ ...thread, instruction: instruction.out1 });
        return;
      case 'save-start': {
        const captures = cloneCaptures(thread.captures);
        captures[instruction.index * 2 - 2] = position;
        visit({ ...thread, instruction: instruction.out, captures });
        return;
      }
      case 'save-end': {
        const captures = cloneCaptures(thread.captures);
        captures[instruction.index * 2 - 1] = position;
        visit({ ...thread, instruction: instruction.out, captures });
        return;
      }
      case 'reset':
        visit({ ...thread, instruction: instruction.out, captures: resetCaptures(thread.captures, instruction.indices) });
        return;
      case 'assert':
        if (endKnown && assertionMatches(instruction.assertion, input, position, flags)) {
          visit({ ...thread, instruction: instruction.out });
        }
        return;
      case 'match':
        candidate = { start: thread.start, end: position, captures: thread.captures };
        return;
      default:
        active.push(thread);
    }
  };
  for (const thread of seed) visit(thread);
  return { active, candidate };
}

function stepNfa(
  active: NfaThread[],
  input: string,
  position: number,
  flags: Flags,
  instructions: Instruction[],
): NfaThread[] {
  if (position >= input.length || isSurrogateInterior(input, position, flags.unicode)) return [];
  const unit = readUnit(input, position, flags.unicode);
  const next: NfaThread[] = [];
  for (const thread of active) {
    const instruction = instructions[thread.instruction];
    if (instruction.op === 'char' && sameCharacter(unit.value, instruction.value, flags)) {
      next.push({ ...thread, instruction: instruction.out });
    } else if (instruction.op === 'class' && classMatches(instruction.node, unit.value, flags)) {
      next.push({ ...thread, instruction: instruction.out });
    } else if (instruction.op === 'dot' && (flags.dotAll || !isLineTerminator(unit.value))) {
      next.push({ ...thread, instruction: instruction.out });
    }
  }
  return next;
}

function initialCaptures(count: number): CaptureState {
  return Array.from({ length: count * 2 }, () => -1);
}

function runNfa(
  input: string,
  start: number,
  sticky: boolean,
  flags: Flags,
  instructions: Instruction[],
  root: number,
  captureCount: number,
): NfaCandidate | null {
  let position = start;
  let candidate: NfaCandidate | null = null;
  let active: NfaThread[] = [];
  let first = true;
  while (true) {
    if (first) {
      first = false;
      const closed = closeNfa(
        [{ instruction: root, start, captures: initialCaptures(captureCount) }],
        instructions,
        input,
        position,
        flags,
        true,
      );
      active = closed.active;
      candidate = closed.candidate;
    }
    if (candidate && active.length === 0) return candidate;
    if (position >= input.length) return candidate;
    const unit = readUnit(input, position, flags.unicode);
    const next = stepNfa(active, input, position, flags, instructions);
    if (candidate && next.length === 0) return candidate;
    position += next.length === 0 && flags.unicode ? 1 : unit.width;
    const seeds = next.slice();
    if (!candidate && !sticky) {
      seeds.push({ instruction: root, start: position, captures: initialCaptures(captureCount) });
    }
    const closed = closeNfa(seeds, instructions, input, position, flags, true);
    active = closed.active;
    if (closed.candidate) candidate = closed.candidate;
    if (next.length === 0 && !candidate && sticky) return null;
    if (next.length === 0 && !candidate && position >= input.length) return null;
  }
}

function makeMatch(
  candidate: NfaCandidate | EvaluationState,
  input: string,
  names: Map<string, number>,
  captureCount: number,
): Match {
  const start = 'start' in candidate ? candidate.start : 0;
  const end = 'end' in candidate ? candidate.end : candidate.position;
  const captures = Array.from({ length: captureCount + 1 }, (_, index) => {
    if (index === 0) return input.slice(start, end);
    const begin = candidate.captures[index * 2 - 2];
    const finish = candidate.captures[index * 2 - 1];
    return begin < 0 || finish < 0 ? undefined : input.slice(begin, finish);
  });
  const groups: Record<string, string | undefined> = {};
  for (const [name, index] of names) {
    Object.defineProperty(groups, name, {
      configurable: true,
      enumerable: true,
      value: captures[index] as string | undefined,
      writable: true,
    });
  }
  return { index: start, captures: captures as [string, ...(string | undefined)[]], groups };
}

export class RegexImplementation<P extends string = string> implements Regex<P> {
  public readonly source: string;
  public readonly flags: string;
  public lastIndex = 0;

  private readonly parsed: ParsedPattern;
  private readonly settings: Flags;
  private readonly instructions: Instruction[] | null;
  private readonly nfaRoot: number;

  public constructor(pattern: string, flagsInput?: string) {
    this.source = pattern;
    this.settings = parseFlags(flagsInput);
    this.flags = this.settings.text;
    this.parsed = new Parser(pattern, this.settings).parse();
    if (this.parsed.hasComplexFeatures) {
      this.instructions = null;
      this.nfaRoot = 0;
    } else {
      const compiler = new NfaCompiler();
      this.instructions = compiler.compile(this.parsed.root);
      this.nfaRoot = compiler.root;
    }
  }

  public exec(input: string): Match<P> | null {
    const stateful = this.settings.global || this.settings.sticky;
    const requestedStart = stateful ? normalizeLastIndex(this.lastIndex, input.length) : 0;
    const start =
      stateful && this.settings.unicode && !isBareNotWordAssertion(this.parsed.root)
        ? normalizeRegexStart(input, requestedStart, true)
        : requestedStart;
    if (stateful && start > input.length) {
      this.lastIndex = 0;
      return null;
    }
    const candidate = this.instructions
      ? runNfa(
          input,
          start,
          this.settings.sticky,
          this.settings,
          this.instructions,
          this.nfaRoot,
          this.parsed.captures,
        )
      : runBacktracking(
          input,
          start,
          this.settings.sticky,
          this.settings,
          this.parsed.root,
          this.parsed.names,
          this.parsed.captures,
        );
    if (!candidate) {
      if (stateful) this.lastIndex = 0;
      return null;
    }
    if (stateful) this.lastIndex = 'end' in candidate ? candidate.end : candidate.position;
    return makeMatch(candidate, input, this.parsed.names, this.parsed.captures) as Match<P>;
  }

  public stream(): RegexStream<P> {
    return new RegexStreamImplementation(this);
  }

  public getSettings(): Flags {
    return this.settings;
  }

  public getParsed(): ParsedPattern {
    return this.parsed;
  }
}

function normalizeLastIndex(value: number, length: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  if (value === Infinity) return length + 1;
  return Math.floor(value);
}

function normalizeRegexStart(input: string, start: number, unicode: boolean): number {
  if (isSurrogateInterior(input, start, unicode)) return start - 1;
  return start;
}

function isBareNotWordAssertion(node: Node): boolean {
  return node.kind === 'assert' && node.assertion === 'not-word';
}

function runBacktracking(
  input: string,
  start: number,
  sticky: boolean,
  flags: Flags,
  root: Node,
  names: Map<string, number>,
  captureCount: number,
): EvaluationState & { readonly start: number } | null {
  let position = start;
  while (position <= input.length) {
    const initial = { position, captures: initialCaptures(captureCount) };
    const result = matchNode(root, initial, input, flags, names)[0];
    if (result) return { ...result, start: position };
    if (sticky || position === input.length) break;
    position += 1;
  }
  return null;
}

export class RegexStreamImplementation<P extends string = string> implements RegexStream<P> {
  private readonly regex: RegexImplementation<P>;
  private readonly matcher: RegexImplementation<P>;
  private readonly probe: RegexImplementation<P>;
  private buffer = '';
  private bufferBase = 0;
  private nextSearch = 0;
  private waitingEmptyAt: number | null = null;
  private ended = false;
  private readonly fastDigits: boolean;
  private fastPosition = 0;
  private fastStart: number | null = null;
  private fastValue = '';

  public constructor(regex: RegexImplementation<P>) {
    this.regex = regex;
    const matcherFlags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    this.matcher = new RegexImplementation(regex.source, matcherFlags);
    this.probe = new RegexImplementation(regex.source, matcherFlags);
    this.fastDigits = regex.source === '\\d+' && !regex.getSettings().sticky;
  }

  public feed(chunk: string): Match<P>[] {
    if (this.ended) throw new Error('The regular expression stream has ended');
    if (this.fastDigits) return this.feedDigits(chunk);
    this.buffer += chunk;
    return this.drain(false);
  }

  public end(): Match<P>[] {
    if (this.ended) return [];
    this.ended = true;
    if (this.fastDigits) {
      const result: Match<P>[] = [];
      this.flushDigits(result);
      return result;
    }
    return this.drain(true);
  }

  private drain(final: boolean): Match<P>[] {
    const result: Match<P>[] = [];
    while (true) {
      const bufferEnd = this.bufferBase + this.buffer.length;
      if (this.waitingEmptyAt !== null) {
        if (bufferEnd <= this.waitingEmptyAt) break;
        const relative = this.waitingEmptyAt - this.bufferBase;
        this.nextSearch = this.waitingEmptyAt + readUnit(this.buffer, relative, this.regex.getSettings().unicode).width;
        this.waitingEmptyAt = null;
      }
      if (this.nextSearch < this.bufferBase) this.nextSearch = this.bufferBase;
      if (this.nextSearch > bufferEnd) break;
      const requested = this.nextSearch - this.bufferBase;
      this.matcher.lastIndex = requested;
      const match = this.matcher.exec(this.buffer);
      if (!match) break;
      const end = this.bufferBase + this.matcher.lastIndex;
      const absoluteMatch = this.bufferBase + match.index;
      if (!final && !this.isDefinitive(match, absoluteMatch, end)) {
        break;
      }
      result.push({ ...match, index: absoluteMatch } as Match<P>);
      let next = end;
      if (end === absoluteMatch) {
        if (end < bufferEnd) {
          next = end + readUnit(this.buffer, end - this.bufferBase, this.regex.getSettings().unicode).width;
        } else {
          if (!final) this.waitingEmptyAt = end;
          this.nextSearch = end;
          break;
        }
      }
      this.nextSearch = next;
      this.trimBuffer();
      if (final && this.nextSearch > this.bufferBase + this.buffer.length) break;
    }
    return result;
  }

  private isDefinitive(match: Match<P>, absoluteStart: number, absoluteEnd: number): boolean {
    if (this.regex.getParsed().hasComplexFeatures) return false;
    const suffixes = probeSuffixes(this.regex.getParsed().root, this.regex.getSettings());
    const requested = this.nextSearch - this.bufferBase;
    for (const suffix of suffixes) {
      this.probe.lastIndex = requested;
      const extended = this.probe.exec(this.buffer + suffix);
      if (!extended) return false;
      if (this.bufferBase + extended.index !== absoluteStart) return false;
      const extendedEnd = this.bufferBase + this.probe.lastIndex;
      if (extendedEnd !== absoluteEnd || !sameMatchData(match, extended)) return false;
    }
    return true;
  }

  private trimBuffer(): void {
    if (hasContextualAssertion(this.regex.getParsed().root)) return;
    const drop = this.nextSearch - this.bufferBase;
    if (drop <= 0) return;
    this.buffer = this.buffer.slice(drop);
    this.bufferBase = this.nextSearch;
  }

  private feedDigits(chunk: string): Match<P>[] {
    const result: Match<P>[] = [];
    for (let index = 0; index < chunk.length; index += 1) {
      const value = chunk.charCodeAt(index);
      if (value >= 0x30 && value <= 0x39) {
        if (this.fastStart === null) this.fastStart = this.fastPosition + index;
        this.fastValue += chunk[index];
      } else {
        this.flushDigits(result);
      }
    }
    this.fastPosition += chunk.length;
    return result;
  }

  private flushDigits(result: Match<P>[]): void {
    if (this.fastStart === null) return;
    result.push({
      index: this.fastStart,
      captures: [this.fastValue],
      groups: {},
    } as Match<P>);
    this.fastStart = null;
    this.fastValue = '';
  }
}

function sameMatchData(left: Match, right: Match): boolean {
  if (left.index !== right.index || left.captures.length !== right.captures.length) return false;
  for (let index = 0; index < left.captures.length; index += 1) {
    if (left.captures[index] !== right.captures[index]) return false;
  }
  const leftNames = Object.keys(left.groups);
  const rightNames = Object.keys(right.groups);
  if (leftNames.length !== rightNames.length) return false;
  for (const name of leftNames) if (left.groups[name] !== right.groups[name]) return false;
  return true;
}

function probeSuffixes(node: Node, flags: Flags): string[] {
  const values = new Set<number>([0x00, 0x09, 0x0a, 0x20, 0x30, 0x31, 0x41, 0x61, 0x62, 0x78, 0x7a]);
  const collect = (current: Node): void => {
    switch (current.kind) {
      case 'literal':
        values.add(current.value);
        break;
      case 'class':
        for (const item of current.items) {
          if (item.kind === 'literal') values.add(item.value);
          else if (item.kind === 'range') {
            values.add(item.from);
            values.add(item.to);
          } else if (item.predicate === 'digit' || item.predicate === 'not-digit') values.add(0x30);
        }
        break;
      case 'sequence':
        for (const child of current.nodes) collect(child);
        break;
      case 'alternate':
        for (const child of current.alternatives) collect(child);
        break;
      case 'group':
      case 'repeat':
        collect(current.child);
        break;
      case 'lookahead':
        collect(current.child);
        break;
      default:
        break;
    }
  };
  collect(node);
  values.add(0x1f600);
  const suffixes = [...values].map((value) => String.fromCodePoint(value));
  suffixes.push(String.fromCharCode(0xdc00));
  return suffixes;
}

function hasContextualAssertion(node: Node): boolean {
  switch (node.kind) {
    case 'assert':
      return true;
    case 'sequence':
      return node.nodes.some(hasContextualAssertion);
    case 'alternate':
      return node.alternatives.some(hasContextualAssertion);
    case 'group':
      return hasContextualAssertion(node.child);
    case 'repeat':
      return hasContextualAssertion(node.child);
    case 'lookahead':
      return true;
    default:
      return false;
  }
}

export function compileImplementation<P extends string>(pattern: P, flags?: string): Regex<P> {
  return new RegexImplementation(pattern, flags);
}
