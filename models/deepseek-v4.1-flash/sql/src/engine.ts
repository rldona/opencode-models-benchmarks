import { SqlError } from './types';
import type { Cell, Database, QueryResult, SqlValue, TableData } from './types';
import { AGGREGATES, SCALAR_FUNCTIONS, scalarArityError } from './functions';
import {
  addValues,
  and3,
  compareCells,
  concatValues,
  divValues,
  isBoxedReal,
  isRealVal,
  isTrueValue,
  likeValues,
  makeReal,
  modValues,
  mulValues,
  negValue,
  not3,
  numOf,
  numeric,
  or3,
  subValues,
  textToNumber,
  truth3,
  valueKey,
} from './values';
import type { Expr, FromStep, SelectStmt } from './ast';

interface SourceInfo {
  alias: string;
  aliasLower: string;
  columnNames: string[];
  columnLowers: string[];
  rows: Cell[][];
  start: number;
  width: number;
}

interface CompiledStep {
  kind: 'source' | 'join';
  joinType: 'inner' | 'left' | 'cross';
  source: SourceInfo;
  on: Expr | null;
}

type CompiledOrderTerm =
  | { kind: 'position'; index: number; desc: boolean }
  | { kind: 'expr'; expr: Expr; desc: boolean };

interface CompiledQuery {
  steps: CompiledStep[];
  totalColumns: number;
  distinct: boolean;
  where: Expr | null;
  agg: boolean;
  groupBy: Expr[] | null;
  having: Expr | null;
  outExprs: Expr[];
  outNames: string[];
  orderBy: CompiledOrderTerm[];
  limit: Expr | null;
  offset: Expr | null;
}

type Ctx = 'select' | 'where' | 'group' | 'having' | 'order' | 'limit';

interface GroupCtx {
  rows: Cell[][];
  first: Cell[];
  cache: Map<number, Cell>;
}

const tableCache = new WeakMap<TableData, { name: string; columns: string[]; rows: Cell[][] }>();

function loadTable(
  tables: Database,
  name: string,
): { name: string; columns: string[]; rows: Cell[][] } {
  const nl = name.toLowerCase();
  for (const key of Object.keys(tables)) {
    if (key.toLowerCase() === nl) {
      const data = tables[key];
      let cached = tableCache.get(data);
      if (!cached) {
        cached = {
          name: key,
          columns: data.columns,
          rows: data.rows.map((row) => row.map((v) => v as Cell)),
        };
        tableCache.set(data, cached);
      }
      return cached;
    }
  }
  throw new SqlError(`no such table: ${name}`);
}

function resolveColumn(
  sources: SourceInfo[],
  table: string | null,
  name: string,
): { index: number; name: string } {
  const nl = name.toLowerCase();
  if (table !== null) {
    const tl = table.toLowerCase();
    for (const s of sources) {
      if (s.aliasLower === tl) {
        const idx = s.columnLowers.indexOf(nl);
        if (idx < 0) throw new SqlError(`no such column: ${table}.${name}`);
        return { index: s.start + idx, name: s.columnNames[idx] };
      }
    }
    throw new SqlError(`no such column: ${table}.${name}`);
  }
  let found = -1;
  let count = 0;
  let foundName = name;
  for (const s of sources) {
    const idx = s.columnLowers.indexOf(nl);
    if (idx >= 0) {
      count++;
      found = s.start + idx;
      foundName = s.columnNames[idx];
    }
  }
  if (count === 0) throw new SqlError(`no such column: ${name}`);
  if (count > 1) throw new SqlError(`ambiguous column name: ${name}`);
  return { index: found, name: foundName };
}

