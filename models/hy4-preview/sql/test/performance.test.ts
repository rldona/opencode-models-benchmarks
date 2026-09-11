import { describe, expect, it } from "vitest";
import { executeQuery, type TablesInput } from "../src/index";

const BIG_ROWS = 100_000;
const SMALL_ROWS = 5_000;
const LIMIT_MS = 2_000;

function buildTables(): TablesInput {
  const bigRows: number[][] = new Array(BIG_ROWS);
  for (let i = 0; i < BIG_ROWS; i++) {
    bigRows[i] = [i, i % SMALL_ROWS, i % 97];
  }
  const smallRows: (number | string)[][] = new Array(SMALL_ROWS);
  for (let i = 0; i < SMALL_ROWS; i++) {
    smallRows[i] = [i, `n${i}`];
  }
  return {
    big: { columns: ["id", "fk", "v"], rows: bigRows },
    small: { columns: ["id", "name"], rows: smallRows },
  };
}

const tables = buildTables();

function measure(sql: string): { ms: number; rows: (number | string | null)[][] } {
  const start = performance.now();
  const result = executeQuery(tables, sql);
  return { ms: performance.now() - start, rows: result.rows };
}

describe("rendimiento", () => {
  it("JOIN por igualdad de 100.000 con 5.000 filas en menos de 2 segundos", () => {
    const { ms, rows } = measure(
      "SELECT COUNT(*), SUM(b.v), MIN(s.name), MAX(s.name) FROM big b JOIN small s ON b.fk = s.id",
    );
    expect(rows).toEqual([[BIG_ROWS, 4_799_685, "n0", "n999"]]);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it("JOIN por igualdad en el WHERE (tablas separadas por comas) en menos de 2 segundos", () => {
    const { ms, rows } = measure("SELECT COUNT(*) FROM big b, small s WHERE b.fk = s.id AND s.id < 100");
    expect(rows).toEqual([[BIG_ROWS / SMALL_ROWS * 100]]);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it("LEFT JOIN de 100.000 con 5.000 filas en menos de 2 segundos", () => {
    const { ms, rows } = measure(
      "SELECT COUNT(*), COUNT(s.id) FROM big b LEFT JOIN small s ON b.fk = s.id AND s.id < 100",
    );
    expect(rows).toEqual([[BIG_ROWS, 2_000]]);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it("GROUP BY de 100.000 filas en 5.000 grupos en menos de 2 segundos", () => {
    const { ms, rows } = measure("SELECT fk, COUNT(*), SUM(v) FROM big GROUP BY fk ORDER BY fk LIMIT 3");
    expect(rows).toEqual([
      [0, 20, 855],
      [1, 20, 875],
      [2, 20, 895],
    ]);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it("GROUP BY con HAVING y ORDER BY sobre 100.000 filas en menos de 2 segundos", () => {
    const { ms, rows } = measure(
      "SELECT v, COUNT(*) AS c FROM big GROUP BY v HAVING COUNT(*) > 0 ORDER BY c DESC, v DESC LIMIT 2",
    );
    expect(rows).toEqual([[89, 1031], [88, 1031]]);
    expect(ms).toBeLessThan(LIMIT_MS);
  });
});
