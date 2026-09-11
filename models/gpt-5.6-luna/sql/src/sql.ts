export type SqlValue = number | string | null;

export interface SqlTable {
  columns: string[];
  rows: SqlValue[][];
}

export type SqlTables = Record<string, SqlTable>;

export interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
}

type TokenKind =
  | "word"
  | "quoted"
  | "number"
  | "string"
  | "operator"
  | "punctuation"
  | "eof";

interface Token {
  kind: TokenKind;
  text: string;
  position: number;
}

interface LiteralExpr {
  kind: "literal";
  value: RuntimeValue;
}

interface ColumnExpr {
  kind: "column";
  table?: string;
  name: string;
}

interface UnaryExpr {
  kind: "unary";
  op: "-" | "+" | "NOT";
  operand: Expr;
}

interface BinaryExpr {
  kind: "binary";
  op:
    | "+"
    | "-"
    | "*"
    | "/"
    | "%"
    | "||"
    | "="
    | "=="
    | "!="
    | "<>"
    | "<"
    | "<="
    | ">"
    | ">="
    | "AND"
    | "OR";
  left: Expr;
  right: Expr;
}

interface IsNullExpr {
  kind: "is-null";
  operand: Expr;
  not: boolean;
}

interface BetweenExpr {
  kind: "between";
  operand: Expr;
  lower: Expr;
  upper: Expr;
  not: boolean;
}

interface InExpr {
  kind: "in";
  operand: Expr;
  values: Expr[];
  not: boolean;
}

interface LikeExpr {
  kind: "like";
  operand: Expr;
  pattern: Expr;
  not: boolean;
}

interface CaseExpr {
  kind: "case";
  base?: Expr;
  arms: Array<{ when: Expr; then: Expr }>;
  otherwise?: Expr;
}

interface FunctionExpr {
  kind: "function";
  name: string;
  args: Expr[];
  distinct: boolean;
  star: boolean;
}

type Expr =
  | LiteralExpr
  | ColumnExpr
  | UnaryExpr
  | BinaryExpr
  | IsNullExpr
  | BetweenExpr
  | InExpr
  | LikeExpr
  | CaseExpr
  | FunctionExpr;

interface SelectItem {
  kind: "star" | "expression";
  qualifier?: string;
  expr?: Expr;
  alias?: string;
}

interface TableRef {
  name: string;
  alias?: string;
}

interface FromStep {
  kind: "cross" | "inner" | "left";
  table: TableRef;
  on?: Expr;
}

interface FromClause {
  base: TableRef;
  steps: FromStep[];
}

interface OrderItem {
  expr: Expr;
  descending: boolean;
}

interface QueryAst {
  distinct: boolean;
  select: SelectItem[];
  from?: FromClause;
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: OrderItem[];
  limit?: Expr;
  offset?: Expr;
}

interface RealValue {
  type: "real";
  value: number;
}

type RuntimeValue = number | string | null | RealValue;

const AGGREGATE_FUNCTIONS = new Set(["count", "sum", "avg", "min", "max"]);
const RESERVED_ALIAS_WORDS = new Set([
  "where",
  "group",
  "having",
  "order",
  "limit",
  "offset",
  "join",
  "inner",
  "left",
  "outer",
  "on",
  "and",
  "or",
  "not",
  "is",
  "in",
  "like",
  "between",
  "asc",
  "desc",
  "when",
  "then",
  "else",
  "end",
  "from",
  "select",
  "distinct",
  "as",
]);
const RESERVED_PRIMARY_WORDS = new Set([
  ...RESERVED_ALIAS_WORDS,
  "null",
  "by",
  "offset",
]);

function foldIdentifier(value: string): string {
  return value.toLowerCase();
}

function sqlError(message: string): never {
  throw new Error(`SQL error: ${message}`);
}

function isAsciiLetter(value: string): boolean {
  return /^[A-Za-z]$/.test(value);
}

function isIdentifierStart(value: string): boolean {
  return isAsciiLetter(value) || value === "_";
}

function isIdentifierPart(value: string): boolean {
  return isIdentifierStart(value) || /^[0-9$]$/.test(value);
}

function lex(sql: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  const add = (kind: TokenKind, text: string, position: number) => {
    tokens.push({ kind, text, position });
  };

  while (index < sql.length) {
    const current = sql[index];

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }

    if (current === "-" && sql[index + 1] === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }

    if (current === "/" && sql[index + 1] === "*") {
      const start = index;
      index += 2;
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) {
        index += 1;
      }
      if (index >= sql.length) sqlError(`unterminated comment at ${start}`);
      index += 2;
      continue;
    }

    if (current === "'") {
      const start = index;
      let value = "";
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] !== "'") {
          value += sql[index];
          index += 1;
          continue;
        }
        if (sql[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      if (!closed) sqlError(`unterminated string at ${start}`);
      add("string", value, start);
      continue;
    }

    if (current === '"') {
      const start = index;
      let value = "";
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] !== '"') {
          value += sql[index];
          index += 1;
          continue;
        }
        if (sql[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      if (!closed) sqlError(`unterminated identifier at ${start}`);
      add("quoted", value, start);
      continue;
    }

    if (isIdentifierStart(current)) {
      const start = index;
      index += 1;
      while (index < sql.length && isIdentifierPart(sql[index])) index += 1;
      add("word", sql.slice(start, index), start);
      continue;
    }

    if (/\d/.test(current) || (current === "." && /\d/.test(sql[index + 1] ?? ""))) {
      const start = index;
      if (current === ".") {
        index += 1;
        while (index < sql.length && /\d/.test(sql[index])) index += 1;
      } else {
        while (index < sql.length && /\d/.test(sql[index])) index += 1;
        if (sql[index] === ".") {
          index += 1;
          while (index < sql.length && /\d/.test(sql[index])) index += 1;
        }
      }
      if (sql[index] === "e" || sql[index] === "E") {
        const exponentStart = index;
        index += 1;
        if (sql[index] === "+" || sql[index] === "-") index += 1;
        const digitStart = index;
        while (index < sql.length && /\d/.test(sql[index])) index += 1;
        if (digitStart === index) index = exponentStart;
      }
      add("number", sql.slice(start, index), start);
      continue;
    }

    const twoCharacter = sql.slice(index, index + 2);
    if (["<=", ">=", "<>", "!=", "||", "=="].includes(twoCharacter)) {
      add("operator", twoCharacter, index);
      index += 2;
      continue;
    }

    if (["+", "-", "*", "/", "%", "=", "<", ">"].includes(current)) {
      add("operator", current, index);
      index += 1;
      continue;
    }

    if (["(", ")", ",", ".", ";"].includes(current)) {
      add("punctuation", current, index);
      index += 1;
      continue;
    }

    sqlError(`unexpected character '${current}' at ${index}`);
  }

  tokens.push({ kind: "eof", text: "", position: sql.length });
  return tokens;
}

function isRealValue(value: RuntimeValue): value is RealValue {
  return typeof value === "object" && value !== null && value.type === "real";
}

function makeReal(value: number): RealValue {
  return { type: "real", value: Object.is(value, -0) ? 0 : value };
}

