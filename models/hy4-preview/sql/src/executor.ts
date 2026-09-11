import {
  AGGREGATE_FUNCTIONS,
  containsAggregate,
  isAggregateName,
  serializeExpr,
  walkExpr,
  type BinaryOp,
  type Expr,
  type SelectStmt,
} from "./ast.js";
import {
  ambiguousColumn,
  aggregateMisuse,
  noSuchColumn,
  noSuchTable,
  orderByOutOfRange,
} from "./errors.js";
import { checkScalarCall, callScalar, createAggregate, type AggInstance, type RowGetter } from "./functions.js";
import {
  addValues,
  andValues,
  compare,
  compareOp,
  concatValues,
  divValues,
  inOp,
  isOp,
  likeValues,
  modValues,
  mulValues,
  negateValue,
  notValue,
  orValues,
  outputValue,
  rowKey,
  subValues,
  toNumeric,
  truthy,
  type SqlValue,
} from "./values.js";

export interface NormalizedTable {
  name: string;
  columns: string[];
  rows: SqlValue[][];
}

export interface QueryResult {
  columns: string[];
  rows: (number | string | null)[][];
}

interface SourceInfo {
  name: string;
  columns: string[];
  offset: number;
  width: number;
}

interface AggSpec {
  name: string;
  args: Expr[];
  star: boolean;
  distinct: boolean;
}

interface CompileCtx {
  sources: SourceInfo[];
  aggs: AggSpec[];
  aggKeys: Map<string, number>;
  allowAgg: boolean;
}

type CompiledExpr = (row: SqlValue[], agg: SqlValue[] | null) => SqlValue;

interface OutputSpec {
  name: string;
  get: (row: SqlValue[], agg: SqlValue[] | null) => SqlValue;
  expr?: Expr;
  index?: number;
}

interface OutRow {
  out: SqlValue[];
  row: SqlValue[];
  agg: SqlValue[] | null;
}

function lower(s: string): string {
  return s.toLowerCase();
}

function findColumn(source: SourceInfo, name: string): number {
  const target = lower(name);
  for (let i = 0; i < source.columns.length; i++) {
    if (lower(source.columns[i]) === target) return i;
  }
  return -1;
}

function resolveColumn(ctx: CompileCtx, table: string | null, name: string): number {
  if (table !== null) {
    const target = lower(table);
    const source = ctx.sources.find((s) => lower(s.name) === target);
    if (!source) noSuchColumn(`${table}.${name}`);
    const idx = findColumn(source, name);
    if (idx < 0) noSuchColumn(`${table}.${name}`);
    return source.offset + idx;
  }
  let found = -1;
  for (const source of ctx.sources) {
    const idx = findColumn(source, name);
    if (idx >= 0) {
      if (found >= 0) ambiguousColumn(name);
      found = source.offset + idx;
    }
  }
  if (found < 0) noSuchColumn(name);
  return found;
}

function sourceOfIndex(sources: SourceInfo[], index: number): number {
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (index >= s.offset && index < s.offset + s.width) return i;
  }
  return -1;
}

