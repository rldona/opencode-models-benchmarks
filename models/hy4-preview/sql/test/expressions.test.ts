import { describe, expect, it } from "vitest";
import { run, defaultTables } from "./helpers";

describe("operadores y lógica de tres valores", () => {
  it("compara números y tipos con el orden SQLite (NULL < número < texto)", () => {
    expect(run({}, "SELECT 1 = 1, 1 <> 2, 1 != 2, 2 > 1, 2 >= 2, 1 < 2, 1 <= 0")).toEqual([[1, 1, 1, 1, 1, 1, 0]]);
    expect(run({}, "SELECT 1 = '1', 'a' > 1, NULL = NULL, NULL IS NULL, 1 IS 1")).toEqual([[0, 1, null, 1, 1]]);
  });

  it("propaga NULL en comparaciones, aritmética y concatenación", () => {
    expect(run({}, "SELECT NULL + 1, 1 - NULL, NULL * 2, NULL / 2, NULL % 2, NULL || 'a'")).toEqual([
      [null, null, null, null, null, null],
    ]);
    expect(run(defaultTables, "SELECT age + 1 FROM people WHERE id = 4")).toEqual([[null]]);
  });

  it("aplica la lógica de tres valores en AND, OR y NOT", () => {
    expect(run({}, "SELECT NULL AND 0, NULL AND 1, NULL OR 0, NULL OR 1, NOT NULL, NOT 0, NOT 1")).toEqual([
      [0, null, null, 1, null, 1, 0],
    ]);
  });

  it("filtra filas con NULL en WHERE", () => {
    expect(run(defaultTables, "SELECT id FROM people WHERE NULL")).toEqual([]);
    expect(run(defaultTables, "SELECT id FROM people WHERE NULL AND 0")).toEqual([]);
    expect(run(defaultTables, "SELECT COUNT(*) FROM people WHERE NULL OR 1")).toEqual([[5]]);
    expect(run(defaultTables, "SELECT id FROM people WHERE NOT (age > 30)")).toEqual([[1], [2], [5]]);
  });

  it("evalúa IN, NOT IN y BETWEEN con NULL", () => {
    expect(run(defaultTables, "SELECT id FROM people WHERE age IN (25, 30) ORDER BY id")).toEqual([[1], [2], [5]]);
    expect(run(defaultTables, "SELECT id FROM people WHERE age NOT IN (25, 30)")).toEqual([[3]]);
    expect(run(defaultTables, "SELECT id FROM people WHERE age IN (25, NULL) ORDER BY id")).toEqual([[2], [5]]);
    expect(run(defaultTables, "SELECT id FROM people WHERE age NOT IN (25, NULL)")).toEqual([]);
    expect(run(defaultTables, "SELECT id FROM people WHERE age NOT IN (25, 30) OR age IS NULL")).toEqual([[3], [4]]);
    expect(run(defaultTables, "SELECT id FROM people WHERE age BETWEEN 25 AND 30 ORDER BY id")).toEqual([
      [1],
      [2],
      [5],
    ]);
    expect(run(defaultTables, "SELECT id FROM people WHERE age NOT BETWEEN 25 AND 30")).toEqual([[3]]);
    expect(run(defaultTables, "SELECT id FROM people WHERE age BETWEEN NULL AND 30")).toEqual([]);
  });

  it("evalúa LIKE sin distinguir mayúsculas ASCII", () => {
    expect(run(defaultTables, "SELECT name FROM people WHERE name LIKE 'a%'")).toEqual([["Ana"]]);
    expect(run(defaultTables, "SELECT name FROM people WHERE name LIKE '_n%'")).toEqual([["Ana"]]);
    expect(run(defaultTables, "SELECT name FROM people WHERE name NOT LIKE '%a' ORDER BY id")).toEqual([
      ["Beto"],
      ["Cid"],
    ]);
    expect(run({}, "SELECT 'abc' LIKE 'A%', 'abc' LIKE 'A_C', 'abc' LIKE 'ab', 'a%c' LIKE 'a\\%c' ESCAPE '\\'")).toEqual(
      [[1, 1, 0, 1]],
    );
    expect(run(defaultTables, "SELECT name FROM people WHERE name LIKE NULL")).toEqual([]);
  });

  it("convierte números a texto en ||, LIKE y LENGTH", () => {
    expect(run({}, "SELECT 1 || 'a', 2.5 || '', LENGTH(123), LENGTH(2.0)")).toEqual([["1a", "2.5", 3, 3]]);
    expect(run({}, "SELECT 25 LIKE '2%'")).toEqual([[1]]);
  });

  it("aplica la precedencia de SQLite (|| > * / % > + - > comparación > NOT > AND > OR)", () => {
    expect(run({}, "SELECT 1 || 2 * 3")).toEqual([[36]]);
    expect(run({}, "SELECT 2 + 3 * 4")).toEqual([[14]]);
    expect(run({}, "SELECT (2 + 3) * 4")).toEqual([[20]]);
    expect(run({}, "SELECT 1 + 1 = 2")).toEqual([[1]]);
    expect(run({}, "SELECT NOT 1 = 2")).toEqual([[1]]);
    expect(run({}, "SELECT 1 = 1 AND 0 = 1 OR 1 = 1")).toEqual([[1]]);
    expect(run({}, "SELECT 0 = 1 AND 0 = 1 OR 0 = 1")).toEqual([[0]]);
    expect(run({}, "SELECT -2 + 3, - 2 * 3, - (2 + 3)")).toEqual([[1, -6, -5]]);
  });

  it("evalúa CASE con y sin expresión base", () => {
    const sql =
      "SELECT CASE WHEN age IS NULL THEN 'unknown' WHEN age < 30 THEN 'young' ELSE 'old' END FROM people ORDER BY id";
    expect(run(defaultTables, sql)).toEqual([["old"], ["young"], ["old"], ["unknown"], ["young"]]);
    expect(run(defaultTables, "SELECT CASE age WHEN 25 THEN 'quarter' ELSE 'other' END FROM people ORDER BY id")).toEqual(
      [["other"], ["quarter"], ["other"], ["other"], ["quarter"]],
    );
    expect(run(defaultTables, "SELECT CASE WHEN id > 10 THEN 1 END FROM people WHERE id = 1")).toEqual([[null]]);
  });

  it("evalúa paréntesis y expresiones anidadas", () => {
    expect(run(defaultTables, "SELECT (age + 1) * 2 FROM people WHERE id = 1")).toEqual([[62]]);
  });
});
