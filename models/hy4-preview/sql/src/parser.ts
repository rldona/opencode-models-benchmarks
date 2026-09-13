import { KEYWORDS, tokenize, type Token } from "./tokenizer.js";
import type {
  BinaryOp,
  Expr,
  OrderTerm,
  ResultColumn,
  SelectStmt,
  TableSource,
} from "./ast.js";
import { SqlError } from "./errors.js";
import type { SqlValue } from "./values.js";

class Parser {
  private readonly sql: string;
  private readonly tokens: Token[];
  private pos = 0;

  constructor(sql: string) {
    this.sql = sql;
    this.tokens = tokenize(sql);
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private at(kind: Token["kind"], value?: string): boolean {
    const t = this.peek();
    return t.kind === kind && (value === undefined || t.value === value);
  }

  private atKeyword(value: string): boolean {
    return this.at("keyword", value);
  }

  private atPunct(value: string): boolean {
    return this.at("punct", value);
  }

  private accept(kind: Token["kind"], value?: string): Token | null {
    if (this.at(kind, value)) return this.next();
    return null;
  }

  private acceptKeyword(value: string): boolean {
    return this.accept("keyword", value) !== null;
  }

  private expectKeyword(value: string): void {
    if (!this.acceptKeyword(value)) this.fail(`expected ${value}`);
  }

  private expectPunct(value: string): void {
    if (!this.accept("punct", value)) this.fail(`expected "${value}"`);
  }

  private fail(detail: string): never {
    const t = this.peek();
    const found = t.kind === "eof" ? "end of input" : `"${t.value}"`;
    throw new SqlError(`syntax error: ${detail} near ${found} (at ${t.start})`, "SYNTAX");
  }

  private text(start: number, end: number): string {
    return this.sql.slice(start, end).trim();
  }

  parseStatement(): SelectStmt {
    const stmt = this.parseSelect();
    this.accept("punct", ";");
    if (!this.at("eof")) this.fail("unexpected token after statement");
    return stmt;
  }

  private parseSelect(): SelectStmt {
    this.expectKeyword("SELECT");
    let distinct = false;
    if (this.acceptKeyword("DISTINCT")) distinct = true;
    else this.acceptKeyword("ALL");

    const columns = this.parseResultColumns();
    const sources: TableSource[] = [];
    if (this.acceptKeyword("FROM")) this.parseFrom(sources);

    let where: Expr | null = null;
    if (this.acceptKeyword("WHERE")) where = this.parseExpr();

    let groupBy: Expr[] = [];
    if (this.acceptKeyword("GROUP")) {
      this.expectKeyword("BY");
      groupBy = this.parseExprList();
    }

    let having: Expr | null = null;
    if (this.acceptKeyword("HAVING")) having = this.parseExpr();

    let orderBy: OrderTerm[] = [];
    if (this.acceptKeyword("ORDER")) {
      this.expectKeyword("BY");
      orderBy = this.parseOrderTerms();
    }

    let limit: Expr | null = null;
    let offset: Expr | null = null;
    if (this.acceptKeyword("LIMIT")) {
      limit = this.parseExpr();
      if (this.acceptKeyword("OFFSET")) {
        offset = this.parseExpr();
      } else if (this.accept("punct", ",")) {
        offset = limit;
        limit = this.parseExpr();
      }
    } else if (this.acceptKeyword("OFFSET")) {
      offset = this.parseExpr();
      if (this.atKeyword("ROW") || this.atKeyword("ROWS")) this.next();
      if (this.acceptKeyword("LIMIT")) limit = this.parseExpr();
    }

    return { distinct, columns, sources, where, groupBy, having, orderBy, limit, offset };
  }

  private parseResultColumns(): ResultColumn[] {
    const columns: ResultColumn[] = [];
    do {
      columns.push(this.parseResultColumn());
    } while (this.accept("punct", ","));
    return columns;
  }

  private parseResultColumn(): ResultColumn {
    if (this.atPunct("*")) {
      this.next();
      return { kind: "star", table: null };
    }
    if (this.at("ident") && this.peek(1).kind === "punct" && this.peek(1).value === "." && this.atPunct2(2, "*")) {
      const tableToken = this.next();
      this.next();
      this.next();
      return { kind: "star", table: tableToken.value };
    }

    const expr = this.parseExpr();
    let alias: string | null = null;
    if (this.acceptKeyword("AS")) {
      alias = this.parseName();
    } else if (this.at("ident")) {
      alias = this.next().value;
    }
    return { kind: "expr", expr, alias };
  }

  private atPunct2(offset: number, value: string): boolean {
    const t = this.peek(offset);
    return t.kind === "punct" && t.value === value;
  }

  private parseName(): string {
    const t = this.peek();
    if (t.kind === "ident") {
      this.next();
      return t.value;
    }
    if (t.kind === "keyword" && !RESERVED.has(t.value)) {
      this.next();
      return t.value;
    }
    return this.fail("expected identifier");
  }

  private parseFrom(sources: TableSource[]): void {
    sources.push(this.parseTableSource("from"));
    for (;;) {
      let join: "cross" | "inner" | "left";
      if (this.accept("punct", ",")) {
        join = "cross";
      } else if (this.atKeyword("JOIN")) {
        this.next();
        join = "inner";
      } else if (this.atKeyword("INNER")) {
        this.next();
        this.expectKeyword("JOIN");
        join = "inner";
      } else if (this.atKeyword("CROSS")) {
        this.next();
        this.expectKeyword("JOIN");
        join = "cross";
      } else if (this.atKeyword("LEFT")) {
        this.next();
        this.acceptKeyword("OUTER");
        this.expectKeyword("JOIN");
        join = "left";
      } else if (this.atKeyword("RIGHT") || this.atKeyword("FULL") || this.atKeyword("NATURAL")) {
        throw new SqlError(`unsupported feature: ${this.peek().value} JOIN`, "UNSUPPORTED");
      } else {
        break;
      }

      const source = this.parseTableSource(join);
      if (this.acceptKeyword("ON")) {
        if (join === "cross") this.fail("unexpected ON clause");
        source.on = this.parseExpr();
      }
      sources.push(source);
    }
  }

  private parseTableSource(join: TableSource["join"]): TableSource {
    const table = this.parseName();
    let alias: string | null = null;
    if (this.acceptKeyword("AS")) alias = this.parseName();
    else if (this.at("ident")) alias = this.next().value;
    return { table, alias, join, on: null };
  }

  private parseOrderTerms(): OrderTerm[] {
    const terms: OrderTerm[] = [];
    do {
      const expr = this.parseExpr();
      let desc = false;
      if (this.acceptKeyword("DESC")) desc = true;
      else this.acceptKeyword("ASC");
      terms.push({ expr, desc });
    } while (this.accept("punct", ","));
    return terms;
  }

  private parseExprList(): Expr[] {
    const list: Expr[] = [];
    do {
      list.push(this.parseExpr());
    } while (this.accept("punct", ","));
    return list;
  }

  /* ------------------------- expressions ------------------------- */

  parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.atKeyword("OR")) {
      this.next();
      const right = this.parseAnd();
      left = this.binary("OR", left, right);
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.atKeyword("AND")) {
      this.next();
      const right = this.parseNot();
      left = this.binary("AND", left, right);
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.atKeyword("NOT")) {
      const start = this.peek().start;
      this.next();
      const operand = this.parseNot();
      return { kind: "unary", op: "NOT", operand, start, end: operand.end, text: this.text(start, operand.end) };
    }
    return this.parseCompare();
  }

  private parseCompare(): Expr {
    let left = this.parseAdditive();
    for (;;) {
      const t = this.peek();
      if (t.kind === "punct") {
        if (t.value === "=" || t.value === "==") {
          this.next();
          left = this.binary("=", left, this.parseAdditive());
          continue;
        }
        if (t.value === "!=" || t.value === "<>") {
          this.next();
          left = this.binary("!=", left, this.parseAdditive());
          continue;
        }
        if (t.value === "<" || t.value === "<=" || t.value === ">" || t.value === ">=") {
          this.next();
          left = this.binary(t.value as BinaryOp, left, this.parseAdditive());
          continue;
        }
        break;
      }

      if (t.kind === "keyword") {
        if (t.value === "IS") {
          this.next();
          const negated = this.acceptKeyword("NOT");
          const right = this.parseAdditive();
          left = this.binary(negated ? "IS NOT" : "IS", left, right);
          continue;
        }
        if (t.value === "ISNULL") {
          this.next();
          left = this.binary("IS", left, this.literal(null, t));
          continue;
        }
        if (t.value === "NOTNULL") {
          this.next();
          left = this.binary("IS NOT", left, this.literal(null, t));
          continue;
        }
        let negated = false;
        let kw = t.value;
        if (kw === "NOT") {
          const n = this.peek(1);
          if (n.kind === "keyword" && (n.value === "IN" || n.value === "LIKE" || n.value === "BETWEEN")) {
            this.next();
            negated = true;
            kw = n.value;
          } else {
            break;
          }
        }
        if (kw === "IN") {
          this.next();
          this.expectPunct("(");
          if (this.atPunct(")")) this.fail("empty IN list");
          const list = this.parseExprList();
          this.expectPunct(")");
          left = { kind: "in", expr: left, list, negated, start: left.start, end: this.tokens[this.pos - 1].end, text: this.text(left.start, this.tokens[this.pos - 1].end) };
          continue;
        }
        if (kw === "LIKE") {
          this.next();
          const pattern = this.parseAdditive();
          let escape: Expr | null = null;
          if (this.acceptKeyword("ESCAPE")) escape = this.parseAdditive();
          left = { kind: "like", expr: left, pattern, escape, negated, start: left.start, end: this.tokens[this.pos - 1].end, text: this.text(left.start, this.tokens[this.pos - 1].end) };
          continue;
        }
        if (kw === "BETWEEN") {
          this.next();
          const low = this.parseAdditive();
          this.expectKeyword("AND");
          const high = this.parseAdditive();
          left = { kind: "between", expr: left, low, high, negated, start: left.start, end: high.end, text: this.text(left.start, high.end) };
          continue;
        }
        if (kw === "GLOB" || kw === "REGEXP" || kw === "MATCH") {
          throw new SqlError(`unsupported feature: ${kw} operator`, "UNSUPPORTED");
        }
        break;
      }

      break;
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t.kind === "punct" && (t.value === "+" || t.value === "-")) {
        this.next();
        const right = this.parseMultiplicative();
        left = this.binary(t.value as BinaryOp, left, right);
        continue;
      }
      return left;
    }
  }

  private parseMultiplicative(): Expr {
    let left = this.parseConcat();
    for (;;) {
      const t = this.peek();
      if (t.kind === "punct" && (t.value === "*" || t.value === "/" || t.value === "%")) {
        this.next();
        const right = this.parseConcat();
        left = this.binary(t.value as BinaryOp, left, right);
        continue;
      }
      return left;
    }
  }

  private parseConcat(): Expr {
    let left = this.parseUnary();
    while (this.atPunct("||")) {
      this.next();
      const right = this.parseUnary();
      left = this.binary("||", left, right);
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.kind === "punct" && (t.value === "-" || t.value === "+")) {
      this.next();
      const operand = this.parseUnary();
      return { kind: "unary", op: t.value as "-" | "+", operand, start: t.start, end: operand.end, text: this.text(t.start, operand.end) };
    }
    if (t.kind === "keyword" && t.value === "NOT") {
      this.next();
      const operand = this.parseUnary();
      return { kind: "unary", op: "NOT", operand, start: t.start, end: operand.end, text: this.text(t.start, operand.end) };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.peek();

    if (t.kind === "number") {
      this.next();
      return { kind: "literal", value: t.literal as SqlValue, start: t.start, end: t.end, text: this.text(t.start, t.end) };
    }
    if (t.kind === "string") {
      this.next();
      return { kind: "literal", value: t.value, start: t.start, end: t.end, text: this.text(t.start, t.end) };
    }
    if (t.kind === "keyword") {
      if (t.value === "NULL") {
        this.next();
        return this.literal(null, t);
      }
      if (t.value === "TRUE" || t.value === "FALSE") {
        this.next();
        return this.literal(t.value === "TRUE" ? 1 : 0, t);
      }
      if (t.value === "CASE") return this.parseCase();
      if (t.value === "CAST") return this.parseCast();
      this.fail(`unexpected keyword ${t.value}`);
    }
    if (t.kind === "punct" && t.value === "(") {
      this.next();
      const inner = this.parseExpr();
      this.expectPunct(")");
      return inner;
    }
    if (t.kind === "ident") {
      if (this.peek(1).kind === "punct" && this.peek(1).value === "(") {
        return this.parseFunction();
      }
      this.next();
      let table: string | null = null;
      let name = t.value;
      if (this.atPunct(".")) {
        this.next();
        const colToken = this.peek();
        if (colToken.kind !== "ident" && !(colToken.kind === "keyword" && !RESERVED.has(colToken.value))) {
          this.fail("expected column name");
        }
        this.next();
        table = name;
        name = colToken.value;
      }
      return { kind: "column", table, name, start: t.start, end: this.tokens[this.pos - 1].end, text: this.text(t.start, this.tokens[this.pos - 1].end) };
    }

    return this.fail("expected expression");
  }

  private parseFunction(): Expr {
    const nameToken = this.next();
    const name = nameToken.value.toUpperCase();
    this.expectPunct("(");
    let star = false;
    let distinct = false;
    const args: Expr[] = [];
    if (this.atPunct("*")) {
      this.next();
      star = true;
    } else {
      if (this.atKeyword("DISTINCT")) {
        this.next();
        distinct = true;
      }
      if (!this.atPunct(")")) args.push(...this.parseExprList());
    }
    this.expectPunct(")");
    const end = this.tokens[this.pos - 1].end;
    return { kind: "func", name, args, star, distinct, start: nameToken.start, end, text: this.text(nameToken.start, end) };
  }

  private parseCast(): Expr {
    const startToken = this.next();
    this.expectPunct("(");
    const expr = this.parseExpr();
    this.expectKeyword("AS");
    let typeText = "";
    let depth = 0;
    while (!this.at("eof")) {
      const tk = this.peek();
      if (tk.kind === "punct" && tk.value === "(") depth++;
      if (tk.kind === "punct" && tk.value === ")") {
        if (depth === 0) break;
        depth--;
      }
      typeText += ` ${tk.value}`;
      this.next();
    }
    this.expectPunct(")");
    const end = this.tokens[this.pos - 1].end;
    return {
      kind: "func",
      name: `CAST_${castKind(typeText)}`,
      args: [expr],
      star: false,
      distinct: false,
      start: startToken.start,
      end,
      text: this.text(startToken.start, end),
    };
  }

  private parseCase(): Expr {
    const startToken = this.next();
    let base: Expr | null = null;
    if (!this.atKeyword("WHEN")) base = this.parseExpr();
    const whens: { when: Expr; then: Expr }[] = [];
    while (this.acceptKeyword("WHEN")) {
      const when = this.parseExpr();
      this.expectKeyword("THEN");
      const then = this.parseExpr();
      whens.push({ when, then });
    }
    if (whens.length === 0) this.fail("expected WHEN");
    let elseExpr: Expr | null = null;
    if (this.acceptKeyword("ELSE")) elseExpr = this.parseExpr();
    this.expectKeyword("END");
    const end = this.tokens[this.pos - 1].end;
    return { kind: "case", base, whens, else: elseExpr, start: startToken.start, end, text: this.text(startToken.start, end) };
  }

  private binary(op: BinaryOp, left: Expr, right: Expr): Expr {
    return { kind: "binary", op, left, right, start: left.start, end: right.end, text: this.text(left.start, right.end) };
  }

  private literal(value: SqlValue, t: Token): Expr {
    return { kind: "literal", value, start: t.start, end: t.end, text: this.text(t.start, t.end) };
  }
}

const RESERVED = new Set([...KEYWORDS]);

function castKind(typeText: string): string {
  const t = typeText.toUpperCase();
  if (t.includes("BLOB")) return "BLOB";
  if (t.includes("INT")) return "INTEGER";
  if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) return "TEXT";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "REAL";
  return "NUMERIC";
}

export function parse(sql: string): SelectStmt {
  const parser = new Parser(sql);
  return parser.parseStatement();
}
