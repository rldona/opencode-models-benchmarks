import { SqlReal, type SqlValue } from "./values.js";

export type TokenKind = "ident" | "keyword" | "number" | "string" | "punct" | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
  literal?: SqlValue;
}

export const KEYWORDS = new Set([
  "SELECT",
  "DISTINCT",
  "ALL",
  "FROM",
  "WHERE",
  "GROUP",
  "BY",
  "HAVING",
  "ORDER",
  "LIMIT",
  "OFFSET",
  "AS",
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "FULL",
  "CROSS",
  "NATURAL",
  "OUTER",
  "ON",
  "USING",
  "AND",
  "OR",
  "NOT",
  "IS",
  "ISNULL",
  "NOTNULL",
  "NULL",
  "BETWEEN",
  "IN",
  "LIKE",
  "GLOB",
  "ESCAPE",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "ASC",
  "DESC",
  "COLLATE",
  "TRUE",
  "FALSE",
  "UNION",
  "INTERSECT",
  "EXCEPT",
  "WITH",
]);

const PUNCTUATORS = [
  "||",
  "<>",
  "<=",
  ">=",
  "==",
  "!=",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "(",
  ")",
  ",",
  ".",
  ";",
];

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isIdentStart(c: string): boolean {
  return /[A-Za-z_\u0080-\uffff]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_$\u0080-\uffff]/.test(c);
}

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v") {
      i++;
      continue;
    }

    if (c === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }

    if (c === "/" && sql[i + 1] === "*") {
      const start = i;
      i += 2;
      let closed = false;
      while (i < n) {
        if (sql[i] === "*" && sql[i + 1] === "/") {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw new Error(`syntax error: unterminated comment at ${start}`);
      continue;
    }

    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      const start = i;
      i++;
      let value = "";
      let closed = false;
      while (i < n) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            value += quote;
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        value += sql[i];
        i++;
      }
      if (!closed) throw new Error(`syntax error: unterminated literal at ${start}`);
      tokens.push(
        quote === "'"
          ? { kind: "string", value, start, end: i }
          : { kind: "ident", value, start, end: i },
      );
      continue;
    }

    if (c === "[") {
      const start = i;
      i++;
      let value = "";
      let closed = false;
      while (i < n) {
        if (sql[i] === "]") {
          i++;
          closed = true;
          break;
        }
        value += sql[i];
        i++;
      }
      if (!closed) throw new Error(`syntax error: unterminated identifier at ${start}`);
      tokens.push({ kind: "ident", value, start, end: i });
      continue;
    }

    if (isDigit(c) || (c === "." && isDigit(sql[i + 1] ?? ""))) {
      const start = i;
      let text = "";
      let isReal = false;
      if (c === "0" && (sql[i + 1] === "x" || sql[i + 1] === "X")) {
        text = sql.slice(i, i + 2);
        i += 2;
        while (i < n && /[0-9a-fA-F]/.test(sql[i])) {
          text += sql[i];
          i++;
        }
        tokens.push({
          kind: "number",
          value: text,
          start,
          end: i,
          literal: Number(text),
        });
        continue;
      }
      while (i < n && isDigit(sql[i])) {
        text += sql[i];
        i++;
      }
      if (sql[i] === ".") {
        isReal = true;
        text += ".";
        i++;
        while (i < n && isDigit(sql[i])) {
          text += sql[i];
          i++;
        }
      }
      if (sql[i] === "e" || sql[i] === "E") {
        let j = i + 1;
        if (sql[j] === "+" || sql[j] === "-") j++;
        if (isDigit(sql[j] ?? "")) {
          isReal = true;
          text += sql.slice(i, j + 1);
          i = j + 1;
          while (i < n && isDigit(sql[i])) {
            text += sql[i];
            i++;
          }
        }
      }
      const num = Number(text);
      tokens.push({
        kind: "number",
        value: text,
        start,
        end: i,
        literal: isReal ? new SqlReal(num) : num,
      });
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(sql[i])) i++;
      const value = sql.slice(start, i);
      const upper = value.toUpperCase();
      tokens.push(
        KEYWORDS.has(upper)
          ? { kind: "keyword", value: upper, start, end: i }
          : { kind: "ident", value, start, end: i },
      );
      continue;
    }

    const punct = PUNCTUATORS.find((p) => sql.startsWith(p, i));
    if (punct) {
      tokens.push({ kind: "punct", value: punct, start: i, end: i + punct.length });
      i += punct.length;
      continue;
    }

    throw new Error(`syntax error: unexpected character "${c}" at ${i}`);
  }

  tokens.push({ kind: "eof", value: "", start: n, end: n });
  return tokens;
}