export function compileQuery(tables: Database, stmt: SelectStmt): CompiledQuery {
  const sources: SourceInfo[] = [];
  const steps: CompiledStep[] = [];
  let offset = 0;
  if (stmt.from) {
    for (const step of stmt.from) {
      const table = loadTable(tables, step.table);
      const alias = step.alias ?? table.name;
      const info: SourceInfo = {
        alias,
        aliasLower: alias.toLowerCase(),
        columnNames: table.columns,
        columnLowers: table.columns.map((c) => c.toLowerCase()),
        rows: table.rows,
        start: offset,
        width: table.columns.length,
      };
      sources.push(info);
      offset += info.width;
      steps.push({
        kind: step.kind,
        joinType: step.joinType ?? 'cross',
        source: info,
        on: step.on ?? null,
      });
    }
  }
  const totalColumns = offset;

  let aggIdCounter = 0;

  const bind = (e: Expr, ctx: Ctx, insideAgg: boolean): void => {
    if (e.bound) return;
    bindInner(e, ctx, insideAgg);
    e.bound = true;
  };

  const bindInner = (e: Expr, ctx: Ctx, insideAgg: boolean): void => {
    switch (e.type) {
      case 'literal':
        e.hasAgg = false;
        return;
      case 'column': {
        if (ctx === 'limit') throw new SqlError(`no such column: ${e.name}`);
        const r = resolveColumn(sources, e.table ?? null, e.name!);
        e.index = r.index;
        e.name = r.name;
        e.table = null;
        e.hasAgg = false;
        return;
      }
      case 'unary':
      case 'not':
        bind(e.expr!, ctx, insideAgg);
        e.hasAgg = e.expr!.hasAgg;
        return;
      case 'binary':
      case 'and':
      case 'or':
      case 'is':
        bind(e.left!, ctx, insideAgg);
        bind(e.right!, ctx, insideAgg);
        e.hasAgg = !!(e.left!.hasAgg || e.right!.hasAgg);
        return;
      case 'isNull':
        bind(e.expr!, ctx, insideAgg);
        e.hasAgg = e.expr!.hasAgg;
        return;
      case 'in':
        bind(e.expr!, ctx, insideAgg);
        for (const item of e.list!) bind(item, ctx, insideAgg);
        e.hasAgg = e.expr!.hasAgg || e.list!.some((x) => x.hasAgg);
        return;
      case 'between':
        bind(e.expr!, ctx, insideAgg);
        bind(e.low!, ctx, insideAgg);
        bind(e.high!, ctx, insideAgg);
        e.hasAgg = !!(e.expr!.hasAgg || e.low!.hasAgg || e.high!.hasAgg);
        return;
      case 'like':
        bind(e.expr!, ctx, insideAgg);
        bind(e.pattern!, ctx, insideAgg);
        e.hasAgg = !!(e.expr!.hasAgg || e.pattern!.hasAgg);
        return;
      case 'case':
        if (e.base) bind(e.base, ctx, insideAgg);
        for (const w of e.whens!) {
          bind(w.when, ctx, insideAgg);
          bind(w.then, ctx, insideAgg);
        }
        if (e.else) bind(e.else, ctx, insideAgg);
        e.hasAgg = !!(
          (e.base && e.base.hasAgg) ||
          (e.else && e.else.hasAgg) ||
          e.whens!.some((w) => w.when.hasAgg || w.then.hasAgg)
        );
        return;
      case 'func': {
        const name = e.name!.toLowerCase();
        if (AGGREGATES.has(name)) {
          if (ctx === 'where') throw new SqlError(`misuse of aggregate: ${name}()`);
          if (ctx === 'group') throw new SqlError(`misuse of aggregate: ${name}()`);
          if (insideAgg) throw new SqlError(`misuse of aggregate function ${name}()`);
          if (e.star) {
            if (name !== 'count') throw scalarArityError(name);
          } else if (e.args!.length !== 1) {
            throw scalarArityError(name);
          }
          if (!e.star) {
            for (const a of e.args!) bind(a, ctx, true);
          }
          e.hasAgg = true;
          e.aggId = aggIdCounter++;
          return;
        }
        const def = SCALAR_FUNCTIONS[name];
        if (!def) throw new SqlError(`no such function: ${name}`);
        if (e.distinct) throw new SqlError(`DISTINCT is not supported for function ${name}()`);
        if (e.star) throw scalarArityError(name);
        const argc = e.args!.length;
        if (argc < def.minArgs || argc > def.maxArgs) throw scalarArityError(name);
        for (const a of e.args!) bind(a, ctx, insideAgg);
        e.hasAgg = e.args!.some((a) => a.hasAgg);
        return;
      }
    }
  };

  for (const s of steps) {
    if (s.on) bind(s.on, 'where', false);
  }

  const outExprs: Expr[] = [];
  const outNames: string[] = [];
  for (const item of stmt.items) {
    if (item.kind === 'star') {
      if (!stmt.from || sources.length === 0) throw new SqlError('no tables specified');
      for (const s of sources) {
        for (let k = 0; k < s.width; k++) {
          outExprs.push({
            type: 'column',
            index: s.start + k,
            name: s.columnNames[k],
            hasAgg: false,
          });
          outNames.push(s.columnNames[k]);
        }
      }
    } else if (item.kind === 'tableStar') {
      const src = sources.find((s) => s.aliasLower === item.table!.toLowerCase());
      if (!src) throw new SqlError(`no such table: ${item.table}`);
      for (let k = 0; k < src.width; k++) {
        outExprs.push({
          type: 'column',
          index: src.start + k,
          name: src.columnNames[k],
          hasAgg: false,
        });
        outNames.push(src.columnNames[k]);
      }
    } else {
      const e = item.expr!;
      bind(e, 'select', false);
      outExprs.push(e);
      outNames.push(item.alias ?? (e.type === 'column' ? e.name! : item.text!));
    }
  }

  const findAlias = (name: string): number => {
    const l = name.toLowerCase();
    for (let k = 0; k < outNames.length; k++) {
      if (outNames[k].toLowerCase() === l) return k;
    }
    return -1;
  };

  const substituteAliases = (e: Expr): Expr => {
    if (e.type === 'column' && e.table === null && !e.bound) {
      const ai = findAlias(e.name!);
      if (ai >= 0) return outExprs[ai];
      return e;
    }
    switch (e.type) {
      case 'unary':
      case 'not':
        e.expr = substituteAliases(e.expr!);
        break;
      case 'binary':
      case 'and':
      case 'or':
      case 'is':
        e.left = substituteAliases(e.left!);
        e.right = substituteAliases(e.right!);
        break;
      case 'isNull':
        e.expr = substituteAliases(e.expr!);
        break;
      case 'in':
        e.expr = substituteAliases(e.expr!);
        e.list = e.list!.map(substituteAliases);
        break;
      case 'between':
        e.expr = substituteAliases(e.expr!);
        e.low = substituteAliases(e.low!);
        e.high = substituteAliases(e.high!);
        break;
      case 'like':
        e.expr = substituteAliases(e.expr!);
        e.pattern = substituteAliases(e.pattern!);
        break;
      case 'case':
        if (e.base) e.base = substituteAliases(e.base);
        e.whens = e.whens!.map((w) => ({
          when: substituteAliases(w.when),
          then: substituteAliases(w.then),
        }));
        if (e.else) e.else = substituteAliases(e.else);
        break;
      default:
        break;
    }
    return e;
  };

  const containsAggregate = (e: Expr): boolean => {
    if (e.hasAgg) return true;
    switch (e.type) {
      case 'unary':
      case 'not':
        return containsAggregate(e.expr!);
      case 'binary':
      case 'and':
      case 'or':
      case 'is':
        return containsAggregate(e.left!) || containsAggregate(e.right!);
      case 'isNull':
        return containsAggregate(e.expr!);
      case 'in':
        return containsAggregate(e.expr!) || e.list!.some(containsAggregate);
      case 'between':
        return (
          containsAggregate(e.expr!) ||
          containsAggregate(e.low!) ||
          containsAggregate(e.high!)
        );
      case 'like':
        return containsAggregate(e.expr!) || containsAggregate(e.pattern!);
      case 'case':
        return !!(
          (e.base && containsAggregate(e.base)) ||
          (e.else && containsAggregate(e.else)) ||
          e.whens!.some((w) => containsAggregate(w.when) || containsAggregate(w.then))
        );
      case 'func':
        return e.args!.some(containsAggregate);
      default:
        return false;
    }
  };

  let groupBy: Expr[] | null = null;
  if (stmt.groupBy) {
    groupBy = stmt.groupBy.map((g): Expr => {
      if (g.type === 'literal' && typeof g.value === 'number' && Number.isInteger(g.value)) {
        const idx = g.value;
        if (idx < 1 || idx > outExprs.length) {
          throw new SqlError(`GROUP BY term out of range: ${idx}`);
        }
        const e = outExprs[idx - 1];
        if (e.hasAgg) throw new SqlError('misuse of aggregate in GROUP BY');
        return e;
      }
      const sub = substituteAliases(g);
      if (containsAggregate(sub)) throw new SqlError('misuse of aggregate in GROUP BY');
      bind(sub, 'group', false);
      return sub;
    });
  }

  let having: Expr | null = null;
  if (stmt.having) {
    having = substituteAliases(stmt.having);
    bind(having, 'having', false);
  }

  const orderBy: CompiledOrderTerm[] = [];
  for (const term of stmt.orderBy ?? []) {
    const e = term.expr;
    if (e.type === 'literal' && typeof e.value === 'number' && Number.isInteger(e.value)) {
      const idx = e.value;
      if (idx < 1 || idx > outExprs.length) {
        throw new SqlError(`ORDER BY term out of range: ${idx}`);
      }
      orderBy.push({ kind: 'position', index: idx - 1, desc: term.desc });
      continue;
    }
    if (e.type === 'column' && e.table === null) {
      const ai = findAlias(e.name!);
      if (ai >= 0) {
        orderBy.push({ kind: 'position', index: ai, desc: term.desc });
        continue;
      }
    }
    bind(e, 'order', false);
    orderBy.push({ kind: 'expr', expr: e, desc: term.desc });
  }

  if (stmt.limit) bind(stmt.limit, 'limit', false);
  if (stmt.offset) bind(stmt.offset, 'limit', false);

  const anyAgg = outExprs.some((e) => e.hasAgg) || orderBy.some((t) => t.kind === 'expr' && t.expr.hasAgg);
  const agg = !!groupBy || anyAgg || !!having;

  if (stmt.where) bind(stmt.where, 'where', false);

  return {
    steps,
    totalColumns,
    distinct: stmt.distinct,
    where: stmt.where,
    agg,
    groupBy,
    having,
    outExprs,
    outNames,
    orderBy,
    limit: stmt.limit,
    offset: stmt.offset,
  };
}