function compileExpr(expr: Expr, ctx: CompileCtx): CompiledExpr {
  switch (expr.kind) {
    case "literal": {
      const value = expr.value;
      return () => value;
    }
    case "column": {
      const index = resolveColumn(ctx, expr.table, expr.name);
      return (row) => row[index];
    }
    case "unary": {
      if (expr.op === "NOT") {
        const operand = compileExpr(expr.operand, ctx);
        return (row, agg) => notValue(operand(row, agg));
      }
      if (expr.op === "+") {
        return compileExpr(expr.operand, ctx);
      }
      const operand = compileExpr(expr.operand, ctx);
      return (row, agg) => negateValue(operand(row, agg));
    }
    case "binary": {
      return compileBinary(expr.op, compileExpr(expr.left, ctx), compileExpr(expr.right, ctx));
    }
    case "func": {
      const name = expr.name;
      if (isAggregateName(name)) {
        if (!ctx.allowAgg) aggregateMisuse(name);
        const key = serializeExpr(expr);
        let index = ctx.aggKeys.get(key);
        if (index === undefined) {
          index = ctx.aggs.length;
          ctx.aggKeys.set(key, index);
          ctx.aggs.push({ name, args: expr.args, star: expr.star, distinct: expr.distinct });
        }
        const slot = index;
        return (_row, agg) => (agg ? agg[slot] : null);
      }
      checkScalarCall(name, expr.args.length);
      const args = expr.args.map((a) => compileExpr(a, ctx));
      return makeScalarCall(name, args);
    }
    case "in": {
      const value = compileExpr(expr.expr, ctx);
      const items = expr.list.map((i) => compileExpr(i, ctx));
      const negated = expr.negated;
      return (row, agg) => {
        const x = value(row, agg);
        const list: SqlValue[] = new Array(items.length);
        for (let i = 0; i < items.length; i++) list[i] = items[i](row, agg);
        const r = inOp(x, list);
        return negated ? notValue(r) : r;
      };
    }
    case "between": {
      const value = compileExpr(expr.expr, ctx);
      const low = compileExpr(expr.low, ctx);
      const high = compileExpr(expr.high, ctx);
      const negated = expr.negated;
      return (row, agg) => {
        const x = value(row, agg);
        const a = low(row, agg);
        const b = high(row, agg);
        const lower = compareOp(x, a, (c) => c >= 0);
        const upper = compareOp(x, b, (c) => c <= 0);
        const r = andValues(lower, upper);
        return negated ? notValue(r) : r;
      };
    }
    case "like": {
      const value = compileExpr(expr.expr, ctx);
      const pattern = compileExpr(expr.pattern, ctx);
      const escape = expr.escape ? compileExpr(expr.escape, ctx) : null;
      const negated = expr.negated;
      return (row, agg) => {
        const x = value(row, agg);
        const p = pattern(row, agg);
        let esc: string | null = null;
        if (escape) {
          const e = escape(row, agg);
          if (e !== null) esc = e as string;
        }
        const r = likeValues(x, p, esc && esc.length > 0 ? esc[0] : null);
        return negated ? notValue(r) : r;
      };
    }
    case "case": {
      const base = expr.base ? compileExpr(expr.base, ctx) : null;
      const whens = expr.whens.map((w) => ({ when: compileExpr(w.when, ctx), then: compileExpr(w.then, ctx) }));
      const elseFn = expr.else ? compileExpr(expr.else, ctx) : null;
      return (row, agg) => {
        if (base) {
          const b = base(row, agg);
          for (const w of whens) {
            const c = compareOp(b, w.when(row, agg), (x) => x === 0);
            if (c === 1) return w.then(row, agg);
          }
        } else {
          for (const w of whens) {
            if (truthy(w.when(row, agg))) return w.then(row, agg);
          }
        }
        return elseFn ? elseFn(row, agg) : null;
      };
    }
  }
}

function compileBinary(op: BinaryOp, left: CompiledExpr, right: CompiledExpr): CompiledExpr {
  switch (op) {
    case "AND":
      return (row, agg) => andValues(left(row, agg), right(row, agg));
    case "OR":
      return (row, agg) => orValues(left(row, agg), right(row, agg));
    case "||":
      return (row, agg) => concatValues(left(row, agg), right(row, agg));
    case "+":
      return (row, agg) => addValues(left(row, agg), right(row, agg));
    case "-":
      return (row, agg) => subValues(left(row, agg), right(row, agg));
    case "*":
      return (row, agg) => mulValues(left(row, agg), right(row, agg));
    case "/":
      return (row, agg) => divValues(left(row, agg), right(row, agg));
    case "%":
      return (row, agg) => modValues(left(row, agg), right(row, agg));
    case "=":
    case "==":
      return (row, agg) => compareOp(left(row, agg), right(row, agg), (c) => c === 0);
    case "!=":
    case "<>":
      return (row, agg) => compareOp(left(row, agg), right(row, agg), (c) => c !== 0);
    case "<":
      return (row, agg) => compareOp(left(row, agg), right(row, agg), (c) => c < 0);
    case "<=":
      return (row, agg) => compareOp(left(row, agg), right(row, agg), (c) => c <= 0);
    case ">":
      return (row, agg) => compareOp(left(row, agg), right(row, agg), (c) => c > 0);
    case ">=":
      return (row, agg) => compareOp(left(row, agg), right(row, agg), (c) => c >= 0);
    case "IS":
      return (row, agg) => isOp(left(row, agg), right(row, agg), false);
    case "IS NOT":
      return (row, agg) => isOp(left(row, agg), right(row, agg), true);
  }
}

