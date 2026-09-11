import { describe, expect, it } from "vitest";
import { run, defaultTables } from "./helpers";

describe("ORDER BY, LIMIT y OFFSET", () => {
  it("coloca los NULL primero en ASC y al final en DESC", () => {
    expect(run(defaultTables, "SELECT name, age FROM people ORDER BY age")).toEqual([
      ["Dora", null],
      ["Beto", 25],
      ["Eva", 25],
      ["Ana", 30],
      ["Cid", 35],
    ]);
    expect(run(defaultTables, "SELECT name, age FROM people ORDER BY age DESC")).toEqual([
      ["Cid", 35],
      ["Ana", 30],
      ["Beto", 25],
      ["Eva", 25],
      ["Dora", null],
    ]);
  });

  it("ordena por varias claves con direcciones distintas", () => {
    const sql = "SELECT city, name FROM people ORDER BY city DESC, name ASC";
    expect(run(defaultTables, sql)).toEqual([
      ["Madrid", "Ana"],
      ["Madrid", "Cid"],
      ["Bilbao", "Beto"],
      ["Alicante", "Dora"],
      [null, "Eva"],
    ]);
  });

  it("ordena por expresiones y por posición", () => {
    expect(run(defaultTables, "SELECT name FROM people ORDER BY LENGTH(name) DESC, name LIMIT 2")).toEqual([
      ["Beto"],
      ["Dora"],
    ]);
    expect(run(defaultTables, "SELECT id, name FROM people ORDER BY 1 DESC LIMIT 1")).toEqual([[5, "Eva"]]);
    expect(run(defaultTables, "SELECT name FROM people ORDER BY age + 0 LIMIT 2")).toEqual([["Dora"], ["Beto"]]);
  });

  it("aplica LIMIT y OFFSET sobre el resultado ordenado", () => {
    expect(run(defaultTables, "SELECT id, name FROM people ORDER BY id LIMIT 2 OFFSET 1")).toEqual([
      [2, "Beto"],
      [3, "Cid"],
    ]);
    expect(run(defaultTables, "SELECT id FROM people ORDER BY id LIMIT 2, 1")).toEqual([[3]]);
    expect(run(defaultTables, "SELECT id FROM people ORDER BY id LIMIT 2 OFFSET 4")).toEqual([[5]]);
    expect(run(defaultTables, "SELECT id FROM people ORDER BY id LIMIT 2 OFFSET 10")).toEqual([]);
    expect(run(defaultTables, "SELECT id FROM people ORDER BY id OFFSET 3")).toEqual([[4], [5]]);
  });

  it("combina ORDER BY con NULL, LIMIT y OFFSET", () => {
    const sql = "SELECT name, age FROM people ORDER BY age ASC LIMIT 3 OFFSET 1";
    expect(run(defaultTables, sql)).toEqual([
      ["Beto", 25],
      ["Eva", 25],
      ["Ana", 30],
    ]);
    const sql2 = "SELECT name, age FROM people ORDER BY age DESC LIMIT 3 OFFSET 1";
    expect(run(defaultTables, sql2)).toEqual([
      ["Ana", 30],
      ["Beto", 25],
      ["Eva", 25],
    ]);
  });

  it("acepta LIMIT 0, LIMIT negativo y expresiones", () => {
    expect(run(defaultTables, "SELECT id FROM people LIMIT 0")).toEqual([]);
    expect(run(defaultTables, "SELECT id FROM people LIMIT -1")).toEqual([[1], [2], [3], [4], [5]]);
    expect(run(defaultTables, "SELECT id FROM people LIMIT 1 + 1")).toEqual([[1], [2]]);
  });

  it("ordena después de DISTINCT y antes de LIMIT", () => {
    expect(run(defaultTables, "SELECT DISTINCT age FROM people ORDER BY age DESC LIMIT 2")).toEqual([[35], [30]]);
  });
});