function nullRow(width: number): Cell[] {
  const a = new Array<Cell>(width);
  a.fill(null);
  return a;
}

function collectIndexes(e: Expr, out: number[]): boolean {
  if (e.hasAgg) return false;
  switch (e.type) {
    case 'literal':
      return true;
    case 'column':
      out.push(e.index!);
      return true;
    case 'unary':
    case 'not':
      return collectIndexes(e.expr!, out);
    case 'binary':
    case 'and':
    case 'or':
    case 'is':
      return collectIndexes(e.left!, out) && collectIndexes(e.right!, out);
    case 'isNull':
      return collectIndexes(e.expr!, out);
    case 'in': {
      if (!collectIndexes(e.expr!, out)) return false;
      for (const item of e.list!) if (!collectIndexes(item, out)) return false;
      return true;
    }
    case 'between':
      return (
        collectIndexes(e.expr!, out) &&
        collectIndexes(e.low!, out) &&
        collectIndexes(e.high!, out)
      );
    case 'like':
      return collectIndexes(e.expr!, out) && collectIndexes(e.pattern!, out);
    case 'case': {
      if (e.base && !collectIndexes(e.base, out)) return false;
      for (const w of e.whens!) {
        if (!collectIndexes(w.when, out) || !collectIndexes(w.then, out)) return false;
      }
      if (e.else && !collectIndexes(e.else, out)) return false;
      return true;
    }
    case 'func': {
      for (const a of e.args!) if (!collectIndexes(a, out)) return false;
      return true;
    }
  }
}

