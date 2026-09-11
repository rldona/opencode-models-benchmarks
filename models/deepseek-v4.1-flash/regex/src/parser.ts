export type ClassPiece =
  | { kind: 'range'; from: number; to: number }
  | { kind: 'digits'; neg: boolean }
  | { kind: 'word'; neg: boolean }
  | { kind: 'space'; neg: boolean };

export type Node =
  | { kind: 'empty' }
  | { kind: 'char'; cp: number }
  | { kind: 'class'; pieces: ClassPiece[]; negated: boolean }
  | { kind: 'any' }
  | { kind: 'assert'; type: 'bol' | 'eol' | 'wb' | 'nwb' }
  | { kind: 'concat'; items: Node[] }
  | { kind: 'alt'; branches: Node[] }
  | { kind: 'group'; index: number | null; name: string | null; body: Node }
  | { kind: 'lookahead'; neg: boolean; body: Node }
  | { kind: 'backref'; ref: number | string }
  | { kind: 'repeat'; min: number; max: number; greedy: boolean; body: Node };

export interface ParsedPattern {
  ast: Node;
  groupCount: number;
  groupNames: Map<string, number>;
  hasNamedGroups: boolean;
  hasBackrefs: boolean;
  hasLookahead: boolean;
  unicode: boolean;
  ignoreCase: boolean;
  multiline: boolean;
  dotAll: boolean;
  global: boolean;
  sticky: boolean;
  flags: string;
}

const SYNTAX_ESCAPES = new Set(['^', '$', '\\', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '|', '/']);

function syntaxError(message: string): never {
  throw new SyntaxError(message);
}

export function parseFlags(flagsInput: string | undefined): {
  flags: string;
  global: boolean;
  ignoreCase: boolean;
  multiline: boolean;
  dotAll: boolean;
  unicode: boolean;
  sticky: boolean;
} {
  const seen = new Set<string>();
  for (const ch of flagsInput ?? '') {
    if (!'gimsuy'.includes(ch)) syntaxError(`Invalid flags supplied to RegExp constructor '${ch}'`);
    if (seen.has(ch)) syntaxError(`Invalid flags supplied to RegExp constructor '${ch}'`);
    seen.add(ch);
  }
  const order = 'gimsuy';
  let normalized = '';
  for (const ch of order) if (seen.has(ch)) normalized += ch;
  return {
    flags: normalized,
    global: seen.has('g'),
    ignoreCase: seen.has('i'),
    multiline: seen.has('m'),
    dotAll: seen.has('s'),
    unicode: seen.has('u'),
    sticky: seen.has('y'),
  };
}

class Parser {
  readonly src: string;
  readonly unicode: boolean;
  pos = 0;
  groupCount = 0;
  groupNames = new Map<string, number>();
  hasBackrefs = false;
  hasLookahead = false;

  constructor(src: string, unicode: boolean) {
    this.src = src;
    this.unicode = unicode;
  }

  error(message: string): never {
    syntaxError(`Invalid regular expression: /${this.src}/: ${message}`);
  }

  atEnd(): boolean {
    return this.pos >= this.src.length;
  }

  peek(): string {
    return this.src[this.pos] ?? '';
  }

  peekAt(offset: number): string {
    return this.src[this.pos + offset] ?? '';
  }

  advance(): string {
    const ch = this.src[this.pos] ?? '';
    this.pos++;
    return ch;
  }

