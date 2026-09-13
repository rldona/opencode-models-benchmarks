export type TokType =
  | 'ident'
  | 'number'
  | 'string'
  | 'comma'
  | 'semi'
  | 'lparen'
  | 'rparen'
  | 'dot'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'percent'
  | 'pipepipe'
  | 'eq'
  | 'eqeq'
  | 'ne'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge';

export interface Tok {
  type: TokType;
  text: string; // raw text
  start: number;
  end: number; // exclusive
  // for number:
  numVal?: number;
  numIsReal?: boolean;
  // for string literal:
  strVal?: string;
  // for ident (including quoted):
  identVal?: string; // unescaped, without quotes for quoted idents
  quoted?: boolean;
}

export function tokenize(sql: string): Tok[] {
  const toks: Tok[] = [];
  const n = sql.length;
  let i = 0;
  const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isAlpha = (c: string) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_' || c >= '\x80';

  while (i < n) {
    const ch = sql[i];
    if (isSpace(ch)) {
      i++;
      continue;
    }
    // line comment --
    if (ch === '-' && i + 1 < n && sql[i + 1] === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    // block comment /* */
    if (ch === '/' && i + 1 < n && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) throw new Error('syntax error: unterminated comment');
      i = end + 2;
      continue;
    }
    // string literal '...'
    if (ch === "'") {
      const start = i;
      i++;
      let out = '';
      let closed = false;
      while (i < n) {
        if (sql[i] === "'") {
          if (i + 1 < n && sql[i + 1] === "'") {
            out += "'";
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else {
          out += sql[i];
          i++;
        }
      }
      if (!closed) throw new Error('syntax error: unterminated string literal');
      toks.push({ type: 'string', text: sql.slice(start, i), start, end: i, strVal: out });
      continue;
    }
    // quoted identifier "..."
    if (ch === '"') {
      const start = i;
      i++;
      let out = '';
      let closed = false;
      while (i < n) {
        if (sql[i] === '"') {
          if (i + 1 < n && sql[i + 1] === '"') {
            out += '"';
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else {
          out += sql[i];
          i++;
        }
      }
      if (!closed) throw new Error('syntax error: unterminated quoted identifier');
      toks.push({ type: 'ident', text: sql.slice(start, i), start, end: i, identVal: out, quoted: true });
      continue;
    }
    // backtick / brackets? SQLite supports `...` and [...] — support for robustness
    if (ch === '`') {
      const start = i;
      i++;
      let out = '';
      let closed = false;
      while (i < n) {
        if (sql[i] === '`') {
          if (i + 1 < n && sql[i + 1] === '`') {
            out += '`';
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else {
          out += sql[i];
          i++;
        }
      }
      if (!closed) throw new Error('syntax error: unterminated quoted identifier');
      toks.push({ type: 'ident', text: sql.slice(start, i), start, end: i, identVal: out, quoted: true });
      continue;
    }
    if (ch === '[') {
      const start = i;
      const endIdx = sql.indexOf(']', i + 1);
      if (endIdx === -1) throw new Error('syntax error: unterminated bracket identifier');
      const out = sql.slice(i + 1, endIdx);
      i = endIdx + 1;
      toks.push({ type: 'ident', text: sql.slice(start, i), start, end: i, identVal: out, quoted: true });
      continue;
    }
    // number
    if (isDigit(ch) || (ch === '.' && i + 1 < n && isDigit(sql[i + 1]))) {
      const start = i;
      let j = i;
      // integer part
      while (j < n && isDigit(sql[j])) j++;
      let isReal = false;
      // fractional
      if (j < n && sql[j] === '.') {
        // check: '.' followed? For "1." it's real. For "1.5" real.
        // But need to avoid consuming "t.5"? numbers start with digit or .digit, so "1." is number.
        isReal = true;
        j++;
        while (j < n && isDigit(sql[j])) j++;
      }
      // exponent
      if (j < n && (sql[j] === 'e' || sql[j] === 'E')) {
        let k = j + 1;
        if (k < n && (sql[k] === '+' || sql[k] === '-')) k++;
        if (k < n && isDigit(sql[k])) {
          isReal = true;
          k++;
          while (k < n && isDigit(sql[k])) k++;
          j = k;
        }
        // else: 'e' not part of number (e.g., "1e" -> "1" + ident "e"? SQLite? Rare. Leave e out.)
      }
      const text = sql.slice(start, j);
      const numVal = Number(text);
      if (!Number.isFinite(numVal) && text.toLowerCase() !== 'infinity') {
        // Number() of very large? Still finite? Infinity possible for huge. Keep.
      }
      if (Number.isNaN(numVal)) throw new Error('syntax error: bad number ' + text);
      toks.push({ type: 'number', text, start, end: j, numVal, numIsReal: isReal });
      i = j;
      continue;
    }
    // identifier / keyword
    if (isAlpha(ch)) {
      const start = i;
      let j = i + 1;
      while (j < n && (isAlpha(sql[j]) || isDigit(sql[j]) || sql[j] === '$')) j++;
      const text = sql.slice(start, j);
      toks.push({ type: 'ident', text, start, end: j, identVal: text, quoted: false });
      i = j;
      continue;
    }
    // operators / punctuation
    const start = i;
    if (ch === ',') {
      toks.push({ type: 'comma', text: ',', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === ';') {
      toks.push({ type: 'semi', text: ';', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '(') {
      toks.push({ type: 'lparen', text: '(', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === ')') {
      toks.push({ type: 'rparen', text: ')', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '.') {
      toks.push({ type: 'dot', text: '.', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '+') {
      toks.push({ type: 'plus', text: '+', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '-') {
      toks.push({ type: 'minus', text: '-', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '*') {
      toks.push({ type: 'star', text: '*', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '/') {
      toks.push({ type: 'slash', text: '/', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '%') {
      toks.push({ type: 'percent', text: '%', start, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '|') {
      if (i + 1 < n && sql[i + 1] === '|') {
        toks.push({ type: 'pipepipe', text: '||', start, end: i + 2 });
        i += 2;
        continue;
      }
      throw new Error('syntax error: unexpected character |');
    }
    if (ch === '=') {
      if (i + 1 < n && sql[i + 1] === '=') {
        toks.push({ type: 'eqeq', text: '==', start, end: i + 2 });
        i += 2;
      } else {
        toks.push({ type: 'eq', text: '=', start, end: i + 1 });
        i++;
      }
      continue;
    }
    if (ch === '!') {
      if (i + 1 < n && sql[i + 1] === '=') {
        toks.push({ type: 'ne', text: '!=', start, end: i + 2 });
        i += 2;
        continue;
      }
      throw new Error('syntax error: unexpected character !');
    }
    if (ch === '<') {
      if (i + 1 < n && sql[i + 1] === '=') {
        toks.push({ type: 'le', text: '<=', start, end: i + 2 });
        i += 2;
      } else if (i + 1 < n && sql[i + 1] === '>') {
        toks.push({ type: 'ne', text: '<>', start, end: i + 2 });
        i += 2;
      } else {
        toks.push({ type: 'lt', text: '<', start, end: i + 1 });
        i++;
      }
      continue;
    }
    if (ch === '>') {
      if (i + 1 < n && sql[i + 1] === '=') {
        toks.push({ type: 'ge', text: '>=', start, end: i + 2 });
        i += 2;
      } else {
        toks.push({ type: 'gt', text: '>', start, end: i + 1 });
        i++;
      }
      continue;
    }
    throw new Error('syntax error: unexpected character ' + JSON.stringify(ch));
  }
  return toks;
}