interface EqInfo {
  leftKey: Expr;
  rightKey: Expr;
}

function extractEquality(on: Expr, rightStart: number): EqInfo | null {
  if (on.type === 'binary' && (on.op === '=' || on.op === '==')) {
    const lRefs: number[] = [];
    const rRefs: number[] = [];
    if (!collectIndexes(on.left!, lRefs)) return null;
    if (!collectIndexes(on.right!, rRefs)) return null;
    if (lRefs.every((i) => i < rightStart) && rRefs.every((i) => i >= rightStart)) {
      return { leftKey: on.left!, rightKey: on.right! };
    }
    if (rRefs.every((i) => i < rightStart) && lRefs.every((i) => i >= rightStart)) {
      return { leftKey: on.right!, rightKey: on.left! };
    }
    return null;
  }
  if (on.type === 'and') {
    return extractEquality(on.left!, rightStart) ?? extractEquality(on.right!, rightStart);
  }
  return null;
}

function hashKey(e: Expr, row: Cell[]): string | null {
  const v = evalExpr(e, row);
  return v === null ? null : valueKey(v);
}

function joinStep(leftRows: Cell[][], step: CompiledStep, _totalColumns: number): Cell[][] {
  const src = step.source;
  const right = src.rows;
  const rightStart = src.start;
  const width = src.width;
  const on = step.on;

  if (step.joinType === 'cross' || !on) {
    const out: Cell[][] = [];
    for (const l of leftRows) {
      for (const r of right) out.push(l.concat(r));
    }
    return out;
  }

  const eq = extractEquality(on, rightStart);
  if (eq) {
    const prefix = nullRow(rightStart);
    const map = new Map<string, Cell[][]>();
    for (const r of right) {
      const k = hashKey(eq.rightKey, prefix.concat(r));
      if (k === null) continue;
      const bucket = map.get(k);
      if (bucket) bucket.push(r);
      else map.set(k, [r]);
    }
    const out: Cell[][] = [];
    for (const l of leftRows) {
      const k = hashKey(eq.leftKey, l);
      let matched = false;
      if (k !== null) {
        const bucket = map.get(k);
        if (bucket) {
          for (const r of bucket) {
            const combined = l.concat(r);
            if (isTrueValue(evalExpr(on, combined))) {
              out.push(combined);
              matched = true;
            }
          }
        }
      }
      if (!matched && step.joinType === 'left') out.push(l.concat(nullRow(width)));
    }
    return out;
  }

  const out: Cell[][] = [];
  for (const l of leftRows) {
    let matched = false;
    for (const r of right) {
      const combined = l.concat(r);
      if (!isTrueValue(evalExpr(on, combined))) continue;
      out.push(combined);
      matched = true;
    }
    if (!matched && step.joinType === 'left') out.push(l.concat(nullRow(width)));
  }
  return out;
}

