import { describe, expect, it } from "vitest";
import { cols, run, defaultTables, people } from "./helpers";

describe("SELECT básico", () => {
  it("proyecta columnas y filtra con WHERE", () => {
    expect(run(defaultTables, "SELECT id, name FROM people WHERE age > 25")).toEqual([
      [1, "Ana"],
      [3, "Cid"],
    ]);
  });

  it("acepta punto y coma final y comentarios", () => {
    expect(run(defaultTables, "SELECT id FROM people WHERE id = 1;")).toEqual([[1]]);
    expect(run(defaultTables, "-- comment\nSELECT id FROM people WHERE id = 1")).toEqual([[1]]);
  });

  it("no distingue mayúsculas en palabras clave ni identificadores", () => {
    expect(run(defaultTables, "select ID from PEOPLE where CITY = 'Madrid'")).toEqual([[1], [3]]);
    expect(run(defaultTables, "SeLeCt Id FrOm people")).toEqual([[1], [2], [3], [4], [5]]);
  });

  it("compara textos byte a byte (mayúsculas antes que minúsculas)", () => {
    expect(run({}, "SELECT 'Z' < 'a', 'a' < 'B', 'abc' < 'abd'")).toEqual([[1, 0, 1]]);
  });

  it("evalúa expresiones sin FROM", () => {
    expect(run({}, "SELECT 1 + 1")).toEqual([[2]]);
    expect(run({}, "SELECT 2 * 3, 'a' || 'b', NULL")).toEqual([[6, "ab", null]]);
  });

  it("expande * y tabla.*", () => {
    expect(cols(defaultTables, "SELECT * FROM people")).toEqual(["id", "name", "age", "city"]);
    expect(cols(defaultTables, "SELECT people.* FROM people")).toEqual(["id", "name", "age", "city"]);
    expect(run(defaultTables, "SELECT people.* FROM people WHERE id = 1")).toEqual([[1, "Ana", 30, "Madrid"]]);
  });

  it("permite nombres de columna repetidos", () => {
    const sql = "SELECT e.id, d.id FROM employees e JOIN departments d ON e.dept_id = d.id ORDER BY e.id";
    expect(cols(defaultTables, sql)).toEqual(["id", "id"]);
    expect(run(defaultTables, sql)).toEqual([
      [1, 10],
      [2, 20],
      [3, 10],
    ]);
  });

  it("aplica alias con y sin AS y nombra expresiones como SQLite", () => {
    expect(cols(defaultTables, "SELECT id AS cod FROM people")).toEqual(["cod"]);
    expect(cols(defaultTables, "SELECT id cod FROM people")).toEqual(["cod"]);
    expect(cols(defaultTables, "SELECT 1 + 1")).toEqual(["1 + 1"]);
    expect(cols(defaultTables, "SELECT COUNT(*) FROM people")).toEqual(["COUNT(*)"]);
  });

  it("soporta DISTINCT", () => {
    expect(run(defaultTables, "SELECT DISTINCT city FROM people ORDER BY city")).toEqual([
      [null],
      ["Alicante"],
      ["Bilbao"],
      ["Madrid"],
    ]);
    expect(run(defaultTables, "SELECT DISTINCT age FROM people ORDER BY age")).toEqual([
      [null],
      [25],
      [30],
      [35],
    ]);
  });

  it("devuelve cero filas si WHERE no cumple y una fila para agregados sin GROUP BY", () => {
    expect(run(defaultTables, "SELECT id FROM people WHERE 0")).toEqual([]);
    expect(run(defaultTables, "SELECT COUNT(*) FROM people WHERE 0")).toEqual([[0]]);
    expect(run(defaultTables, "SELECT SUM(age) FROM people WHERE 0")).toEqual([[null]]);
  });

  it("acepta identificadores entre comillas dobles", () => {
    expect(run(defaultTables, 'SELECT "id", "name" FROM "people" WHERE "id" = 1')).toEqual([[1, "Ana"]]);
  });

  it("acepta tablas como diccionario de registros", () => {
    expect(
      run({ t: [{ a: 1, b: "x" }, { a: 2, b: "y" }] } as never, "SELECT b FROM t WHERE a = 2"),
    ).toEqual([["y"]]);
  });

  it("ordena por alias de salida y por posición", () => {
    expect(run(defaultTables, "SELECT name AS n FROM people ORDER BY n DESC LIMIT 1")).toEqual([["Eva"]]);
    expect(run(defaultTables, "SELECT id, name FROM people ORDER BY 1 DESC LIMIT 1")).toEqual([[5, "Eva"]]);
  });

  it("filtra con IS NULL / IS NOT NULL", () => {
    expect(run(defaultTables, "SELECT name FROM people WHERE age IS NULL")).toEqual([["Dora"]]);
    expect(run(defaultTables, "SELECT name FROM people WHERE age IS NOT NULL ORDER BY id")).toEqual([
      ["Ana"],
      ["Beto"],
      ["Cid"],
      ["Eva"],
    ]);
  });

  it("trata cualquier número distinto de cero como verdadero en WHERE", () => {
    expect(run(defaultTables, "SELECT id FROM people WHERE id - 3")).toEqual([[1], [2], [4], [5]]);
  });

  it("expone las tablas de entrada sin mutarlas", () => {
    const snapshot = JSON.stringify(people.rows);
    run(defaultTables, "SELECT * FROM people");
    expect(JSON.stringify(people.rows)).toBe(snapshot);
  });
});