const SCALAR_SCRATCH: SqlValue[] = [null, null, null, null];

function makeScalarCall(name: string, args: CompiledExpr[]): CompiledExpr {
  switch (args.length) {
    case 0:
      return () => callScalar(name, []);
    case 1: {
      const a = args[0];
      return (row, agg) => {
        SCALAR_SCRATCH[0] = a(row, agg);
        return callScalar(name, SCALAR_SCRATCH.slice(0, 1));
      };
    }
    case 2: {
      const a = args[0];
      const b = args[1];
      return (row, agg) => {
        SCALAR_SCRATCH[0] = a(row, agg);
        SCALAR_SCRATCH[1] = b(row, agg);
        return callScalar(name, SCALAR_SCRATCH.slice(0, 2));
      };
    }
    default: {
      return (row, agg) => {
        const values: SqlValue[] = new Array(args.length);
        for (let i = 0; i < args.length; i++) values[i] = args[i](row, agg);
        return callScalar(name, values);
      };
    }
  }
}

function splitAnd(expr: Expr): Expr[] {
  if (expr.kind === "binary" && expr.op === "AND") {
    return [...splitAnd(expr.left), ...splitAnd(expr.right)];
  }
  return [expr];
}

function eqPair(expr: Expr): { a: Expr; b: Expr } | null {
  if (expr.kind === "binary" && (expr.op === "=" || expr.op === "==")) {
    return { a: expr.left, b: expr.right };
  }
  return null;
}

function refsOf(expr: Expr, ctx: CompileCtx): number[] {
  const set = new Set<number>();
  walkExpr(expr, (node) => {
    if (node.kind === "column") {
      set.add(sourceOfIndex(ctx.sources, resolveColumn(ctx, node.table, node.name)));
    }
  });
  return [...set];
}

interface OrderKeyTerm {
  get: (r: OutRow) => SqlValue;
  desc: boolean;
}

function buildOrderTerms(
  terms: SelectStmt["orderBy"],
  columnNames: string[],
  ctx: CompileCtx,
): OrderKeyTerm[] {
  const result: OrderKeyTerm[] = [];
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const expr = term.expr;
    let get: (r: OutRow) => SqlValue;
    if (expr.kind === "literal" && typeof expr.value === "number") {
      const position = expr.value;
      if (!Number.isInteger(position) || position < 1 || position > columnNames.length) {
        orderByOutOfRange(i + 1, columnNames.length);
      }
      get = (r) => r.out[position - 1];
    } else if (expr.kind === "column" && expr.table === null) {
      const target = lower(expr.name);
      const index = columnNames.findIndex((n) => lower(n) === target);
      if (index >= 0) {
        get = (r) => r.out[index];
      } else {
        const compiled = compileExpr(expr, ctx);
        get = (r) => compiled(r.row, r.agg);
      }
    } else {
      const compiled = compileExpr(expr, ctx);
      get = (r) => compiled(r.row, r.agg);
    }
    result.push({ get, desc: term.desc });
  }
  return result;
}

function outputNameOf(expr: Expr, alias: string | null): string {
  if (alias !== null) return alias;
  if (expr.kind === "column") return expr.name;
  return expr.text;
}

