import { SqlError } from './types';

export type TokenKind = 'ident' | 'qident' | 'string' | 'number' | 'op' | 'eof';

export interface Token {
  kind: TokenKind;
  text: string;
  value?: string | number;
  isReal?: boolean;
  start: number;
  end: number;
}

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') {
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      if (i >= n) throw new SqlError('unterminated comment');
      i += 2;
      continue;
    }
    if (c === "'") {
      const start = i;
      i++;
      let out = '';
      for (;;) {
        if (i >= n) throw new SqlError('unterminated string literal');
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        out += sql[i];
        i++;
      }
      tokens.push({ kind: 'string', text: out, value: out, start, end: i });
      continue;
    }
    if (c === '"') {
      const start = i;
      i++;
      let out = '';
      for (;;) {
        if (i >= n) throw new SqlError('unterminated quoted identifier');
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            out += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        out += sql[i];
        i++;
      }
      tokens.push({ kind: 'qident', text: out, start, end: i });
      continue;
    }
    if (c >= '0' && c <= '9') {
      const raw = /^\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/.exec(sql.slice(i))![0];
      const val = Number(raw);
      if (!Number.isFinite(val)) throw new SqlError(`invalid number: ${raw}`);
      tokens.push({
        kind: 'number',
        text: raw,
        value: val,
        isReal: /[.eE]/.test(raw),
        start: i,
        end: i + raw.length,
      });
      i += raw.length;
      continue;
    }
    if (c === '.') {
      const m = /^\.\d+(?:[eE][+-]?\d+)?/.exec(sql.slice(i));
      if (m) {
        const raw = m[0];
        tokens.push({
          kind: 'number',
          text: raw,
          value: Number(raw),
          isReal: true,
          start: i,
          end: i + raw.length,
        });
        i += raw.length;
        continue;
      }
    }
    const id = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i));
    if (id) {
      const raw = id[0];
      tokens.push({ kind: 'ident', text: raw, start: i, end: i + raw.length });
      i += raw.length;
      continue;
    }
    const two = sql.slice(i, i + 2);
    if (
      two === '||' ||
      two === '<=' ||
      two === '>=' ||
      two === '<>' ||
      two === '!=' ||
      two === '=='
    ) {
      tokens.push({ kind: 'op', text: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if ('=<>+-*/%(),.;'.includes(c)) {
      tokens.push({ kind: 'op', text: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    throw new SqlError(`unrecognized token: "${c}"`);
  }
  tokens.push({ kind: 'eof', text: '', start: n, end: n });
  return tokens;
}
