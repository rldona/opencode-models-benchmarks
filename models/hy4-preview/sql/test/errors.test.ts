import { describe, expect, it } from "vitest";
import { executeQuery, SqlError } from "../src/index";
import { defaultTables } from "./helpers";

function expectError(sql: string, pattern: RegExp, tables = defaultTables): void {
  expect(() => executeQuery(tables, sql)).toThrow(pattern);
}

describe("errores", () => {
  it("lanza SqlError con nombre y mensaje", () => {
    try {
      executeQuery(defaultTables, "SELECT * FROM nope");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SqlError);
      expect(e).toBeInstanceOf(Error);
      expect((e as SqlError).message).toBe("no such table: nope");
    }
  });

  it("detecta errores de sintaxis", () => {
    expectError("SELECT", /syntax error/i);
    expectError("SELECT 1 +", /syntax error/i);
    expectError("SELECT * FROM", /syntax error/i);
    expectError("SELECT * people", /syntax error/i);
    expectError("SELECT id FROM people WHERE", /syntax error/i);
    expectError("SELEC 1", /syntax error/i);
    expectError("SELECT CASE WHEN 1 THEN 2 FROM people", /syntax error/i);
  });

  it("detecta tablas inexistentes", () => {
    expectError("SELECT * FROM missing", /no such table: missing/i);
    expectError("SELECT x.* FROM people", /no such table: x/i);
    expectError("SELECT * FROM people JOIN missing ON 1 = 1", /no such table: missing/i);
  });

  it("detecta columnas inexistentes", () => {
    expectError("SELECT nope FROM people", /no such column: nope/i);
    expectError("SELECT people.nope FROM people", /no such column: people.nope/i);
    expectError("SELECT x.nope FROM people p", /no such column: x.nope/i);
    expectError("SELECT * FROM people WHERE nope > 1", /no such column: nope/i);
    expectError("SELECT * FROM people ORDER BY nope", /no such column: nope/i);
  });

  it("detecta columnas ambiguas", () => {
    const sql = "SELECT name FROM employees e JOIN departments d ON e.dept_id = d.id";
    expectError(sql, /ambiguous column name: name/i);
    expectError("SELECT * FROM employees, departments WHERE name = 'x'", /ambiguous/i);
  });

  it("detecta funciones desconocidas y aridad incorrecta", () => {
    expectError("SELECT FOO(1) FROM people", /no such function: FOO/i);
    expectError("SELECT ABS() FROM people", /wrong number of arguments to function ABS/i);
    expectError("SELECT ABS(1, 2) FROM people", /wrong number of arguments to function ABS/i);
    expectError("SELECT ROUND(1, 2, 3) FROM people", /wrong number of arguments to function ROUND/i);
  });

  it("detecta agregados mal usados", () => {
    expectError("SELECT * FROM people WHERE COUNT(*) > 1", /misuse of aggregate/i);
    expectError("SELECT * FROM people GROUP BY COUNT(*)", /misuse of aggregate/i);
    expectError("SELECT SUM(COUNT(*)) FROM people", /misuse of aggregate/i);
    expectError(
      "SELECT * FROM people p JOIN departments d ON COUNT(*) > 1",
      /misuse of aggregate/i,
    );
  });

  it("detecta posiciones de ORDER BY fuera de rango", () => {
    expectError("SELECT id FROM people ORDER BY 2", /1st ORDER BY term out of range - should be between 1 and 1/i);
    expectError("SELECT id FROM people ORDER BY 0", /1st ORDER BY term out of range - should be between 1 and 1/i);
    expectError("SELECT id, name FROM people ORDER BY 3", /1st ORDER BY term out of range - should be between 1 and 2/i);
    expectError("SELECT id FROM people ORDER BY 1, 5", /2nd ORDER BY term out of range - should be between 1 and 1/i);
    expectError(
      "SELECT id, name FROM people ORDER BY 1, 2, 3",
      /3rd ORDER BY term out of range - should be between 1 and 2/i,
    );
  });

  it("lanza el error aunque la tabla esté vacía (comprobación en tiempo de plan)", () => {
    const empty = { t: { columns: ["a"], rows: [] as number[][] } };
    expectError("SELECT FOO(a) FROM t", /no such function: FOO/i, empty);
    expectError("SELECT nope FROM t", /no such column: nope/i, empty);
  });
});