export function executeSelect(stmt: SelectStmt, tables: Map<string, NormalizedTable>): QueryResult {
  const sources: SourceInfo[] = [];
  const sourceRows: SqlValue[][][] = [];
  let width = 0;

  for (const source of stmt.sources) {
    const table = tables.get(lower(source.table));
    if (!table) noSuchTable(source.table);
    const columns = table.columns;
    sources.push({
      name: source.alias ?? source.table,
      columns,
      offset: width,
      width: columns.length,
    });
    sourceRows.push(table.rows);
    width += columns.length;
  }

  const totalWidth = width;
  const nullRow: SqlValue[] = new Array(totalWidth).fill(null);
  const baseCtx: CompileCtx = { sources, aggs: [], aggKeys: new Map(), allowAgg: false };
  const noAggCtx = (): CompileCtx => ({ sources, aggs: [], aggKeys: new Map(), allowAgg: false });

  const whereFn = stmt.where ? compileExpr(stmt.where, baseCtx) : null;
  const whereConjuncts = stmt.where ? splitAnd(stmt.where) : [];

  const isAggregateQuery =
    stmt.groupBy.length > 0 ||
    stmt.columns.some((c) => c.kind === "expr" && containsAggregate(c.expr)) ||
    containsAggregate(stmt.having) ||
    stmt.orderBy.some((t) => containsAggregate(t.expr));

  const aggCtx: CompileCtx = { sources, aggs: [], aggKeys: new Map(), allowAgg: true };
  const selectCtx = isAggregateQuery ? aggCtx : noAggCtx();

  /* ----------------------------- FROM / JOIN ----------------------------- */

  let current: SqlValue[][];
  if (stmt.sources.length === 0) {
    current = [[]];
  } else {
    current = sourceRows[0];
    for (let k = 1; k < stmt.sources.length; k++) {
      current = joinStep(k, current);
    }
  }

  /* ------------------------------- WHERE -------------------------------- */

  const filtered: SqlValue[][] = whereFn ? current.filter((row) => truthy(whereFn(row, null))) : current;

  /* --------------------------- output columns --------------------------- */

  const outSpecs: OutputSpec[] = [];
  for (const column of stmt.columns) {
    if (column.kind === "star") {
      if (column.table === null) {
        for (const source of sources) {
          for (let i = 0; i < source.columns.length; i++) {
            const index = source.offset + i;
            const name = source.columns[i];
            outSpecs.push({ name, get: (row) => row[index], index });
          }
        }
      } else {
        const target = lower(column.table);
        const source = sources.find((s) => lower(s.name) === target);
        if (!source) noSuchTable(column.table);
        for (let i = 0; i < source.columns.length; i++) {
          const index = source.offset + i;
          const name = source.columns[i];
          outSpecs.push({ name, get: (row) => row[index], index });
        }
      }
    } else {
      const compiled = compileExpr(column.expr, selectCtx);
      outSpecs.push({
        name: outputNameOf(column.expr, column.alias),
        get: (row, agg) => compiled(row, agg),
        expr: column.expr,
      });
    }
  }

  const columnNames = outSpecs.map((s) => s.name);

  const orderTerms = buildOrderTerms(stmt.orderBy, columnNames, selectCtx);
  const havingFn = stmt.having ? compileExpr(stmt.having, aggCtx) : null;

  /* --------------------------- aggregate specs -------------------------- */

  const aggSpecs = aggCtx.aggs;
  const aggArgGetters: RowGetter[][] = aggSpecs.map((spec) => {
    const inner: CompileCtx = { sources, aggs: [], aggKeys: new Map(), allowAgg: false };
    return spec.args.map((a) => {
      const compiled = compileExpr(a, inner);
      return (row: SqlValue[]) => compiled(row, null);
    });
  });
  const makeAggInstances = (): AggInstance[] =>
    aggSpecs.map((spec, i) => createAggregate(spec.name, spec.star, spec.distinct, aggArgGetters[i]));

  /* ------------------------------ produce ------------------------------- */

  const outRows: OutRow[] = [];

  if (isAggregateQuery) {
    if (stmt.groupBy.length === 0) {
      const instances = makeAggInstances();
      for (const row of filtered) {
        for (const inst of instances) inst.update(row);
      }
      const agg = instances.map((i) => i.finish());
      const row = filtered.length > 0 ? filtered[0] : nullRow;
      if (!havingFn || truthy(havingFn(row, agg))) {
        outRows.push({ out: outSpecs.map((s) => s.get(row, agg)), row, agg });
      }
    } else {
      const groupFns = stmt.groupBy.map((e, position) => {
        if (e.kind === "literal" && typeof e.value === "number" && Number.isInteger(e.value)) {
          if (e.value < 1 || e.value > outSpecs.length) groupByOutOfRange(position + 1, outSpecs.length);
          const spec = outSpecs[e.value - 1];
          if (spec.expr) return compileExpr(spec.expr, noAggCtx());
          const index = spec.index ?? 0;
          return (row: SqlValue[]) => row[index];
        }
        return compileExpr(e, noAggCtx());
      });
      const groups = new Map<string, { first: SqlValue[]; instances: AggInstance[] }>();
      for (const row of filtered) {
        const keys: SqlValue[] = new Array(groupFns.length);
        for (let i = 0; i < groupFns.length; i++) keys[i] = groupFns[i](row, null);
        const key = rowKey(keys);
        let group = groups.get(key);
        if (!group) {
          group = { first: row, instances: makeAggInstances() };
          groups.set(key, group);
        }
        for (const inst of group.instances) inst.update(row);
      }
      for (const group of groups.values()) {
        const agg = group.instances.map((i) => i.finish());
        if (havingFn && !truthy(havingFn(group.first, agg))) continue;
        outRows.push({ out: outSpecs.map((s) => s.get(group.first, agg)), row: group.first, agg });
      }
    }
  } else {
    for (const row of filtered) {
      outRows.push({ out: outSpecs.map((s) => s.get(row, null)), row, agg: null });
    }
  }

  /* ------------------------------ DISTINCT ------------------------------ */

  let result = outRows;
  if (stmt.distinct) {
    const seen = new Set<string>();
    result = [];
    for (const r of outRows) {
      const key = rowKey(r.out);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(r);
    }
  }

  /* ------------------------------ ORDER BY ------------------------------ */

  if (orderTerms.length > 0) {
    const terms = orderTerms;
    const keyed = result.map((r, index) => ({ r, keys: terms.map((t) => t.get(r)), index }));
    keyed.sort((a, b) => {
      for (let i = 0; i < terms.length; i++) {
        const c = compare(a.keys[i], b.keys[i]);
        if (c !== 0) return terms[i].desc ? -c : c;
      }
      return a.index - b.index;
    });
    result = keyed.map((k) => k.r);
  }

  /* ---------------------------- LIMIT/OFFSET ---------------------------- */

  if (stmt.limit || stmt.offset) {
    const sample = result.length > 0 ? result[0] : null;
    const sampleRow = sample ? sample.row : nullRow;
    const sampleAgg = sample ? sample.agg : null;
    let limitValue: number | null = null;
    let offsetValue = 0;
    if (stmt.limit) {
      const v = compileExpr(stmt.limit, selectCtx)(sampleRow, sampleAgg);
      const numeric = toNumeric(v);
      limitValue = numeric ? Math.trunc(numeric.n) : 0;
      if (limitValue < 0) limitValue = null;
    }
    if (stmt.offset) {
      const v = compileExpr(stmt.offset, selectCtx)(sampleRow, sampleAgg);
      const numeric = toNumeric(v);
      offsetValue = numeric ? Math.max(0, Math.trunc(numeric.n)) : 0;
    }
    const start = Math.min(offsetValue, result.length);
    const end = limitValue === null ? result.length : Math.min(result.length, start + limitValue);
    result = result.slice(start, end);
  }

  return {
    columns: columnNames,
    rows: result.map((r) => r.out.map(outputValue)),
  };

  /* ------------------------------ helpers ------------------------------- */

  function joinStep(k: number, leftRows: SqlValue[][]): SqlValue[][] {
    const source = stmt.sources[k];
    const rightRows = sourceRows[k];
    const rightInfo = sources[k];
    const rightWidth = rightInfo.width;
    const fullOn = source.on;
    const conjuncts = fullOn ? splitAnd(fullOn) : whereConjuncts;

    const leftKeys: CompiledExpr[] = [];
    const rightKeyExprs: Expr[] = [];
    const usedOn: boolean[] = conjuncts.map(() => false);

    for (let i = 0; i < conjuncts.length; i++) {
      const pair = eqPair(conjuncts[i]);
      if (!pair) continue;
      const refsA = refsOf(pair.a, baseCtx);
      const refsB = refsOf(pair.b, baseCtx);
      const aLeft = refsA.every((r) => r >= 0 && r < k);
      const bRight = refsB.length > 0 && refsB.every((r) => r === k);
      const bLeft = refsB.every((r) => r >= 0 && r < k);
      const aRight = refsA.length > 0 && refsA.every((r) => r === k);
      if (aLeft && bRight) {
        leftKeys.push(compileExpr(pair.a, baseCtx));
        rightKeyExprs.push(pair.b);
        usedOn[i] = true;
      } else if (bLeft && aRight) {
        leftKeys.push(compileExpr(pair.b, baseCtx));
        rightKeyExprs.push(pair.a);
        usedOn[i] = true;
      }
    }

    const rightCtx: CompileCtx = { sources: [{ ...rightInfo, offset: 0 }], aggs: [], aggKeys: new Map(), allowAgg: false };
    const rightKeyFns = rightKeyExprs.map((e) => compileExpr(e, rightCtx));

    const remainingOnExprs = fullOn ? conjuncts.filter((_, i) => !usedOn[i]) : [];
    const remainingOn = remainingOnExprs.length > 0 ? remainingOnExprs.map((e) => compileExpr(e, baseCtx)) : [];

    const out: SqlValue[][] = [];
    const leftJoin = source.join === "left";
    const nullPad: SqlValue[] = new Array(rightWidth).fill(null);

    const matches = (combined: SqlValue[]): boolean => {
      for (const fn of remainingOn) {
        const v = fn(combined, null);
        if (v === null || !truthy(v)) return false;
      }
      return true;
    };

    if (leftKeys.length > 0) {
      const keyCount = leftKeys.length;
      const buckets = new Map<string, SqlValue[][]>();
      for (const rightRow of rightRows) {
        const values: SqlValue[] = new Array(keyCount);
        for (let i = 0; i < keyCount; i++) values[i] = rightKeyFns[i](rightRow, null);
        const key = rowKey(values);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(rightRow);
        else buckets.set(key, [rightRow]);
      }

      for (const leftRow of leftRows) {
        const values: SqlValue[] = new Array(keyCount);
        for (let i = 0; i < keyCount; i++) values[i] = leftKeys[i](leftRow, null);
        const key = rowKey(values);
        const bucket = buckets.get(key);
        let matched = false;
        if (bucket) {
          for (const rightRow of bucket) {
            const combined = leftRow.concat(rightRow);
            if (remainingOn.length > 0 && !matches(combined)) continue;
            out.push(combined);
            matched = true;
          }
        }
        if (!matched && leftJoin) out.push(leftRow.concat(nullPad));
      }
      return out;
    }

    const onFns = fullOn ? [compileExpr(fullOn, baseCtx)] : [];
    for (const leftRow of leftRows) {
      let matched = false;
      for (const rightRow of rightRows) {
        const combined = leftRow.concat(rightRow);
        let ok = true;
        for (const fn of onFns) {
          const v = fn(combined, null);
          if (v === null || !truthy(v)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          out.push(combined);
          matched = true;
        }
      }
      if (!matched && leftJoin) out.push(leftRow.concat(nullPad));
    }
    return out;
  }
}

export { AGGREGATE_FUNCTIONS };