function buildFrom(q: CompiledQuery): Cell[][] {
  let rows: Cell[][] = [];
  for (let i = 0; i < q.steps.length; i++) {
    const step = q.steps[i];
    rows = i === 0 ? step.source.rows : joinStep(rows, step, q.totalColumns);
  }
  if (q.steps.length === 0) return [[]];
  return rows;
}

function evalAggregate(e: Expr, group: GroupCtx): Cell {
  const id = e.aggId!;
  if (group.cache.has(id)) return group.cache.get(id)!;
  const name = e.name!;
  const args = e.args ?? [];
  let result: Cell = null;
  if (name === 'count') {
    if (e.star) {
      result = group.rows.length;
    } else {
      const seen = e.distinct ? new Set<string>() : null;
      let n = 0;
      for (const r of group.rows) {
        const v = evalExpr(args[0], r, group);
        if (v === null) continue;
        if (seen) {
          const k = valueKey(v);
          if (seen.has(k)) continue;
          seen.add(k);
        }
        n++;
      }
      result = n;
    }
  } else {
    let count = 0;
    let sum = 0;
    let allInt = true;
    let min: Cell = null;
    let max: Cell = null;
    const seen = e.distinct ? new Set<string>() : null;
    for (const r of group.rows) {
      const v = evalExpr(args[0], r, group);
      if (v === null) continue;
      if (seen) {
        const k = valueKey(v);
        if (seen.has(k)) continue;
        seen.add(k);
      }
      count++;
      const nv = numeric(v)!;
      if (name === 'sum' || name === 'avg') {
        if (isRealVal(nv)) allInt = false;
        sum += numOf(nv);
      } else if (name === 'min') {
        if (min === null || compareCells(v, min) < 0) min = v;
      } else if (name === 'max') {
        if (max === null || compareCells(v, max) > 0) max = v;
      }
    }
    if (name === 'sum') result = count === 0 ? null : allInt ? sum : makeReal(sum);
    else if (name === 'avg') result = count === 0 ? null : makeReal(sum / count);
    else if (name === 'min') result = min;
    else result = max;
  }
  group.cache.set(id, result);
  return result;
}

