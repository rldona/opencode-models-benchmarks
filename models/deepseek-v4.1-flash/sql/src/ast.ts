import type { Cell } from './types';

export interface Expr {
  type:
    | 'literal'
    | 'column'
    | 'unary'
    | 'binary'
    | 'not'
    | 'and'
    | 'or'
    | 'isNull'
    | 'is'
    | 'in'
    | 'between'
    | 'like'
    | 'case'
    | 'func';
  value?: Cell;
  op?: string;
  table?: string | null;
  name?: string;
  expr?: Expr;
  left?: Expr;
  right?: Expr;
  list?: Expr[];
  low?: Expr;
  high?: Expr;
  not?: boolean;
  pattern?: Expr;
  base?: Expr | null;
  whens?: Array<{ when: Expr; then: Expr }>;
  else?: Expr | null;
  args?: Expr[];
  distinct?: boolean;
  star?: boolean;
  index?: number;
  hasAgg?: boolean;
  aggId?: number;
  bound?: boolean;
}

export interface SelectItem {
  kind: 'star' | 'tableStar' | 'expr';
  table?: string;
  expr?: Expr;
  alias?: string | null;
  text?: string;
}

export interface FromStep {
  kind: 'source' | 'join';
  joinType?: 'inner' | 'left' | 'cross';
  table: string;
  alias: string | null;
  on?: Expr | null;
}

export interface OrderTerm {
  expr: Expr;
  desc: boolean;
}

export interface SelectStmt {
  distinct: boolean;
  items: SelectItem[];
  from: FromStep[] | null;
  where: Expr | null;
  groupBy: Expr[] | null;
  having: Expr | null;
  orderBy: OrderTerm[] | null;
  limit: Expr | null;
  offset: Expr | null;
}