  codePointAt(pos: number): number {
    const cu = this.src.charCodeAt(pos);
    if (this.unicode && cu >= 0xd800 && cu <= 0xdbff) {
      const next = this.src.charCodeAt(pos + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        return ((cu - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
      }
      this.error('lone surrogate in pattern');
    }
    return cu;
  }

  readChar(): number {
    const cp = this.codePointAt(this.pos);
    this.pos += cp > 0xffff ? 2 : 1;
    return cp;
  }

  parse(): Node {
    const node = this.parseDisjunction();
    if (!this.atEnd()) {
      this.error(`unexpected '${this.peek()}'`);
    }
    return node;
  }

  parseDisjunction(): Node {
    const branches: Node[] = [this.parseAlternative()];
    while (this.peek() === '|') {
      this.pos++;
      branches.push(this.parseAlternative());
    }
    if (branches.length === 1) return branches[0]!;
    return { kind: 'alt', branches };
  }

  parseAlternative(): Node {
    const items: Node[] = [];
    while (!this.atEnd() && this.peek() !== '|' && this.peek() !== ')') {
      items.push(this.parseTerm());
    }
    if (items.length === 0) return { kind: 'empty' };
    if (items.length === 1) return items[0]!;
    return { kind: 'concat', items };
  }

  parseTerm(): Node {
    const atom = this.parseAtomOrAssertion();
    if (atom.kind === 'assert') return atom;
    return this.parseQuantifier(atom);
  }

  parseQuantifier(atom: Node): Node {
    const ch = this.peek();
    let min: number | null = null;
    let max: number | null = null;
    let consumed = false;
    if (ch === '*') {
      this.pos++;
      min = 0;
      max = Infinity;
      consumed = true;
    } else if (ch === '+') {
      this.pos++;
      min = 1;
      max = Infinity;
      consumed = true;
    } else if (ch === '?') {
      this.pos++;
      min = 0;
      max = 1;
      consumed = true;
    } else if (ch === '{') {
      const saved = this.pos;
      const parsed = this.tryParseBracedQuantifier();
      if (parsed) {
        min = parsed.min;
        max = parsed.max;
        consumed = true;
      } else {
        this.pos = saved;
        this.error('incomplete quantifier');
      }
    }
    if (!consumed) return atom;
    let greedy = true;
    if (this.peek() === '?') {
      this.pos++;
      greedy = false;
    }
    if (atom.kind === 'empty') {
      this.error('nothing to repeat');
    }
    if (atom.kind === 'repeat' && !this.unicode) {
      // Annex B allows some of these; strict mode rejects them.
      this.error('nothing to repeat');
    }
    return { kind: 'repeat', min: min!, max: max!, greedy, body: atom };
  }

  tryParseBracedQuantifier(): { min: number; max: number } | null {
    const start = this.pos;
    this.pos++; // consume '{'
    let minStr = '';
    while (this.peek() >= '0' && this.peek() <= '9') minStr += this.advance();
    if (minStr.length === 0) {
      this.pos = start;
      return null;
    }
    let maxStr: string | null = null;
    if (this.peek() === ',') {
      this.pos++;
      maxStr = '';
      while (this.peek() >= '0' && this.peek() <= '9') maxStr += this.advance();
    }
    if (this.peek() !== '}') {
      this.pos = start;
      return null;
    }
    this.pos++;
    const min = Number(minStr);
    let max: number;
    if (maxStr === null) {
      max = min;
    } else if (maxStr === '') {
      max = Infinity;
    } else {
      max = Number(maxStr);
    }
    if (min > max) {
      this.error('numbers out of order in {} quantifier');
    }
    return { min, max };
  }

  parseAtomOrAssertion(): Node {
    const ch = this.peek();
    if (ch === '^') {
      this.pos++;
      return { kind: 'assert', type: 'bol' };
    }
    if (ch === '$') {
      this.pos++;
      return { kind: 'assert', type: 'eol' };
    }
    if (ch === '\\') {
      const esc = this.parseAtomEscape();
      return esc;
    }
    if (ch === '.') {
      this.pos++;
      return { kind: 'any' };
    }
    if (ch === '[') {
      return this.parseClass();
    }
    if (ch === '(') {
      return this.parseGroup();
    }
    if (ch === ')' || ch === '|' || ch === '') {
      this.error('unexpected end of pattern');
    }
    if (ch === '*' || ch === '+' || ch === '?') {
      this.error('nothing to repeat');
    }
    if (ch === '{') {
      this.error('lone quantifier brackets');
    }
    if (ch === '}') {
      this.error('lone quantifier brackets');
    }
    if (ch === ']') {
      this.error('lone character class bracket');
    }
    return { kind: 'char', cp: this.readChar() };
  }

  parseAtomEscape(): Node {
    this.pos++; // consume '\'
    if (this.atEnd()) this.error('pattern may not end with a trailing backslash');
    const ch = this.peek();
    if (ch === 'b') {
      this.pos++;
      return { kind: 'assert', type: 'wb' };
    }
    if (ch === 'B') {
      this.pos++;
      return { kind: 'assert', type: 'nwb' };
    }
    switch (ch) {
      case 'd':
        this.pos++;
        return { kind: 'class', pieces: [{ kind: 'digits', neg: false }], negated: false };
      case 'D':
        this.pos++;
        return { kind: 'class', pieces: [{ kind: 'digits', neg: true }], negated: false };
      case 'w':
        this.pos++;
        return { kind: 'class', pieces: [{ kind: 'word', neg: false }], negated: false };
      case 'W':
        this.pos++;
        return { kind: 'class', pieces: [{ kind: 'word', neg: true }], negated: false };
      case 's':
        this.pos++;
        return { kind: 'class', pieces: [{ kind: 'space', neg: false }], negated: false };
      case 'S':
        this.pos++;
        return { kind: 'class', pieces: [{ kind: 'space', neg: true }], negated: false };
      default:
        break;
    }
    if (ch >= '1' && ch <= '9') {
      let numStr = '';
      while (this.peek() >= '0' && this.peek() <= '9') numStr += this.advance();
      const num = Number(numStr);
      this.hasBackrefs = true;
      return { kind: 'backref', ref: num };
    }
    if (ch === 'k') {
      const save = this.pos;
      this.pos++;
      if (this.peek() !== '<') {
        this.pos = save;
      } else {
        this.pos++;
        let name = '';
        while (!this.atEnd() && this.peek() !== '>') name += this.advance();
        if (this.peek() !== '>') this.error('invalid named capture referenced');
        this.pos++;
        if (!/^[$A-Za-z_][$0-9A-Za-z_]*$/.test(name)) this.error('invalid named capture referenced');
        this.hasBackrefs = true;
        return { kind: 'backref', ref: name };
      }
    }
    const escaped = this.parseCharacterEscape(ch);
    return { kind: 'char', cp: escaped };
  }

  parseCharacterEscape(ch: string): number {
    switch (ch) {
      case 't':
        this.pos++;
        return 0x09;
      case 'n':
        this.pos++;
        return 0x0a;
      case 'v':
        this.pos++;
        return 0x0b;
      case 'f':
        this.pos++;
        return 0x0c;
      case 'r':
        this.pos++;
        return 0x0d;
      case '0': {
        this.pos++;
        const next = this.peek();
        if (next >= '0' && next <= '9') this.error('invalid decimal escape');
        return 0;
      }
      case 'c': {
        this.pos++;
        const letter = this.peek();
        if (!/[A-Za-z]/.test(letter)) this.error('invalid control escape');
        this.pos++;
        return letter.toUpperCase().charCodeAt(0) - 64;
      }
      case 'x': {
        this.pos++;
        const hex = this.takeHex(2);
        if (hex === null) this.error('invalid hexadecimal escape');
        return hex;
      }
      case 'u': {
        this.pos++;
        if (this.peek() === '{') {
          if (!this.unicode) this.error('invalid unicode escape');
          this.pos++;
          let hex = '';
          while (!this.atEnd() && this.peek() !== '}') hex += this.advance();
          if (this.peek() !== '}') this.error('invalid unicode escape');
          this.pos++;
          if (!/^[0-9A-Fa-f]+$/.test(hex)) this.error('invalid unicode escape');
          const cp = parseInt(hex, 16);
          if (cp > 0x10ffff) this.error('invalid unicode escape');
          return cp;
        }
        const hex = this.takeHex(4);
        if (hex === null) this.error('invalid unicode escape');
        if (this.unicode && hex >= 0xd800 && hex <= 0xdbff) {
          const saved = this.pos;
          if (this.peek() === '\\' && this.peekAt(1) === 'u') {
            this.pos += 2;
            if (this.peek() !== '{') {
              const low = this.takeHex(4);
              if (low !== null && low >= 0xdc00 && low <= 0xdfff) {
                return ((hex - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
              }
            }
            this.pos = saved;
          }
        }
        return hex;
      }
      default: {
        if (SYNTAX_ESCAPES.has(ch)) {
          this.pos++;
          return ch.charCodeAt(0);
        }
        this.error(`invalid escape \\${ch}`);
      }
    }
  }

  takeHex(count: number): number | null {
    const start = this.pos;
    for (let i = 0; i < count; i++) {
      const c = this.peek();
      if (!/[0-9A-Fa-f]/.test(c)) {
        this.pos = start;
        return null;
      }
      this.pos++;
    }
    return parseInt(this.src.slice(start, start + count), 16);
  }

  parseGroup(): Node {
    this.pos++; // consume '('
    let capturing = true;
    let name: string | null = null;
    let lookahead: boolean | null = null;
    if (this.peek() === '?') {
      this.pos++;
      const kind = this.peek();
      if (kind === ':') {
        this.pos++;
        capturing = false;
      } else if (kind === '=' || kind === '!') {
        this.pos++;
        lookahead = kind === '!';
        capturing = false;
      } else if (kind === '<') {
        this.pos++;
        let n = '';
        while (!this.atEnd() && this.peek() !== '>') n += this.advance();
        if (this.peek() !== '>') this.error('invalid named capture');
        this.pos++;
        if (!/^[$A-Za-z_][$0-9A-Za-z_]*$/.test(n)) this.error('invalid capture group name');
        name = n;
      } else {
        this.error('invalid group');
      }
    }
    const index = capturing ? ++this.groupCount : null;
    if (name !== null) {
      if (this.groupNames.has(name)) this.error('duplicate capture group name');
      this.groupNames.set(name, index!);
    }
    const body = this.parseDisjunction();
    if (this.peek() !== ')') this.error('unterminated group');
    this.pos++;
    if (lookahead !== null) {
      this.hasLookahead = true;
      return { kind: 'lookahead', neg: lookahead, body };
    }
    return { kind: 'group', index, name, body };
  }

  parseClass(): Node {
    this.pos++; // consume '['
    let negated = false;
    if (this.peek() === '^') {
      negated = true;
      this.pos++;
    }
    const pieces: ClassPiece[] = [];
    let first = true;
    while (true) {
      if (this.atEnd()) this.error('unterminated character class');
      const ch = this.peek();
      if (ch === ']' && !first) {
        this.pos++;
        break;
      }
      if (ch === ']' && first) {
        if (this.unicode) this.error('empty character class');
        // Annex B: ']' is literal when first.
      }
      first = false;
      const atom = this.parseClassAtom();
      if (atom.kind === 'predefined') {
        pieces.push(atom.piece);
        continue;
      }
      // possible range
      if (this.peek() === '-' && this.peekAt(1) !== ']' && this.peekAt(1) !== '') {
        this.pos++; // consume '-'
        const right = this.parseClassAtom();
        if (right.kind === 'predefined') {
          if (this.unicode) this.error('invalid character class');
          // Annex B: treat '-' literally then the predefined set.
          pieces.push({ kind: 'range', from: atom.cp, to: 0x2d });
          pieces.push(right.piece);
          continue;
        }
        const left = atom.cp;
        if (left > right.cp) this.error('range out of order in character class');
        pieces.push({ kind: 'range', from: left, to: right.cp });
      } else {
        pieces.push({ kind: 'range', from: atom.cp, to: atom.cp });
      }
    }
    return { kind: 'class', pieces, negated };
  }

  parseClassAtom(): { kind: 'char'; cp: number } | { kind: 'predefined'; piece: ClassPiece } {
    const ch = this.peek();
    if (ch === '\\') {
      this.pos++;
      const e = this.peek();
      switch (e) {
        case 'd':
          this.pos++;
          return { kind: 'predefined', piece: { kind: 'digits', neg: false } };
        case 'D':
          this.pos++;
          return { kind: 'predefined', piece: { kind: 'digits', neg: true } };
        case 'w':
          this.pos++;
          return { kind: 'predefined', piece: { kind: 'word', neg: false } };
        case 'W':
          this.pos++;
          return { kind: 'predefined', piece: { kind: 'word', neg: true } };
        case 's':
          this.pos++;
          return { kind: 'predefined', piece: { kind: 'space', neg: false } };
        case 'S':
          this.pos++;
          return { kind: 'predefined', piece: { kind: 'space', neg: true } };
        case 'b':
          this.pos++;
          return { kind: 'char', cp: 0x08 };
        case '-':
          this.pos++;
          return { kind: 'char', cp: 0x2d };
        default:
          return { kind: 'char', cp: this.parseCharacterEscape(e) };
      }
    }
    return { kind: 'char', cp: this.readChar() };
  }
}

export function parsePattern(pattern: string, flagsInput: string | undefined): ParsedPattern {
  const flagInfo = parseFlags(flagsInput);
  const parser = new Parser(pattern, flagInfo.unicode);
  const ast = parser.parse();
  for (const ref of collectBackrefs(ast)) {
    if (typeof ref === 'number') {
      if (ref > parser.groupCount) syntaxError(`Invalid regular expression: /${pattern}/: invalid backreference`);
    } else if (!parser.groupNames.has(ref)) {
      syntaxError(`Invalid regular expression: /${pattern}/: invalid named reference`);
    }
  }
  return {
    ast,
    groupCount: parser.groupCount,
    groupNames: parser.groupNames,
    hasNamedGroups: parser.groupNames.size > 0,
    hasBackrefs: parser.hasBackrefs,
    hasLookahead: parser.hasLookahead,
    unicode: flagInfo.unicode,
    ignoreCase: flagInfo.ignoreCase,
    multiline: flagInfo.multiline,
    dotAll: flagInfo.dotAll,
    global: flagInfo.global,
    sticky: flagInfo.sticky,
    flags: flagInfo.flags,
  };
}

function collectBackrefs(node: Node, out: (number | string)[] = []): (number | string)[] {
  switch (node.kind) {
    case 'backref':
      out.push(node.ref);
      break;
    case 'concat':
      for (const item of node.items) collectBackrefs(item, out);
      break;
    case 'alt':
      for (const b of node.branches) collectBackrefs(b, out);
      break;
    case 'group':
      collectBackrefs(node.body, out);
      break;
    case 'lookahead':
      collectBackrefs(node.body, out);
      break;
    case 'repeat':
      collectBackrefs(node.body, out);
      break;
    default:
      break;
  }
  return out;
}