function evalExpr(e: Expr, row: Cell[], group?: GroupCtx): Cell {
  switch (e.type) {
    case 'literal':
      return e.value!;
    case 'column': {
      const v = row[e.index!];
      return v === undefined ? null : v;
    }
    case 'unary':
      return negValue(evalExpr(e.expr!, row, group));
    case 'not':
      return not3(truth3(evalExpr(e.expr!, row, group)));
    case 'and': {
      const a = truth3(evalExpr(e.left!, row, group));
      if (a === 0) return 0;
      const b = truth3(evalExpr(e.right!, row, group));
      return and3(a, b);
    }
    case 'or': {
      const a = truth3(evalExpr(e.left!, row, group));
      if (a === 1) return 1;
      const b = truth3(evalExpr(e.right!, row, group));
      return or3(a, b);
    }
    case 'binary': {
      const l = evalExpr(e.left!, row, group);
      const r = evalExpr(e.right!, row, group);
      switch (e.op) {
        case '+':
          return addValues(l, r);
        case '-':
          return subValues(l, r);
        case '*':
          return mulValues(l, r);
        case '/':
          return divValues(l, r);
        case '%':
          return modValues(l, r);
        case '||':
          return concatValues(l, r);
        default: {
          if (l === null || r === null) return null;
          const c = compareCells(l, r);
          switch (e.op) {
            case '=':
            case '==':
              return c === 0 ? 1 : 0;
            case '!=':
            case '<>':
              return c !== 0 ? 1 : 0;
            case '<':
              return c < 0 ? 1 : 0;
            case '<=':
              return c <= 0 ? 1 : 0;
            case '>':
              return c > 0 ? 1 : 0;
            case '>=':
              return c >= 0 ? 1 : 0;
            default:
              throw new SqlError(`unknown operator: ${e.op}`);
          }
        }
      }
    }
    case 'is': {
      const l = evalExpr(e.left!, row, group);
      const r = evalExpr(e.right!, row, group);
      if (l === null && r === null) return 1;
      if (l === null || r === null) return 0;
      return compareCells(l, r) === 0 ? 1 : 0;
    }
    case 'isNull': {
      const v = evalExpr(e.expr!, row, group);
      const isNull = v === null ? 1 : 0;
      return e.not ? (isNull === 1 ? 0 : 1) : isNull;
    }
    case 'in': {
      const v = evalExpr(e.expr!, row, group);
      if (v === null) return null;
      let sawNull = false;
      for (const item of e.list!) {
        const iv = evalExpr(item, row, group);
        if (iv === null) {
          sawNull = true;
          continue;
        }
        if (compareCells(v, iv) === 0) return e.not ? 0 : 1;
      }
      let res: Cell = sawNull ? null : 0;
      if (e.not) res = res === null ? null : 1;
      return res;
    }
    case 'between': {
      const v = evalExpr(e.expr!, row, group);
      const lo = evalExpr(e.low!, row, group);
      const hi = evalExpr(e.high!, row, group);
      const c1: 0 | 1 | null =
        v === null || lo === null ? null : compareCells(v, lo) >= 0 ? 1 : 0;
      const c2: 0 | 1 | null =
        v === null || hi === null ? null : compareCells(v, hi) <= 0 ? 1 : 0;
      const r = and3(c1, c2);
      return e.not ? not3(r) : r;
    }
    case 'like': {
      const v = evalExpr(e.expr!, row, group);
      const p = evalExpr(e.pattern!, row, group);
      const r = likeValues(v, p);
      return e.not ? not3(truth3(r)) : r;
    }
    case 'case': {
      const base = e.base ? evalExpr(e.base, row, group) : null;
      for (const w of e.whens!) {
        if (e.base) {
          if (base === null) continue;
          const wv = evalExpr(w.when, row, group);
          if (wv === null) continue;
          if (compareCells(base, wv) === 0) return evalExpr(w.then, row, group);
        } else if (isTrueValue(evalExpr(w.when, row, group))) {
          return evalExpr(w.then, row, group);
        }
      }
      return e.else ? evalExpr(e.else, row, group) : null;
    }
    case 'func': {
      const name = e.name!;
      if (AGGREGATES.has(name)) {
        if (!group) throw new SqlError(`misuse of aggregate: ${name}()`);
        return evalAggregate(e, group);
      }
      const def = SCALAR_FUNCTIONS[name];
      if (!def) throw new SqlError(`no such function: ${name}`);
      const args = (e.args ?? []).map((a) => evalExpr(a, row, group));
      return def.fn(args);
    }
  }
}

