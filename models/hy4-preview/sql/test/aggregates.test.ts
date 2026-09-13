import { describe, expect, it } from "vitest";
import { run, defaultTables } from "./helpers";

describe("agregados y NULL", () => {
  it("ignora NULL en los agregados (COUNT cuenta, los demás lo descartan)", () => {
    const sql = "SELECT COUNT(*), COUNT(age), SUM(age), AVG(age), MIN(age), MAX(age) FROM people";
    expect(run(defaultTables, sql)).toEqual([[5, 4, 115, 28.75, 25, 35]]);
  });

  it("devuelve NULL en SUM/AVG/MIN/MAX sin valores y 0 en COUNT", () => {
    expect(run(defaultTables, "SELECT COUNT(*), COUNT(age), SUM(age), AVG(age), MIN(age) FROM people WHERE id = 4")).toEqual([
      [1, 0, null, null, null],
    ]);
    expect(run(defaultTables, "SELECT COUNT(*), SUM(age) FROM people WHERE 0")).toEqual([[0, null]]);
  });

  it("cuenta filas con COUNT(*) aunque haya NULL", () => {
    expect(run(defaultTables, "SELECT COUNT(*) FROM nums")).toEqual([[4]]);
    expect(run(defaultTables, "SELECT COUNT(n) FROM nums")).toEqual([[3]]);
  });

  it("soporta DISTINCT en los agregados", () => {
    expect(run(defaultTables, "SELECT COUNT(DISTINCT city) FROM people")).toEqual([[3]]);
    expect(run(defaultTables, "SELECT COUNT(DISTINCT age) FROM people")).toEqual([[3]]);
    expect(run(defaultTables, "SELECT SUM(DISTINCT age) FROM people")).toEqual([[90]]);
    expect(run(defaultTables, "SELECT COUNT(DISTINCT age) FROM people WHERE id = 4")).toEqual([[0]]);
  });

  it("aplica MIN y MAX con el orden de SQLite", () => {
    expect(run(defaultTables, "SELECT MIN(name), MAX(name) FROM people")).toEqual([["Ana", "Eva"]]);
    expect(run(defaultTables, "SELECT MIN(city), MAX(city) FROM people")).toEqual([["Alicante", "Madrid"]]);
  });

  it("agrupa por expresiones", () => {
    const sql = "SELECT age % 10 AS decena, COUNT(*) FROM people GROUP BY age % 10 ORDER BY 1";
    expect(run(defaultTables, sql)).toEqual([
      [null, 1],
      [0, 1],
      [5, 3],
    ]);
  });

  it("agrupa por columna con NULL", () => {
    const sql = "SELECT city, COUNT(*) FROM people GROUP BY city ORDER BY city";
    expect(run(defaultTables, sql)).toEqual([
      [null, 1],
      ["Alicante", 1],
      ["Bilbao", 1],
      ["Madrid", 2],
    ]);
  });

  it("filtra grupos con HAVING", () => {
    const sql = "SELECT city, COUNT(*) AS total FROM people GROUP BY city HAVING COUNT(*) > 1 ORDER BY city";
    expect(run(defaultTables, sql)).toEqual([["Madrid", 2]]);
  });

  it("HAVING con condiciones no agregadas y sin GROUP BY", () => {
    expect(run(defaultTables, "SELECT city, COUNT(*) FROM people GROUP BY city HAVING city IS NOT NULL ORDER BY city")).toEqual([
      ["Alicante", 1],
      ["Bilbao", 1],
      ["Madrid", 2],
    ]);
    expect(run(defaultTables, "SELECT COUNT(*) FROM people HAVING COUNT(*) > 4")).toEqual([[5]]);
    expect(run(defaultTables, "SELECT COUNT(*) FROM people HAVING COUNT(*) > 10")).toEqual([]);
  });

  it("devuelve una sola fila para agregados sin GROUP BY y ninguna si no hay grupos", () => {
    expect(run(defaultTables, "SELECT COUNT(*) FROM people")).toEqual([[5]]);
    expect(run(defaultTables, "SELECT city, COUNT(*) FROM people WHERE 0 GROUP BY city")).toEqual([]);
    expect(run(defaultTables, "SELECT COUNT(*) FROM people GROUP BY city ORDER BY 1")).toEqual([[1], [1], [1], [2]]);
  });

  it("ordena por agregados", () => {
    const sql = "SELECT city, COUNT(*) AS total FROM people GROUP BY city ORDER BY COUNT(*) DESC, city";
    expect(run(defaultTables, sql)).toEqual([
      ["Madrid", 2],
      [null, 1],
      ["Alicante", 1],
      ["Bilbao", 1],
    ]);
  });

  it("agrega sobre el resultado de un JOIN", () => {
    const sql = "SELECT d.name, COUNT(e.id), SUM(e.salary) FROM departments d LEFT JOIN employees e ON e.dept_id = d.id GROUP BY d.name ORDER BY d.name";
    expect(run(defaultTables, sql)).toEqual([
      ["IT", 1, 1500],
      ["Legal", 0, null],
      ["Ventas", 2, 3000],
    ]);
  });
});
