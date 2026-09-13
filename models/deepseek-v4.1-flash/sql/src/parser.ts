import { SqlError } from './types';
import { makeReal } from './values';
import { tokenize } from './lexer';
import type { Token } from './lexer';
import type { Expr, FromStep, OrderTerm, SelectItem, SelectStmt } from './ast';

const RESERVED = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP',
  'HAVING',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'ON',
  'USING',
  'AS',
  'ASC',
  'DESC',
  'END',
  'THEN',
  'ELSE',
  'WHEN',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'LIKE',
  'BETWEEN',
  'NULL',
  'TRUE',
  'FALSE',
  'CASE',
  'UNION',
  'EXCEPT',
  'INTERSECT',
  'BY',
  'DISTINCT',
  'ALL',
]);

export function parse(sql: string): SelectStmt {
  return new Parser(sql).parseStatement();
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(private sql: string) {
    this.tokens = tokenize(sql);
  }

  private peek(offset = 0): Token {
    const i = Math.min(this.pos + offset, this.tokens.length - 1);
    return this.tokens[i];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (t.kind !== 'eof') this.pos++;
    return t;
  }

  private isKw(t: Token, kw: string): boolean {
    return t.kind === 'ident' && t.text.toUpperCase() === kw;
  }

  private eatKw(kw: string): boolean {
    if (this.isKw(this.peek(), kw)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expectKw(kw: string): void {
    if (!this.eatKw(kw)) this.syntaxError();
  }

  private isOp(t: Token, op: string): boolean {
    return t.kind === 'op' && t.text === op;
  }

  private eatOp(op: string): boolean {
    if (this.isOp(this.peek(), op)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expectOp(op: string): void {
    if (!this.eatOp(op)) this.syntaxError();
  }

  private syntaxError(): never {
    const t = this.peek();
    const near = t.kind === 'eof' ? '' : t.text;
    throw new SqlError(`near "${near}": syntax error`);
  }

  parseStatement(): SelectStmt {
    if (!this.eatKw('SELECT')) this.syntaxError();
    let distinct = false;
    if (this.eatKw('DISTINCT')) distinct = true;
    else this.eatKw('ALL');
    const items = this.parseSelectList();
    let from: FromStep[] | null = null;
    if (this.eatKw('FROM')) from = this.parseFrom();
    let where: Expr | null = null;
    if (this.eatKw('WHERE')) where = this.parseExpr();
    let groupBy: Expr[] | null = null;
    if (this.eatKw('GROUP')) {
      this.expectKw('BY');
      groupBy = this.parseExprList();
    }
    let having: Expr | null = null;
    if (this.eatKw('HAVING')) having = this.parseExpr();
    let orderBy: OrderTerm[] | null = null;
    if (this.eatKw('ORDER')) {
      this.expectKw('BY');
      orderBy = [];
      do {
        const expr = this.parseExpr();
        let desc = false;
        if (this.eatKw('DESC')) desc = true;
        else this.eatKw('ASC');
        orderBy.push({ expr, desc });
      } while (this.eatOp(','));
    }
    let limit: Expr | null = null;
    let offset: Expr | null = null;
    if (this.eatKw('LIMIT')) {
      const first = this.parseExpr();
      if (this.eatOp(',')) {
        offset = first;
        limit = this.parseExpr();
      } else {
        limit = first;
        if (this.eatKw('OFFSET')) offset = this.parseExpr();
      }
    }
    this.eatOp(';');
    if (this.peek().kind !== 'eof') this.syntaxError();
    return { distinct, items, from, where, groupBy, having, orderBy, limit, offset };
  }

  private parseSelectList(): SelectItem[] {
    const items: SelectItem[] = [];
    for (;;) {
      if (this.isOp(this.peek(), '*')) {
        this.next();
        items.push({ kind: 'star' });
      } else if (
        (this.peek().kind === 'ident' || this.peek().kind === 'qident') &&
        this.isOp(this.peek(1), '.') &&
        this.isOp(this.peek(2), '*')
      ) {
        const t = this.next();
        this.next();
        this.next();
        items.push({ kind: 'tableStar', table: t.text });
      } else {
        const start = this.peek().start;
        const expr = this.parseExpr();
        const end = this.tokens[this.pos - 1].end;
        const alias = this.parseAliasOptional();
        items.push({ kind: 'expr', expr, alias, text: this.sql.slice(start, end) });
      }
      if (!this.eatOp(',')) break;
    }
    return items;
  }

  private parseAliasOptional(): string | null {
    if (this.eatKw('AS')) return this.parseName();
    const t = this.peek();
    if (t.kind === 'qident' || t.kind === 'string') {
      this.next();
      return t.text;
    }
    if (t.kind === 'ident' && !RESERVED.has(t.text.toUpperCase())) {
      this.next();
      return t.text;
    }
    return null;
  }

  private parseName(): string {
    const t = this.peek();
    if (t.kind === 'ident' || t.kind === 'qident' || t.kind === 'string') {
      this.next();
      return t.text;
    }
    this.syntaxError();
  }

  private parseTableRef(): { table: string; alias: string | null } {
    const t = this.peek();
    if (t.kind !== 'ident' && t.kind !== 'qident') this.syntaxError();
    this.next();
    let alias: string | null = null;
    if (this.eatKw('AS')) {
      alias = this.parseName();
    } else {
      const a = this.peek();
      if (
        a.kind === 'qident' ||
        (a.kind === 'ident' && !RESERVED.has(a.text.toUpperCase()))
      ) {
        this.next();
        alias = a.text;
      }
    }
    return { table: t.text, alias };
  }

  private parseFrom(): FromStep[] {
    const steps: FromStep[] = [];
    const first = this.parseTableRef();
    steps.push({ kind: 'source', table: first.table, alias: first.alias });
    for (;;) {
      if (this.eatOp(',')) {
        const s = this.parseTableRef();
        steps.push({ kind: 'source', table: s.table, alias: s.alias });
        continue;
      }
      let joinType: 'inner' | 'left' | 'cross' | null = null;
      if (this.eatKw('JOIN')) joinType = 'inner';
      else if (this.eatKw('INNER')) {
        this.expectKw('JOIN');
        joinType = 'inner';
      } else if (this.eatKw('LEFT')) {
        this.eatKw('OUTER');
        this.expectKw('JOIN');
        joinType = 'left';
      } else if (this.eatKw('CROSS')) {
        this.expectKw('JOIN');
        joinType = 'cross';
      } else {
        break;
      }
      const s = this.parseTableRef();
      let on: Expr | null = null;
      if (joinType !== 'cross' && this.eatKw('ON')) on = this.parseExpr();
      steps.push({ kind: 'join', joinType, table: s.table, alias: s.alias, on });
    }
    return steps;
  }

  private parseExprList(): Expr[] {
    const list = [this.parseExpr()];
    while (this.eatOp(',')) list.push(this.parseExpr());
    return list;
  }

  private parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.eatKw('OR')) {
      left = { type: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.eatKw('AND')) {
      left = { type: 'and', left, right: this.parseNot() };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.eatKw('NOT')) return { type: 'not', expr: this.parseNot() };
    return this.parseEquality();
  }

  private parseEquality(): Expr {
    let left = this.parseRelational();
    for (;;) {
      const t = this.peek();
      if (
        t.kind === 'op' &&
        (t.text === '=' || t.text === '==' || t.text === '!=' || t.text === '<>')
      ) {
        this.next();
        left = { type: 'binary', op: t.text, left, right: this.parseRelational() };
        continue;
      }
      if (this.isKw(t, 'IS')) {
        this.next();
        const not = this.eatKw('NOT');
        if (this.isKw(this.peek(), 'NULL')) {
          this.next();
          left = { type: 'isNull', expr: left, not };
        } else {
          const is: Expr = { type: 'is', left, right: this.parseRelational() };
          left = not ? { type: 'not', expr: is } : is;
        }
        continue;
      }
      if (this.isKw(t, 'NOT')) {
        const nxt = this.peek(1);
        if (this.isKw(nxt, 'IN')) {
          this.next();
          this.next();
          left = this.parseInList(left, true);
          continue;
        }
        if (this.isKw(nxt, 'LIKE')) {
          this.next();
          this.next();
          left = { type: 'like', expr: left, pattern: this.parseRelational(), not: true };
          continue;
        }
        if (this.isKw(nxt, 'BETWEEN')) {
          this.next();
          this.next();
          left = this.parseBetween(left, true);
          continue;
        }
        break;
      }
      if (this.isKw(t, 'IN')) {
        this.next();
        left = this.parseInList(left, false);
        continue;
      }
      if (this.isKw(t, 'LIKE')) {
        this.next();
        left = { type: 'like', expr: left, pattern: this.parseRelational(), not: false };
        continue;
      }
      if (this.isKw(t, 'BETWEEN')) {
        this.next();
        left = this.parseBetween(left, false);
        continue;
      }
      break;
    }
    return left;
  }

  private parseInList(left: Expr, not: boolean): Expr {
    this.expectOp('(');
    const list: Expr[] = [];
    if (!this.isOp(this.peek(), ')')) {
      list.push(this.parseExpr());
      while (this.eatOp(',')) list.push(this.parseExpr());
    }
    this.expectOp(')');
    return { type: 'in', expr: left, list, not };
  }

  private parseBetween(left: Expr, not: boolean): Expr {
    const low = this.parseRelational();
    this.expectKw('AND');
    const high = this.parseRelational();
    return { type: 'between', expr: left, low, high, not };
  }

  private parseRelational(): Expr {
    let left = this.parseAdditive();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && (t.text === '<' || t.text === '<=' || t.text === '>' || t.text === '>=')) {
        this.next();
        left = { type: 'binary', op: t.text, left, right: this.parseAdditive() };
        continue;
      }
      break;
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && (t.text === '+' || t.text === '-')) {
        this.next();
        left = { type: 'binary', op: t.text, left, right: this.parseMultiplicative() };
        continue;
      }
      break;
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseConcat();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && (t.text === '*' || t.text === '/' || t.text === '%')) {
        this.next();
        left = { type: 'binary', op: t.text, left, right: this.parseConcat() };
        continue;
      }
      break;
    }
    return left;
  }

  private parseConcat(): Expr {
    let left = this.parseUnary();
    while (this.isOp(this.peek(), '||')) {
      this.next();
      left = { type: 'binary', op: '||', left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.eatOp('-')) return { type: 'unary', op: '-', expr: this.parseUnary() };
    if (this.eatOp('+')) return this.parseUnary();
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.kind === 'number') {
      this.next();
      const n = t.value as number;
      return { type: 'literal', value: t.isReal ? makeReal(n) : n };
    }
    if (t.kind === 'string') {
      this.next();
      return { type: 'literal', value: t.value as string };
    }
    if (this.isOp(t, '(')) {
      this.next();
      const e = this.parseExpr();
      this.expectOp(')');
      return e;
    }
    if (this.isKw(t, 'NULL')) {
      this.next();
      return { type: 'literal', value: null };
    }
    if (this.isKw(t, 'TRUE')) {
      this.next();
      return { type: 'literal', value: 1 };
    }
    if (this.isKw(t, 'FALSE')) {
      this.next();
      return { type: 'literal', value: 0 };
    }
    if (this.isKw(t, 'CASE')) return this.parseCase();
    if (t.kind === 'ident' && RESERVED.has(t.text.toUpperCase())) this.syntaxError();
    if (t.kind === 'ident' && this.isOp(this.peek(1), '(')) return this.parseFunction();
    if (t.kind === 'ident' || t.kind === 'qident') {
      this.next();
      if (this.eatOp('.')) {
        const c = this.peek();
        if (c.kind !== 'ident' && c.kind !== 'qident') this.syntaxError();
        this.next();
        return { type: 'column', table: t.text, name: c.text };
      }
      return { type: 'column', table: null, name: t.text };
    }
    this.syntaxError();
  }

  private parseFunction(): Expr {
    const nameTok = this.next();
    const name = nameTok.text.toLowerCase();
    this.expectOp('(');
    if (this.eatOp('*')) {
      this.expectOp(')');
      return { type: 'func', name, args: [], distinct: false, star: true };
    }
    let distinct = false;
    if (this.eatKw('DISTINCT')) distinct = true;
    const args: Expr[] = [];
    if (!this.isOp(this.peek(), ')')) {
      args.push(this.parseExpr());
      while (this.eatOp(',')) args.push(this.parseExpr());
    }
    this.expectOp(')');
    return { type: 'func', name, args, distinct, star: false };
  }

  private parseCase(): Expr {
    this.expectKw('CASE');
    let base: Expr | null = null;
    if (!this.isKw(this.peek(), 'WHEN')) base = this.parseExpr();
    const whens: Array<{ when: Expr; then: Expr }> = [];
    while (this.eatKw('WHEN')) {
      const when = this.parseExpr();
      this.expectKw('THEN');
      const then = this.parseExpr();
      whens.push({ when, then });
    }
    let elseExpr: Expr | null = null;
    if (this.eatKw('ELSE')) elseExpr = this.parseExpr();
    this.expectKw('END');
    return { type: 'case', base, whens, else: elseExpr };
  }
}