function makeNumber(value: number, real: boolean): RuntimeValue {
  return real ? makeReal(value) : Object.is(value, -0) ? 0 : Math.trunc(value);
}

function runtimeFromInput(value: SqlValue): RuntimeValue {
  if (value === null || typeof value === "string") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    sqlError("table values must be finite numbers, text, or NULL");
  }
  return Number.isInteger(value) ? (Object.is(value, -0) ? 0 : value) : makeReal(value);
}

function externalValue(value: RuntimeValue): SqlValue {
  return isRealValue(value) ? value.value : value;
}

interface NumericValue {
  value: number;
  real: boolean;
}

function numericFromText(value: string): NumericValue {
  const match = value.match(
    /^[\t\n\r\f ]*[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/,
  );
  if (!match) return { value: 0, real: false };
  const text = match[0].trim();
  const number = Number(text);
  if (!Number.isFinite(number)) return { value: 0, real: false };
  return { value: number, real: /[.eE]/.test(text) };
}

function numericValue(value: RuntimeValue): NumericValue | null {
  if (typeof value === "number") return { value, real: false };
  if (isRealValue(value)) return { value: value.value, real: true };
  if (typeof value === "string") return numericFromText(value);
  return null;
}

function textValue(value: RuntimeValue): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  const number = isRealValue(value) ? value.value : value;
  if (Object.is(number, -0)) return "0";
  let result = String(number);
  if (isRealValue(value) && Number.isInteger(number) && !/[eE]/.test(result)) {
    result += ".0";
  }
  return result;
}

const textEncoder = new TextEncoder();

function compareText(left: string, right: string): number {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) {
      return leftBytes[index] < rightBytes[index] ? -1 : 1;
    }
  }
  if (leftBytes.length === rightBytes.length) return 0;
  return leftBytes.length < rightBytes.length ? -1 : 1;
}

function compareValues(left: RuntimeValue, right: RuntimeValue): number | null {
  if (left === null || right === null) return null;

  const leftNumeric = numericValue(left);
  const rightNumeric = numericValue(right);
  const leftIsNumber = typeof left === "number" || isRealValue(left);
  const rightIsNumber = typeof right === "number" || isRealValue(right);

  if (leftIsNumber && rightIsNumber) {
    if (leftNumeric!.value === rightNumeric!.value) return 0;
    return leftNumeric!.value < rightNumeric!.value ? -1 : 1;
  }

  if (typeof left === "string" && typeof right === "string") {
    return compareText(left, right);
  }

  if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
  return compareText(String(left), String(right));
}

function valueKey(value: RuntimeValue): string {
  if (value === null) return "n";
  if (typeof value === "string") return `s${value.length}:${value}`;
  const number = isRealValue(value) ? value.value : value;
  return `v:${Object.is(number, -0) ? 0 : number}`;
}

function distinctKey(values: RuntimeValue[]): string {
  return values
    .map(valueKey)
    .map((value) => `${value.length}:${value}`)
    .join("");
}

function truthy(value: RuntimeValue): boolean {
  if (value === null) return false;
  const numeric = numericValue(value)!;
  return numeric.value !== 0 && !Number.isNaN(numeric.value);
}

function booleanValue(value: boolean): RuntimeValue {
  return value ? 1 : 0;
}

function logicalAnd(left: RuntimeValue, right: RuntimeValue): RuntimeValue {
  if (left !== null && !truthy(left)) return 0;
  if (right !== null && !truthy(right)) return 0;
  if (left === null || right === null) return null;
  return 1;
}

function logicalOr(left: RuntimeValue, right: RuntimeValue): RuntimeValue {
  if (left !== null && truthy(left)) return 1;
  if (right !== null && truthy(right)) return 1;
  if (left === null || right === null) return null;
  return 0;
}

function logicalNot(value: RuntimeValue): RuntimeValue {
  return value === null ? null : booleanValue(!truthy(value));
}