function groupKey(exprs: Expr[], row: Cell[]): string {
  if (exprs.length === 1) return valueKey(evalExpr(exprs[0], row));
  let s = '';
  for (const e of exprs) {
    const k = valueKey(evalExpr(e, row));
    s += k.length + ':' + k + ',';
  }
  return s;
}

function rowKey(row: Cell[]): string {
  let s = '';
  for (const v of row) {
    const k = valueKey(v);
    s += k.length + ':' + k + ',';
  }
  return s;
}

function toPublic(v: Cell): SqlValue {
  return isBoxedReal(v) ? v.r : (v as SqlValue);
}

function limitValue(v: Cell): number | null {
  if (v === null) return null;
  const n = numeric(v);
  if (n === null) return null;
  return Math.trunc(numOf(n));
}

export function execute(tables: Database, stmt: SelectStmt): QueryResult {
  const q = compileQuery(tables, stmt);
  const rows = buildFrom(q);
  const filtered = q.where ? rows.filter((r) => isTrueValue(evalExpr(q.where!, r))) : rows;

  let outRows: Cell[][] = [];
  let orderKeys: Cell[][] | null = null;

  if (q.agg) {
    const groups = new Map<string, Cell[][]>();
    if (q.groupBy) {
      for (const r of filtered) {
        const k = groupKey(q.groupBy, r);
        const g = groups.get(k);
        if (g) g.push(r);
        else groups.set(k, [r]);
      }
    } else {
      groups.set('', filtered);
    }
    const fallback = nullRow(q.totalColumns);
    for (const grows of groups.values()) {
      const ctx: GroupCtx = {
        rows: grows,
        first: grows[0] ?? fallback,
        cache: new Map(),
      };
      if (q.having && !isTrueValue(evalExpr(q.having, ctx.first, ctx))) continue;
      const out = q.outExprs.map((e) => evalExpr(e, ctx.first, ctx));
      outRows.push(out);
      if (q.orderBy.length) {
        orderKeys = orderKeys ?? [];
        orderKeys.push(
          q.orderBy.map((t) =>
            t.kind === 'position' ? out[t.index] : evalExpr(t.expr, ctx.first, ctx),
          ),
        );
      }
    }
    if (!orderKeys) orderKeys = null;
  } else {
    outRows = new Array(filtered.length);
    orderKeys = q.orderBy.length ? new Array(filtered.length) : null;
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
      const out = q.outExprs.map((e) => evalExpr(e, r));
      outRows[i] = out;
      if (orderKeys) {
        orderKeys[i] = q.orderBy.map((t) =>
          t.kind === 'position' ? out[t.index] : evalExpr(t.expr, r),
        );
      }
    }
  }

  if (q.distinct) {
    const seen = new Set<string>();
    const uniqueRows: Cell[][] = [];
    const uniqueKeys: Cell[][] | null = orderKeys ? [] : null;
    for (let i = 0; i < outRows.length; i++) {
      const k = rowKey(outRows[i]);
      if (seen.has(k)) continue;
      seen.add(k);
      uniqueRows.push(outRows[i]);
      if (uniqueKeys && orderKeys) uniqueKeys.push(orderKeys[i]);
    }
    outRows = uniqueRows;
    orderKeys = uniqueKeys;
  }

  if (q.orderBy.length && orderKeys) {
    const idx = outRows.map((_, i) => i);
    idx.sort((a, b) => {
      for (let t = 0; t < q.orderBy.length; t++) {
        const c = compareCells(orderKeys![a][t], orderKeys![b][t]);
        if (c !== 0) return q.orderBy[t].desc ? -c : c;
      }
      return a - b;
    });
    outRows = idx.map((i) => outRows[i]);
  }

  let start = 0;
  let end = outRows.length;
  if (q.offset) {
    const off = limitValue(evalExpr(q.offset, []));
    if (off !== null && off > 0) start = off;
  }
  if (q.limit) {
    const lim = limitValue(evalExpr(q.limit, []));
    if (lim !== null && lim >= 0) end = Math.min(end, start + lim);
  }
  if (start > 0 || end < outRows.length) outRows = outRows.slice(start, end);

  return {
    columns: q.outNames.slice(),
    rows: outRows.map((r) => r.map(toPublic)),
  };
}
