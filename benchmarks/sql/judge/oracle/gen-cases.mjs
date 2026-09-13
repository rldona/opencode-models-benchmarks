// Genera ../hidden/cases.json ejecutando cada consulta de queries.mjs en SQLite (node:sqlite).
//   node benchmarks/sql/judge/oracle/gen-cases.mjs
// Cada consulta se ejecuta sobre tres cargas de los datos con distinto orden físico de filas (normal, invertido,
// barajado): si el resultado cambia, la consulta depende de un orden no definido y se rechaza.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dataset } from '../hidden/datasets.mjs';
import { queries } from './queries.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'hidden', 'cases.json');

// Literales SQL: los enteros entran como INTEGER y los reales como REAL (vincular un number de JS lo guardaría
// siempre como REAL y 7/2 daría 3.5).
function lit(v) {
  if (v === null) return 'NULL';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    const s = String(v);
    if (!/[.e]/.test(s)) throw new Error(`real sin punto decimal: ${v}`);
    return s;
  }
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  throw new Error(`valor no soportado: ${v}`);
}

function shuffled(rows, seed) {
  const a = [...rows];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function load(name, order) {
  const db = new DatabaseSync(':memory:');
  for (const [table, { columns, rows }] of Object.entries(dataset(name))) {
    db.exec(`CREATE TABLE "${table}" (${columns.map((c) => `"${c}"`).join(', ')})`);
    const ordered = order === 'reverse' ? [...rows].reverse() : order === 'shuffle' ? shuffled(rows, 42) : rows;
    db.exec('BEGIN');
    for (let i = 0; i < ordered.length; i += 500) {
      const values = ordered.slice(i, i + 500).map((r) => `(${r.map(lit).join(', ')})`);
      db.exec(`INSERT INTO "${table}" VALUES ${values.join(', ')}`);
    }
    db.exec('COMMIT');
  }
  return db;
}

function run(db, sql) {
  try {
    const st = db.prepare(sql);
    st.setReturnArrays(true);
    const rows = st.all();
    for (const row of rows) for (const v of row) if (typeof v === 'bigint') throw new Error('bigint en el resultado');
    return { rows };
  } catch (e) {
    return { error: e.message };
  }
}

const canon = (rows, ordered) => {
  const keys = rows.map((r) => JSON.stringify(r));
  return JSON.stringify(ordered ? keys : keys.sort());
};

const dbs = {};
const getDbs = (name) => (dbs[name] ??= ['normal', 'reverse', 'shuffle'].map((o) => load(name, o)));

const cases = [];
const problems = [];
queries.forEach((qq, i) => {
  const id = String(i + 1).padStart(3, '0');
  const ordered = /\border\s+by\b/i.test(qq.sql);
  const [a, b, c] = getDbs(qq.dataset).map((db) => run(db, qq.sql));
  if (qq.category === 'error') {
    if (!a.error || !b.error || !c.error) problems.push(`[${id}] ${qq.name}: se esperaba error y SQLite devolvió filas`);
  } else if (a.error) {
    problems.push(`[${id}] ${qq.name}: SQLite dio error: ${a.error}`);
  } else if (canon(a.rows, ordered) !== canon(b.rows, ordered) || canon(a.rows, ordered) !== canon(c.rows, ordered)) {
    problems.push(`[${id}] ${qq.name}: resultado no determinista (depende del orden físico de las filas)`);
  }
  cases.push({
    id,
    category: qq.category,
    name: qq.name,
    sql: qq.sql,
    dataset: qq.dataset,
    ...(qq.suite ? { suite: qq.suite } : {}),
    ordered,
    ...(qq.timeLimitMs ? { timeLimitMs: qq.timeLimitMs } : {}),
    expected: a.error ? { error: true, sqlite: a.error } : { rows: a.rows },
  });
});

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1) + '\n');
const byCat = cases.reduce((m, c) => ((m[c.category] = (m[c.category] ?? 0) + 1), m), {});
console.log(`${cases.length} casos → ${path.relative(process.cwd(), out)}`, byCat);