function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function asciiUpper(value: string): string {
  return value.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

function likeMatches(text: string, pattern: string): boolean {
  const textCharacters = Array.from(text);
  const patternCharacters = Array.from(pattern);
  let positions = new Set<number>([0]);

  for (const character of patternCharacters) {
    if (character === "%") {
      const expanded = new Set<number>();
      for (const position of positions) {
        for (let next = position; next <= textCharacters.length; next += 1) {
          expanded.add(next);
        }
      }
      positions = expanded;
      continue;
    }

    const nextPositions = new Set<number>();
    for (const position of positions) {
      if (
        position < textCharacters.length &&
        (character === "_" || asciiLower(character) === asciiLower(textCharacters[position]))
      ) {
        nextPositions.add(position + 1);
      }
    }
    positions = nextPositions;
  }

  return positions.has(textCharacters.length);
}

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): QueryAst {
    this.expectWord("SELECT");
    const distinct = this.consumeWord("DISTINCT");
    const select = this.parseSelectList();

    let from: FromClause | undefined;
    if (this.consumeWord("FROM")) from = this.parseFrom();

    const where = this.consumeWord("WHERE") ? this.parseExpression() : undefined;
    const groupBy = this.parseExpressionListAfter("GROUP", "BY");
    const having = this.consumeWord("HAVING") ? this.parseExpression() : undefined;
    const orderBy = this.parseOrderBy();

    let limit: Expr | undefined;
    let offset: Expr | undefined;
    if (this.consumeWord("LIMIT")) {
      limit = this.parseExpression();
      if (this.consumeWord("OFFSET")) offset = this.parseExpression();
    } else if (this.consumeWord("OFFSET")) {
      sqlError("OFFSET requires LIMIT");
    }

    if (this.consumeSymbol(";")) {
      if (!this.is("eof")) sqlError("only one SELECT statement is allowed");
    }
    if (!this.is("eof")) this.unexpected();

    return { distinct, select, from, where, groupBy, having, orderBy, limit, offset };
  }

  private parseSelectList(): SelectItem[] {
    const items: SelectItem[] = [];
    do {
      if (this.consumeSymbol("*")) {
        items.push({ kind: "star" });
      } else if (
        this.isIdentifierToken(this.current()) &&
        this.isSymbol(this.peek(1), ".") &&
        this.isSymbol(this.peek(2), "*")
      ) {
        const qualifier = this.parseIdentifier();
        this.expectSymbol(".");
        this.expectSymbol("*");
        items.push({ kind: "star", qualifier });
      } else {
        const expr = this.parseExpression();
        let alias: string | undefined;
        if (this.consumeWord("AS")) {
          alias = this.parseIdentifier();
        } else if (this.isAliasToken(this.current())) {
          alias = this.parseIdentifier();
        }
        items.push({ kind: "expression", expr, alias });
      }
      if (!this.consumeSymbol(",")) break;
    } while (true);

    if (items.length === 0) sqlError("SELECT needs at least one expression");
    return items;
  }

  private parseFrom(): FromClause {
    const base = this.parseTableRef();
    const steps: FromStep[] = [];

    while (true) {
      if (this.consumeSymbol(",")) {
        steps.push({ kind: "cross", table: this.parseTableRef() });
        continue;
      }

      let kind: "inner" | "left" | undefined;
      if (this.consumeWord("INNER")) {
        kind = "inner";
        this.expectWord("JOIN");
      } else if (this.consumeWord("LEFT")) {
        kind = "left";
        this.consumeWord("OUTER");
        this.expectWord("JOIN");
      } else if (this.consumeWord("JOIN")) {
        kind = "inner";
      }

      if (!kind) break;
      const table = this.parseTableRef();
      this.expectWord("ON");
      steps.push({ kind, table, on: this.parseExpression() });
    }

    return { base, steps };
  }

  private parseTableRef(): TableRef {
    const name = this.parseIdentifier();
    let alias: string | undefined;
    if (this.consumeWord("AS")) {
      alias = this.parseIdentifier();
    } else if (this.isAliasToken(this.current())) {
      alias = this.parseIdentifier();
    }
    return { name, alias };
  }

  private parseExpressionListAfter(first: string, second: string): Expr[] {
    if (!this.consumeWord(first)) return [];
    this.expectWord(second);
    const expressions = [this.parseExpression()];
    while (this.consumeSymbol(",")) expressions.push(this.parseExpression());
    return expressions;
  }

  private parseOrderBy(): OrderItem[] {
    if (!this.consumeWord("ORDER")) return [];
    this.expectWord("BY");
    const result: OrderItem[] = [];
    do {
      const expr = this.parseExpression();
      const descending = this.consumeWord("DESC");
      if (!descending) this.consumeWord("ASC");
      result.push({ expr, descending });
      if (!this.consumeSymbol(",")) break;
    } while (true);
    return result;
  }

  private parseExpression(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let expression = this.parseAnd();
    while (this.consumeWord("OR")) {
      expression = { kind: "binary", op: "OR", left: expression, right: this.parseAnd() };
    }
    return expression;
  }

  private parseAnd(): Expr {
    let expression = this.parseNot();
    while (this.consumeWord("AND")) {
      expression = { kind: "binary", op: "AND", left: expression, right: this.parseNot() };
    }
    return expression;
  }

  private parseNot(): Expr {
    if (this.consumeWord("NOT")) {
      return { kind: "unary", op: "NOT", operand: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const left = this.parseAdd();

    if (this.consumeWord("IS")) {
      const not = this.consumeWord("NOT");
      if (!this.consumeWord("NULL")) sqlError("IS only supports NULL in this engine");
      return { kind: "is-null", operand: left, not };
    }

    let not = false;
    if (this.consumeWord("NOT")) {
      not = true;
      if (
        !this.isWord(this.current(), "IN") &&
        !this.isWord(this.current(), "LIKE") &&
        !this.isWord(this.current(), "BETWEEN")
      ) {
        sqlError("NOT must be followed by IN, LIKE, or BETWEEN");
      }
    }

    if (this.consumeWord("IN")) {
      this.expectSymbol("(");
      const values: Expr[] = [];
      if (!this.consumeSymbol(")")) {
        do {
          values.push(this.parseExpression());
        } while (this.consumeSymbol(","));
        this.expectSymbol(")");
      }
      return { kind: "in", operand: left, values, not };
    }

    if (this.consumeWord("LIKE")) {
      return { kind: "like", operand: left, pattern: this.parseAdd(), not };
    }

    if (this.consumeWord("BETWEEN")) {
      const lower = this.parseNot();
      this.expectWord("AND");
      const upper = this.parseNot();
      return { kind: "between", operand: left, lower, upper, not };
    }

    if (not) sqlError("invalid comparison operator");

    const operator = this.current().text;
    if (["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(operator)) {
      this.index += 1;
      return { kind: "binary", op: operator as BinaryExpr["op"], left, right: this.parseAdd() };
    }
    return left;
  }

  private parseAdd(): Expr {
    let expression = this.parseMultiply();
    while (this.isSymbol(this.current(), "+") || this.isSymbol(this.current(), "-")) {
      const operator = this.current().text as "+" | "-";
      this.index += 1;
      expression = { kind: "binary", op: operator, left: expression, right: this.parseMultiply() };
    }
    return expression;
  }

  private parseMultiply(): Expr {
    let expression = this.parseConcat();
    while (
      this.isSymbol(this.current(), "*") ||
      this.isSymbol(this.current(), "/") ||
      this.isSymbol(this.current(), "%")
    ) {
      const operator = this.current().text as "*" | "/" | "%";
      this.index += 1;
      expression = { kind: "binary", op: operator, left: expression, right: this.parseConcat() };
    }
    return expression;
  }

  private parseConcat(): Expr {
    let expression = this.parseUnary();
    while (this.isSymbol(this.current(), "||")) {
      this.index += 1;
      expression = { kind: "binary", op: "||", left: expression, right: this.parseUnary() };
    }
    return expression;
  }

  private parseUnary(): Expr {
    if (this.isSymbol(this.current(), "-") || this.isSymbol(this.current(), "+")) {
      const op = this.current().text as "-" | "+";
      this.index += 1;
      return { kind: "unary", op, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.current();

    if (token.kind === "number") {
      this.index += 1;
      const number = Number(token.text);
      const real = /[.eE]/.test(token.text);
      return { kind: "literal", value: makeNumber(number, real) };
    }

    if (token.kind === "string") {
      this.index += 1;
      return { kind: "literal", value: token.text };
    }

    if (this.consumeWord("NULL")) return { kind: "literal", value: null };

    if (this.consumeSymbol("(")) {
      const expression = this.parseExpression();
      this.expectSymbol(")");
      return expression;
    }

    if (this.consumeWord("CASE")) return this.parseCase();

    if (this.isIdentifierToken(token)) {
      if (token.kind === "word" && RESERVED_PRIMARY_WORDS.has(foldIdentifier(token.text))) {
        this.unexpected();
      }
      const name = this.parseIdentifier();
      if (this.consumeSymbol("(")) return this.parseFunction(name);
      let table: string | undefined;
      if (this.consumeSymbol(".")) table = name;
      if (table) {
        const column = this.parseIdentifier();
        return { kind: "column", table, name: column };
      }
      return { kind: "column", name };
    }

    this.unexpected();
  }

  private parseFunction(name: string): Expr {
    const functionName = foldIdentifier(name);
    if (this.consumeSymbol("*")) {
      this.expectSymbol(")");
      return { kind: "function", name: functionName, args: [], distinct: false, star: true };
    }

    const distinct = this.consumeWord("DISTINCT");
    const args: Expr[] = [];
    if (!this.consumeSymbol(")")) {
      do {
        args.push(this.parseExpression());
      } while (this.consumeSymbol(","));
      this.expectSymbol(")");
    }
    return { kind: "function", name: functionName, args, distinct, star: false };
  }

  private parseCase(): Expr {
    let base: Expr | undefined;
    if (!this.isWord(this.current(), "WHEN")) base = this.parseExpression();

    const arms: Array<{ when: Expr; then: Expr }> = [];
    while (this.consumeWord("WHEN")) {
      const when = this.parseExpression();
      this.expectWord("THEN");
      const then = this.parseExpression();
      arms.push({ when, then });
    }
    if (arms.length === 0) sqlError("CASE needs a WHEN clause");

    let otherwise: Expr | undefined;
    if (this.consumeWord("ELSE")) otherwise = this.parseExpression();
    this.expectWord("END");
    return { kind: "case", base, arms, otherwise };
  }

  private parseIdentifier(): string {
    const token = this.current();
    if (!this.isIdentifierToken(token)) this.unexpected();
    this.index += 1;
    return token.text;
  }

  private isAliasToken(token: Token): boolean {
    return (
      this.isIdentifierToken(token) &&
      (token.kind === "quoted" || !RESERVED_ALIAS_WORDS.has(foldIdentifier(token.text)))
    );
  }

  private isIdentifierToken(token: Token): boolean {
    return token.kind === "word" || token.kind === "quoted";
  }

  private current(): Token {
    return this.tokens[this.index];
  }

  private peek(amount: number): Token {
    return this.tokens[this.index + amount] ?? this.tokens[this.tokens.length - 1];
  }

  private is(kind: TokenKind): boolean {
    return this.current().kind === kind;
  }

  private isSymbol(token: Token, symbol: string): boolean {
    return (token.kind === "operator" || token.kind === "punctuation") && token.text === symbol;
  }

  private isWord(token: Token, word: string): boolean {
    return token.kind === "word" && foldIdentifier(token.text) === foldIdentifier(word);
  }

  private consumeSymbol(symbol: string): boolean {
    if (!this.isSymbol(this.current(), symbol)) return false;
    this.index += 1;
    return true;
  }

  private consumeWord(word: string): boolean {
    if (!this.isWord(this.current(), word)) return false;
    this.index += 1;
    return true;
  }

  private expectSymbol(symbol: string): void {
    if (!this.consumeSymbol(symbol)) sqlError(`expected '${symbol}' at ${this.current().position}`);
  }

  private expectWord(word: string): void {
    if (!this.consumeWord(word)) sqlError(`expected ${word} at ${this.current().position}`);
  }

  private unexpected(): never {
    const token = this.current();
    sqlError(`unexpected '${token.text || "end of input"}' at ${token.position}`);
  }
}

function parseSql(sql: string): QueryAst {
  if (typeof sql !== "string") sqlError("query must be a string");
  return new Parser(lex(sql)).parse();
}

interface CompiledTable {
  name: string;
  columns: string[];
  columnIndices: Map<string, number>;
  rows: RuntimeValue[][];
  nullRow: RuntimeValue[];
}

interface SourceDescriptor {
  table: CompiledTable;
  qualifier: string;
  displayQualifier: string;
}

interface Binding {
  source: SourceDescriptor;
  values: RuntimeValue[];
}

interface RowContext {
  bindings: Binding[];
}

interface EvalScope {
  row: RowContext;
  group: RowContext[];
  sources: SourceDescriptor[];
}

function compileTables(tables: SqlTables): Map<string, CompiledTable> {
  if (!tables || typeof tables !== "object") sqlError("tables must be an object");
  const compiled = new Map<string, CompiledTable>();

  for (const [name, table] of Object.entries(tables)) {
    const foldedName = foldIdentifier(name);
    if (compiled.has(foldedName)) sqlError(`duplicate table '${name}'`);
    if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
      sqlError(`invalid definition for table '${name}'`);
    }

    const columnIndices = new Map<string, number>();
    for (let index = 0; index < table.columns.length; index += 1) {
      const column = table.columns[index];
      if (typeof column !== "string" || column.length === 0) {
        sqlError(`invalid column in table '${name}'`);
      }
      const foldedColumn = foldIdentifier(column);
      if (columnIndices.has(foldedColumn)) sqlError(`duplicate column '${column}' in table '${name}'`);
      columnIndices.set(foldedColumn, index);
    }

    const rows = table.rows.map((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== table.columns.length) {
        sqlError(`row ${rowIndex} in table '${name}' has the wrong number of columns`);
      }
      return row.map((value) => {
        if (value !== null && typeof value !== "string" && typeof value !== "number") {
          sqlError(`invalid value in table '${name}'`);
        }
        return runtimeFromInput(value);
      });
    });

    compiled.set(foldedName, {
      name,
      columns: [...table.columns],
      columnIndices,
      rows,
      nullRow: table.columns.map(() => null),
    });
  }
  return compiled;
}

function createSources(from: FromClause | undefined, tables: Map<string, CompiledTable>): SourceDescriptor[] {
  if (!from) return [];
  const refs = [from.base, ...from.steps.map((step) => step.table)];
  const sources: SourceDescriptor[] = [];

  for (const ref of refs) {
    const table = tables.get(foldIdentifier(ref.name));
    if (!table) sqlError(`no such table: ${ref.name}`);
    const qualifier = foldIdentifier(ref.alias ?? ref.name);
    if (sources.some((source) => source.qualifier === qualifier)) {
      sqlError(`ambiguous table alias: ${ref.alias ?? ref.name}`);
    }
    sources.push({ table, qualifier, displayQualifier: ref.alias ?? ref.name });
  }
  return sources;
}

function tableRows(source: SourceDescriptor): RowContext[] {
  return source.table.rows.map((values) => ({ bindings: [{ source, values }] }));
}

function mergeRows(left: RowContext, right: RowContext): RowContext {
  return { bindings: left.bindings.concat(right.bindings) };
}

function nullRow(source: SourceDescriptor): RowContext {
  return { bindings: [{ source, values: source.table.nullRow }] };
}

function sourceForQualifier(
  qualifier: string,
  sources: SourceDescriptor[],
): SourceDescriptor | undefined {
  const folded = foldIdentifier(qualifier);
  return sources.find((source) => source.qualifier === folded);
}

function columnIndex(source: SourceDescriptor, name: string): number {
  const index = source.table.columnIndices.get(foldIdentifier(name));
  if (index === undefined) sqlError(`no such column: ${name}`);
  return index;
}

interface ResolvedColumn {
  source: SourceDescriptor;
  index: number;
}

function resolveColumnReference(expression: ColumnExpr, sources: SourceDescriptor[]): ResolvedColumn {
  if (expression.table) {
    const source = sourceForQualifier(expression.table, sources);
    if (!source) sqlError(`no such table or alias: ${expression.table}`);
    return { source, index: columnIndex(source, expression.name) };
  }

  let result: ResolvedColumn | undefined;
  for (const source of sources) {
    const index = source.table.columnIndices.get(foldIdentifier(expression.name));
    if (index === undefined) continue;
    if (result) sqlError(`ambiguous column name: ${expression.name}`);
    result = { source, index };
  }
  if (!result) sqlError(`no such column: ${expression.name}`);
  return result;
}

function readColumn(expression: ColumnExpr, scope: EvalScope): RuntimeValue {
  const resolved = resolveColumnReference(expression, scope.sources);
  const binding = scope.row.bindings.find((candidate) => candidate.source === resolved.source);
  return binding ? binding.values[resolved.index] : null;
}

function validateFunction(expression: FunctionExpr, insideAggregate: boolean): void {
  const name = expression.name;
  const isAggregate = AGGREGATE_FUNCTIONS.has(name);
  const scalarArity: Record<string, [number, number]> = {
    abs: [1, 1],
    round: [1, 2],
    lower: [1, 1],
    upper: [1, 1],
    length: [1, 1],
    coalesce: [1, Number.POSITIVE_INFINITY],
    ifnull: [2, 2],
    nullif: [2, 2],
  };

  if (!isAggregate && !scalarArity[name]) sqlError(`no such function: ${name}`);
  if (isAggregate && insideAggregate) sqlError("misuse of aggregate function");
  if (expression.star && name !== "count") sqlError(`${name}() does not accept *`);
  if (expression.star && expression.distinct) sqlError("COUNT(DISTINCT *) is invalid");

  if (isAggregate) {
    if (!expression.star && expression.args.length !== 1) {
      sqlError(`${name}() requires one argument`);
    }
    if (expression.star && name !== "count") sqlError("only COUNT accepts *");
  } else {
    if (expression.distinct) sqlError(`DISTINCT is not supported for ${name}()`);
    const [minimum, maximum] = scalarArity[name];
    if (expression.args.length < minimum || expression.args.length > maximum) {
      sqlError(`wrong number of arguments to ${name}()`);
    }
  }

  for (const argument of expression.args) validateExpr(argument, insideAggregate || isAggregate);
}

function validateExpr(expression: Expr, insideAggregate = false): void {
  switch (expression.kind) {
    case "literal":
    case "column":
      return;
    case "unary":
      validateExpr(expression.operand, insideAggregate);
      return;
    case "binary":
      validateExpr(expression.left, insideAggregate);
      validateExpr(expression.right, insideAggregate);
      return;
    case "is-null":
      validateExpr(expression.operand, insideAggregate);
      return;
    case "between":
      validateExpr(expression.operand, insideAggregate);
      validateExpr(expression.lower, insideAggregate);
      validateExpr(expression.upper, insideAggregate);
      return;
    case "in":
      validateExpr(expression.operand, insideAggregate);
      for (const value of expression.values) validateExpr(value, insideAggregate);
      return;
    case "like":
      validateExpr(expression.operand, insideAggregate);
      validateExpr(expression.pattern, insideAggregate);
      return;
    case "case":
      if (expression.base) validateExpr(expression.base, insideAggregate);
      for (const arm of expression.arms) {
        validateExpr(arm.when, insideAggregate);
        validateExpr(arm.then, insideAggregate);
      }
      if (expression.otherwise) validateExpr(expression.otherwise, insideAggregate);
      return;
    case "function":
      validateFunction(expression, insideAggregate);
      return;
  }
}

function hasAggregate(expression: Expr): boolean {
  switch (expression.kind) {
    case "function":
      return AGGREGATE_FUNCTIONS.has(expression.name) || expression.args.some(hasAggregate);
    case "unary":
      return hasAggregate(expression.operand);
    case "binary":
      return hasAggregate(expression.left) || hasAggregate(expression.right);
    case "is-null":
      return hasAggregate(expression.operand);
    case "between":
      return (
        hasAggregate(expression.operand) ||
        hasAggregate(expression.lower) ||
        hasAggregate(expression.upper)
      );
    case "in":
      return hasAggregate(expression.operand) || expression.values.some(hasAggregate);
    case "like":
      return hasAggregate(expression.operand) || hasAggregate(expression.pattern);
    case "case":
      return (
        (expression.base ? hasAggregate(expression.base) : false) ||
        expression.arms.some((arm) => hasAggregate(arm.when) || hasAggregate(arm.then)) ||
        (expression.otherwise ? hasAggregate(expression.otherwise) : false)
      );
    case "literal":
    case "column":
      return false;
  }
}

function validateQuery(query: QueryAst): void {
  for (const item of query.select) if (item.expr) validateExpr(item.expr);
  for (const expression of query.groupBy) {
    validateExpr(expression);
    if (hasAggregate(expression)) sqlError("aggregate functions are not allowed in GROUP BY");
  }
  if (query.where) {
    validateExpr(query.where);
    if (hasAggregate(query.where)) sqlError("misuse of aggregate function in WHERE");
  }
  if (query.having) validateExpr(query.having);
  for (const item of query.orderBy) validateExpr(item.expr);
  if (query.limit) {
    validateExpr(query.limit);
    if (hasAggregate(query.limit)) sqlError("misuse of aggregate function in LIMIT");
  }
  if (query.offset) {
    validateExpr(query.offset);
    if (hasAggregate(query.offset)) sqlError("misuse of aggregate function in OFFSET");
  }
  if (query.from) {
    for (const step of query.from.steps) {
      if (step.on) {
        validateExpr(step.on);
        if (hasAggregate(step.on)) sqlError("misuse of aggregate function in JOIN");
      }
    }
  }
}

function evaluateAggregate(expression: FunctionExpr, scope: EvalScope): RuntimeValue {
  const rows = scope.group;
  if (expression.name === "count") {
    if (expression.star) return rows.length;
    const seen = new Set<string>();
    let count = 0;
    for (const row of rows) {
      const value = evaluate(expression.args[0], { row, group: [row], sources: scope.sources });
      if (value === null) continue;
      if (expression.distinct) {
        const key = valueKey(value);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      count += 1;
    }
    return count;
  }

  if (expression.name === "sum" || expression.name === "avg") {
    let total = 0;
    let count = 0;
    let real = false;
    for (const row of rows) {
      const value = evaluate(expression.args[0], { row, group: [row], sources: scope.sources });
      if (value === null) continue;
      const numeric = numericValue(value)!;
      total += numeric.value;
      real ||= numeric.real;
      count += 1;
    }
    if (count === 0) return null;
    if (expression.name === "avg") return makeReal(total / count);
    return makeNumber(total, real);
  }

  let result: RuntimeValue | null = null;
  for (const row of rows) {
    const value = evaluate(expression.args[0], { row, group: [row], sources: scope.sources });
    if (value === null) continue;
    if (result === null) {
      result = value;
      continue;
    }
    const comparison = compareValues(value, result)!;
    if ((expression.name === "min" && comparison < 0) || (expression.name === "max" && comparison > 0)) {
      result = value;
    }
  }
  return result;
}

function roundAwayFromZero(value: number, digits: number): number {
  const places = Math.max(0, Math.min(30, Math.trunc(digits)));
  const factor = 10 ** places;
  if (!Number.isFinite(factor) || !Number.isFinite(value * factor)) return value;
  const magnitude = Math.floor(Math.abs(value) * factor + 0.5) / factor;
  return value < 0 ? -magnitude : magnitude;
}

function evaluateFunction(expression: FunctionExpr, scope: EvalScope): RuntimeValue {
  if (AGGREGATE_FUNCTIONS.has(expression.name)) return evaluateAggregate(expression, scope);

  const argument = (index: number): RuntimeValue => evaluate(expression.args[index], scope);

  switch (expression.name) {
    case "abs": {
      const value = argument(0);
      if (value === null) return null;
      const numeric = numericValue(value)!;
      return makeNumber(Math.abs(numeric.value), numeric.real);
    }
    case "round": {
      const value = argument(0);
      if (value === null) return null;
      const numeric = numericValue(value)!;
      const digitsValue = expression.args.length === 2 ? argument(1) : 0;
      if (digitsValue === null) return null;
      const digits = numericValue(digitsValue)!.value;
      return makeReal(roundAwayFromZero(numeric.value, digits));
    }
    case "lower": {
      const value = argument(0);
      const text = textValue(value);
      return text === null ? null : asciiLower(text);
    }
    case "upper": {
      const value = argument(0);
      const text = textValue(value);
      return text === null ? null : asciiUpper(text);
    }
    case "length": {
      const value = argument(0);
      const text = textValue(value);
      return text === null ? null : Array.from(text).length;
    }
    case "coalesce":
      for (let index = 0; index < expression.args.length; index += 1) {
        const value = argument(index);
        if (value !== null) return value;
      }
      return null;
    case "ifnull": {
      const first = argument(0);
      return first === null ? argument(1) : first;
    }
    case "nullif": {
      const first = argument(0);
      const second = argument(1);
      return compareValues(first, second) === 0 ? null : first;
    }
    default:
      sqlError(`no such function: ${expression.name}`);
  }
}

function evaluate(expression: Expr, scope: EvalScope): RuntimeValue {
  switch (expression.kind) {
    case "literal":
      return expression.value;
    case "column":
      return readColumn(expression, scope);
    case "unary": {
      const value = evaluate(expression.operand, scope);
      if (expression.op === "NOT") return logicalNot(value);
      if (value === null) return null;
      const numeric = numericValue(value)!;
      return makeNumber(expression.op === "-" ? -numeric.value : numeric.value, numeric.real);
    }
    case "binary": {
      if (expression.op === "AND") {
        return logicalAnd(evaluate(expression.left, scope), evaluate(expression.right, scope));
      }
      if (expression.op === "OR") {
        return logicalOr(evaluate(expression.left, scope), evaluate(expression.right, scope));
      }

      const left = evaluate(expression.left, scope);
      const right = evaluate(expression.right, scope);

      if (expression.op === "||") {
        if (left === null || right === null) return null;
        return `${textValue(left)}${textValue(right)}`;
      }

      if (["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(expression.op)) {
        const comparison = compareValues(left, right);
        if (comparison === null) return null;
        switch (expression.op) {
          case "=":
          case "==":
            return booleanValue(comparison === 0);
          case "!=":
          case "<>":
            return booleanValue(comparison !== 0);
          case "<":
            return booleanValue(comparison < 0);
          case "<=":
            return booleanValue(comparison <= 0);
          case ">":
            return booleanValue(comparison > 0);
          case ">=":
            return booleanValue(comparison >= 0);
        }
      }

      if (left === null || right === null) return null;
      const leftNumeric = numericValue(left)!;
      const rightNumeric = numericValue(right)!;
      if (expression.op === "/") {
        if (rightNumeric.value === 0) return null;
        if (!leftNumeric.real && !rightNumeric.real) {
          return makeNumber(Math.trunc(leftNumeric.value / rightNumeric.value), false);
        }
        return makeReal(leftNumeric.value / rightNumeric.value);
      }
      if (expression.op === "%") {
        if (rightNumeric.value === 0) return null;
        return makeNumber(Math.trunc(leftNumeric.value) % Math.trunc(rightNumeric.value), false);
      }
      if (expression.op === "+") {
        return makeNumber(
          leftNumeric.value + rightNumeric.value,
          leftNumeric.real || rightNumeric.real,
        );
      }
      if (expression.op === "-") {
        return makeNumber(
          leftNumeric.value - rightNumeric.value,
          leftNumeric.real || rightNumeric.real,
        );
      }
      if (expression.op === "*") {
        return makeNumber(
          leftNumeric.value * rightNumeric.value,
          leftNumeric.real || rightNumeric.real,
        );
      }
      sqlError(`unsupported operator ${expression.op}`);
    }
    case "is-null": {
      const result = evaluate(expression.operand, scope) === null;
      return booleanValue(expression.not ? !result : result);
    }
    case "between": {
      const operand = evaluate(expression.operand, scope);
      const lower = evaluate(expression.lower, scope);
      const upper = evaluate(expression.upper, scope);
      const lowerResult = compareValues(operand, lower);
      const upperResult = compareValues(operand, upper);
      let result = logicalAnd(
        lowerResult === null ? null : booleanValue(lowerResult >= 0),
        upperResult === null ? null : booleanValue(upperResult <= 0),
      );
      if (expression.not) result = logicalNot(result);
      return result;
    }
    case "in": {
      if (expression.values.length === 0) return booleanValue(expression.not);
      const operand = evaluate(expression.operand, scope);
      if (operand === null) return null;
      let hasNull = false;
      for (const item of expression.values) {
        const comparison = compareValues(operand, evaluate(item, scope));
        if (comparison === 0) return booleanValue(!expression.not);
        if (comparison === null) hasNull = true;
      }
      if (hasNull) return null;
      return booleanValue(expression.not);
    }
    case "like": {
      const operand = evaluate(expression.operand, scope);
      const pattern = evaluate(expression.pattern, scope);
      const text = textValue(operand);
      const patternText = textValue(pattern);
      if (text === null || patternText === null) return null;
      const result = likeMatches(text, patternText);
      return booleanValue(expression.not ? !result : result);
    }
    case "case": {
      const base = expression.base ? evaluate(expression.base, scope) : undefined;
      for (const arm of expression.arms) {
        const condition = evaluate(arm.when, scope);
        const matches = expression.base
          ? compareValues(base!, condition) === 0
          : truthy(condition);
        if (matches) return evaluate(arm.then, scope);
      }
      return expression.otherwise ? evaluate(expression.otherwise, scope) : null;
    }
    case "function":
      return evaluateFunction(expression, scope);
  }
}

function findEquiJoin(
  expression: Expr,
  right: SourceDescriptor,
  left: SourceDescriptor[],
): { left: ColumnExpr; right: ColumnExpr } | undefined {
  if (expression.kind === "binary" && expression.op === "AND") {
    return findEquiJoin(expression.left, right, left) ?? findEquiJoin(expression.right, right, left);
  }
  if (expression.kind !== "binary" || !["=", "=="].includes(expression.op)) return undefined;
  if (expression.left.kind !== "column" || expression.right.kind !== "column") return undefined;

  const leftColumn = expression.left;
  const rightColumn = expression.right;
  const rightQualifier = right.qualifier;
  const leftQualifiers = new Set(left.map((source) => source.qualifier));

  if (leftColumn.table && foldIdentifier(leftColumn.table) === rightQualifier && rightColumn.table) {
    if (leftQualifiers.has(foldIdentifier(rightColumn.table))) {
      return { left: rightColumn, right: leftColumn };
    }
  }
  if (rightColumn.table && foldIdentifier(rightColumn.table) === rightQualifier && leftColumn.table) {
    if (leftQualifiers.has(foldIdentifier(leftColumn.table))) {
      return { left: leftColumn, right: rightColumn };
    }
  }
  return undefined;
}

function qualifiedValue(row: RowContext, expression: ColumnExpr): RuntimeValue {
  const qualifier = foldIdentifier(expression.table!);
  const binding = row.bindings.find((candidate) => candidate.source.qualifier === qualifier);
  if (!binding) sqlError(`no such table or alias: ${expression.table}`);
  return binding.values[columnIndex(binding.source, expression.name)];
}

function joinKey(value: RuntimeValue): string | null {
  return value === null ? null : valueKey(value);
}

function executeFrom(
  from: FromClause | undefined,
  sources: SourceDescriptor[],
): RowContext[] {
  if (!from) return [{ bindings: [] }];

  let rows = tableRows(sources[0]);
  let sourceIndex = 1;
  for (const step of from.steps) {
    const right = sources[sourceIndex];
    sourceIndex += 1;

    if (step.kind === "cross") {
      const rightRows = tableRows(right);
      const crossed: RowContext[] = [];
      for (const leftRow of rows) {
        for (const rightRow of rightRows) crossed.push(mergeRows(leftRow, rightRow));
      }
      rows = crossed;
      continue;
    }

    const rightRows = tableRows(right);
    const equiJoin = findEquiJoin(step.on!, right, sources.slice(0, sourceIndex - 1));
    const indexed = equiJoin ? new Map<string, RowContext[]>() : undefined;

    if (indexed && equiJoin) {
      for (const rightRow of rightRows) {
        const key = joinKey(qualifiedValue(rightRow, equiJoin.right));
        if (key === null) continue;
        const matching = indexed.get(key);
        if (matching) matching.push(rightRow);
        else indexed.set(key, [rightRow]);
      }
    }

    const joined: RowContext[] = [];
    for (const leftRow of rows) {
      const candidates = indexed
        ? (() => {
            const key = joinKey(qualifiedValue(leftRow, equiJoin!.left));
            return key === null ? [] : indexed.get(key) ?? [];
          })()
        : rightRows;
      let matched = false;
      for (const rightRow of candidates) {
        const merged = mergeRows(leftRow, rightRow);
        if (truthy(evaluate(step.on!, { row: merged, group: [merged], sources }))) {
          joined.push(merged);
          matched = true;
        }
      }
      if (step.kind === "left" && !matched) joined.push(mergeRows(leftRow, nullRow(right)));
    }
    rows = joined;
  }
  return rows;
}

interface OutputColumn {
  name: string;
  expression: Expr;
}

function resolveSourceForOutput(qualifier: string, sources: SourceDescriptor[]): SourceDescriptor {
  const source = sourceForQualifier(qualifier, sources);
  if (!source) sqlError(`no such table or alias: ${qualifier}`);
  return source;
}

function outputName(expression: Expr, sources: SourceDescriptor[]): string {
  if (expression.kind === "column") {
    const resolved = resolveColumnReference(expression, sources);
    return resolved.source.table.columns[resolved.index];
  }
  return expressionLabel(expression);
}

function expressionLabel(expression: Expr): string {
  switch (expression.kind) {
    case "literal":
      if (expression.value === null) return "NULL";
      if (typeof expression.value === "string") {
        return `'${expression.value.replace(/'/g, "''")}'`;
      }
      return textValue(expression.value)!;
    case "column":
      return expression.table ? `${expression.table}.${expression.name}` : expression.name;
    case "unary":
      return `${expression.op} ${expressionLabel(expression.operand)}`;
    case "binary":
      return `${expressionLabel(expression.left)} ${expression.op} ${expressionLabel(expression.right)}`;
    case "is-null":
      return `${expressionLabel(expression.operand)} IS${expression.not ? " NOT" : ""} NULL`;
    case "between":
      return `${expressionLabel(expression.operand)}${expression.not ? " NOT" : ""} BETWEEN ${expressionLabel(expression.lower)} AND ${expressionLabel(expression.upper)}`;
    case "in":
      return `${expressionLabel(expression.operand)}${expression.not ? " NOT" : ""} IN (${expression.values.map(expressionLabel).join(", ")})`;
    case "like":
      return `${expressionLabel(expression.operand)}${expression.not ? " NOT" : ""} LIKE ${expressionLabel(expression.pattern)}`;
    case "case":
      return "CASE";
    case "function":
      return `${expression.name.toUpperCase()}(${expression.star ? "*" : `${expression.distinct ? "DISTINCT " : ""}${expression.args.map(expressionLabel).join(", ")}`})`;
  }
}

function buildOutputColumns(query: QueryAst, sources: SourceDescriptor[]): OutputColumn[] {
  const columns: OutputColumn[] = [];
  for (const item of query.select) {
    if (item.kind === "star") {
      if (item.alias) sqlError("an alias cannot be applied to *");
      const selectedSources = item.qualifier
        ? [resolveSourceForOutput(item.qualifier, sources)]
        : sources;
      if (selectedSources.length === 0) sqlError("no tables available for *");
      for (const source of selectedSources) {
        for (const column of source.table.columns) {
          columns.push({
            name: column,
            expression: { kind: "column", table: source.displayQualifier, name: column },
          });
        }
      }
      continue;
    }

    const expression = item.expr!;
    columns.push({ name: item.alias ?? outputName(expression, sources), expression });
  }
  return columns;
}

function outputNameMap(columns: OutputColumn[]): Map<string, number | null> {
  const result = new Map<string, number | null>();
  columns.forEach((column, index) => {
    const name = foldIdentifier(column.name);
    if (result.has(name)) result.set(name, null);
    else result.set(name, index);
  });
  return result;
}

function validateColumnReferences(
  expression: Expr,
  sources: SourceDescriptor[],
  outputNames?: Map<string, number | null>,
): void {
  switch (expression.kind) {
    case "literal":
      return;
    case "column": {
      if (!expression.table && outputNames?.has(foldIdentifier(expression.name))) {
        if (outputNames.get(foldIdentifier(expression.name)) === null) {
          sqlError(`ambiguous ORDER BY name: ${expression.name}`);
        }
        return;
      }
      resolveColumnReference(expression, sources);
      return;
    }
    case "unary":
      validateColumnReferences(expression.operand, sources, outputNames);
      return;
    case "binary":
      validateColumnReferences(expression.left, sources, outputNames);
      validateColumnReferences(expression.right, sources, outputNames);
      return;
    case "is-null":
      validateColumnReferences(expression.operand, sources, outputNames);
      return;
    case "between":
      validateColumnReferences(expression.operand, sources, outputNames);
      validateColumnReferences(expression.lower, sources, outputNames);
      validateColumnReferences(expression.upper, sources, outputNames);
      return;
    case "in":
      validateColumnReferences(expression.operand, sources, outputNames);
      for (const value of expression.values) validateColumnReferences(value, sources, outputNames);
      return;
    case "like":
      validateColumnReferences(expression.operand, sources, outputNames);
      validateColumnReferences(expression.pattern, sources, outputNames);
      return;
    case "case":
      if (expression.base) validateColumnReferences(expression.base, sources, outputNames);
      for (const arm of expression.arms) {
        validateColumnReferences(arm.when, sources, outputNames);
        validateColumnReferences(arm.then, sources, outputNames);
      }
      if (expression.otherwise) validateColumnReferences(expression.otherwise, sources, outputNames);
      return;
    case "function":
      for (const argument of expression.args) {
        validateColumnReferences(argument, sources, outputNames);
      }
      return;
  }
}

function validateQueryColumnReferences(
  query: QueryAst,
  sources: SourceDescriptor[],
  outputNames: Map<string, number | null>,
): void {
  for (const item of query.select) if (item.expr) validateColumnReferences(item.expr, sources);
  if (query.where) validateColumnReferences(query.where, sources);
  for (const expression of query.groupBy) validateColumnReferences(expression, sources);
  if (query.having) validateColumnReferences(query.having, sources);
  for (const item of query.orderBy) {
    validateColumnReferences(item.expr, sources, outputNames);
  }
  if (query.limit) validateColumnReferences(query.limit, sources);
  if (query.offset) validateColumnReferences(query.offset, sources);
  if (query.from) {
    for (const step of query.from.steps) {
      if (step.on) validateColumnReferences(step.on, sources);
    }
  }
}

function integerPosition(expression: Expr): number | undefined {
  if (expression.kind === "literal" && typeof expression.value === "number") {
    return expression.value;
  }
  if (
    expression.kind === "unary" &&
    (expression.op === "+" || expression.op === "-") &&
    expression.operand.kind === "literal" &&
    typeof expression.operand.value === "number"
  ) {
    return expression.op === "-" ? -expression.operand.value : expression.operand.value;
  }
  return undefined;
}

interface ProjectedRow {
  values: RuntimeValue[];
  scope: EvalScope;
  orderValues: RuntimeValue[];
  originalIndex: number;
}

function evaluateOrder(
  item: OrderItem,
  row: ProjectedRow,
  columns: OutputColumn[],
  names: Map<string, number | null>,
): RuntimeValue {
  if (item.expr.kind === "column" && !item.expr.table) {
    const outputIndex = names.get(foldIdentifier(item.expr.name));
    if (outputIndex === null) sqlError(`ambiguous ORDER BY name: ${item.expr.name}`);
    if (outputIndex !== undefined) return row.values[outputIndex];
  }
  const position = integerPosition(item.expr);
  if (position !== undefined) {
    const value = position;
    if (value <= 0 || value > columns.length) {
      sqlError(`ORDER BY position ${value} is out of range`);
    }
    return row.values[value - 1];
  }
  return evaluate(item.expr, row.scope);
}

function compareOrderValues(left: RuntimeValue, right: RuntimeValue, descending: boolean): number {
  if (left === null || right === null) {
    if (left === null && right === null) return 0;
    const result = left === null ? -1 : 1;
    return descending ? -result : result;
  }
  const result = compareValues(left, right)!;
  return descending ? -result : result;
}

function queryLimit(expression: Expr | undefined, sources: SourceDescriptor[]): number | undefined {
  if (!expression) return undefined;
  const value = evaluate(expression, { row: { bindings: [] }, group: [], sources });
  if (value === null) sqlError("LIMIT must not be NULL");
  const numeric = numericValue(value)!;
  if (!Number.isFinite(numeric.value)) sqlError("LIMIT must be numeric");
  return Math.trunc(numeric.value);
}

function queryOffset(expression: Expr | undefined, sources: SourceDescriptor[]): number {
  if (!expression) return 0;
  const value = evaluate(expression, { row: { bindings: [] }, group: [], sources });
  if (value === null) sqlError("OFFSET must not be NULL");
  const numeric = numericValue(value)!;
  if (!Number.isFinite(numeric.value)) sqlError("OFFSET must be numeric");
  return Math.max(0, Math.trunc(numeric.value));
}

export function executeSelect(tables: SqlTables, sql: string): QueryResult {
  const query = parseSql(sql);
  validateQuery(query);
  const compiledTables = compileTables(tables);
  const sources = createSources(query.from, compiledTables);
  const outputColumns = buildOutputColumns(query, sources);
  const outputNames = outputNameMap(outputColumns);
  validateQueryColumnReferences(query, sources, outputNames);

  for (const order of query.orderBy) {
    const position = integerPosition(order.expr);
    if (position !== undefined) {
      if (position <= 0 || position > outputColumns.length) {
        sqlError(`ORDER BY position ${position} is out of range`);
      }
    }
  }

  let rows = executeFrom(query.from, sources);
  if (query.where) {
    rows = rows.filter((row) =>
      truthy(evaluate(query.where!, { row, group: [row], sources })),
    );
  }

  const grouped = query.groupBy.length > 0;
  const aggregateQuery =
    grouped ||
    Boolean(query.having) ||
    query.select.some((item) => item.expr && hasAggregate(item.expr)) ||
    query.orderBy.some((item) => hasAggregate(item.expr));

  const groups: RowContext[][] = [];
  if (grouped) {
    const groupedRows = new Map<string, RowContext[]>();
    for (const row of rows) {
      const values = query.groupBy.map((expression) =>
        evaluate(expression, { row, group: [row], sources }),
      );
      const key = distinctKey(values);
      const group = groupedRows.get(key);
      if (group) group.push(row);
      else groupedRows.set(key, [row]);
    }
    groups.push(...groupedRows.values());
  } else if (aggregateQuery) {
    groups.push(rows);
  } else {
    for (const row of rows) groups.push([row]);
  }

  const projected: ProjectedRow[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const representative = group[0] ?? { bindings: [] };
    const scope: EvalScope = { row: representative, group, sources };
    if (query.having && !truthy(evaluate(query.having, scope))) continue;
    const values = outputColumns.map((column) => evaluate(column.expression, scope));
    projected.push({ values, scope, orderValues: [], originalIndex: index });
  }

  for (const row of projected) {
    row.orderValues = query.orderBy.map((item) =>
      evaluateOrder(item, row, outputColumns, outputNames),
    );
  }

  let resultRows = projected;
  if (query.distinct) {
    const seen = new Set<string>();
    resultRows = projected.filter((row) => {
      const key = distinctKey(row.values);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (query.orderBy.length > 0) {
    resultRows.sort((left, right) => {
      for (let index = 0; index < query.orderBy.length; index += 1) {
        const comparison = compareOrderValues(
          left.orderValues[index],
          right.orderValues[index],
          query.orderBy[index].descending,
        );
        if (comparison !== 0) return comparison;
      }
      return left.originalIndex - right.originalIndex;
    });
  }

  const limit = queryLimit(query.limit, sources);
  const offset = queryOffset(query.offset, sources);
  const selected = limit !== undefined && limit >= 0
    ? resultRows.slice(offset, offset + limit)
    : resultRows.slice(offset);

  return {
    columns: outputColumns.map((column) => column.name),
    rows: selected.map((row) => row.values.map(externalValue)),
  };
}

export const executeSQL = executeSelect;
