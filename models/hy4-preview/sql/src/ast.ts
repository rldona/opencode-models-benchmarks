import type { SqlValue } from "./values.js";

export type BinaryOp =
  | "||"
  | "*"
  | "/"
  | "%"
  | "+"
  | "-"
  | "="
  | "=="
  | "!="
  | "<>"
  | "<"
  | "<="
  | ">"
  | ">="
  | "AND"
  | "OR"
  | "IS"
  | "IS NOT";

export interface Node {
  start: number;
  end: number;
  text: string;
}

export type Expr =
  | (Node & { kind: "literal"; value: SqlValue })
  | (Node & { kind: "column"; table: string | null; name: string })
  | (Node & { kind: "unary"; op: "-" | "+" | "NOT"; operand: Expr })
  | (Node & { kind: "binary"; op: BinaryOp; left: Expr; right: Expr })
  | (Node & { kind: "func"; name: string; args: Expr[]; star: boolean; distinct: boolean })
  | (Node & { kind: "in"; expr: Expr; list: Expr[]; negated: boolean })
  | (Node & { kind: "between"; expr: Expr; low: Expr; high: Expr; negated: boolean })
  | (Node & { kind: "like"; expr: Expr; pattern: Expr; escape: Expr | null; negated: boolean })
  | (Node & {
      kind: "case";
      base: Expr | null;
      whens: { when: Expr; then: Expr }[];
      else: Expr | null;
    });

export type ResultColumn =
  | { kind: "star"; table: string | null }
  | { kind: "expr"; expr: Expr; alias: string | null };

export type JoinType = "from" | "cross" | "inner" | "left";

export interface TableSource {
  table: string;
  alias: string | null;
  join: JoinType;
  on: Expr | null;
}

export interface OrderTerm {
  expr: Expr;
  desc: boolean;
}

export interface SelectStmt {
  distinct: boolean;
  columns: ResultColumn[];
  sources: TableSource[];
  where: Expr | null;
  groupBy: Expr[];
  having: Expr | null;
  orderBy: OrderTerm[];
  limit: Expr | null;
  offset: Expr | null;
}

export const AGGREGATE_FUNCTIONS = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX", "TOTAL"]);

export function isAggregateName(name: string): boolean {
  return AGGREGATE_FUNCTIONS.has(name);
}

export function walkExpr(expr: Expr, visit: (e: Expr) => void): void {
  visit(expr);
  switch (expr.kind) {
    case "literal":
    case "column":
      break;
    case "unary":
      walkExpr(expr.operand, visit);
      break;
    case "binary":
      walkExpr(expr.left, visit);
      walkExpr(expr.right, visit);
      break;
    case "func":
      for (const arg of expr.args) walkExpr(arg, visit);
      break;
    case "in":
      walkExpr(expr.expr, visit);
      for (const item of expr.list) walkExpr(item, visit);
      break;
    case "between":
      walkExpr(expr.expr, visit);
      walkExpr(expr.low, visit);
      walkExpr(expr.high, visit);
      break;
    case "like":
      walkExpr(expr.expr, visit);
      walkExpr(expr.pattern, visit);
      if (expr.escape) walkExpr(expr.escape, visit);
      break;
    case "case":
      if (expr.base) walkExpr(expr.base, visit);
      for (const w of expr.whens) {
        walkExpr(w.when, visit);
        walkExpr(w.then, visit);
      }
      if (expr.else) walkExpr(expr.else, visit);
      break;
  }
}

export function containsAggregate(expr: Expr | null): boolean {
  if (!expr) return false;
  let found = false;
  walkExpr(expr, (e) => {
    if (e.kind === "func" && isAggregateName(e.name)) found = true;
  });
  return found;
}

export function serializeExpr(expr: Expr): string {
  switch (expr.kind) {
    case "literal":
      return `lit(${String(expr.value)})`;
    case "column":
      return `col(${expr.table ?? ""}.${expr.name.toLowerCase()})`;
    case "unary":
      return `${expr.op}(${serializeExpr(expr.operand)})`;
    case "binary":
      return `(${serializeExpr(expr.left)} ${expr.op} ${serializeExpr(expr.right)})`;
    case "func":
      return `${expr.name}${expr.distinct ? ":distinct" : ""}${expr.star ? "(*)" : `(${expr.args.map(serializeExpr).join(",")})`}`;
    case "in":
      return `${serializeExpr(expr.expr)} ${expr.negated ? "NOT " : ""}IN (${expr.list.map(serializeExpr).join(",")})`;
    case "between":
      return `${serializeExpr(expr.expr)} ${expr.negated ? "NOT " : ""}BETWEEN ${serializeExpr(expr.low)} AND ${serializeExpr(expr.high)}`;
    case "like":
      return `${serializeExpr(expr.expr)} ${expr.negated ? "NOT " : ""}LIKE ${serializeExpr(expr.pattern)}`;
    case "case":
      return `CASE(${expr.base ? serializeExpr(expr.base) : ""}${expr.whens.map((w) => serializeExpr(w.when) + serializeExpr(w.then)).join("")}${expr.else ? serializeExpr(expr.else) : ""})`;
  }
}
