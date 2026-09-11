import { describe, expect, it } from "vitest";
import { cols, run, defaultTables } from "./helpers";

describe("FROM y JOIN", () => {
  it("hace el producto cartesiano de tablas separadas por comas", () => {
    expect(run(defaultTables, "SELECT COUNT(*) FROM employees, departments")).toEqual([[15]]);
    expect(run(defaultTables, "SELECT e.name, d.name FROM employees e, departments d WHERE e.dept_id = d.id ORDER BY e.id")).toEqual(
      [
        ["Ana", "Ventas"],
        ["Beto", "IT"],
        ["Cid", "Ventas"],
      ],
    );
  });

  it("resuelve JOIN e INNER JOIN con ON", () => {
    const sql = "SELECT e.name, d.name FROM employees e INNER JOIN departments d ON e.dept_id = d.id ORDER BY e.id";
    expect(run(defaultTables, sql)).toEqual([
      ["Ana", "Ventas"],
      ["Beto", "IT"],
      ["Cid", "Ventas"],
    ]);
  });

  it("aplica condiciones adicionales del ON", () => {
    const sql = "SELECT e.name FROM employees e JOIN departments d ON e.dept_id = d.id AND d.budget > 5000";
    expect(run(defaultTables, sql)).toEqual([["Beto"]]);
  });

  it("LEFT JOIN rellena con NULL las filas sin pareja", () => {
    const sql = "SELECT e.name, d.name FROM employees e LEFT JOIN departments d ON e.dept_id = d.id ORDER BY e.id";
    expect(run(defaultTables, sql)).toEqual([
      ["Ana", "Ventas"],
      ["Beto", "IT"],
      ["Cid", "Ventas"],
      ["Dora", null],
      ["Eva", null],
    ]);
  });

  it("LEFT OUTER JOIN conserva todas las filas de la izquierda", () => {
    const sql = "SELECT COUNT(*), COUNT(d.id) FROM employees e LEFT OUTER JOIN departments d ON e.dept_id = d.id";
    expect(run(defaultTables, sql)).toEqual([[5, 3]]);
  });

  it("LEFT JOIN con condición no equitativa", () => {
    const sql = "SELECT e.name, d.name FROM employees e LEFT JOIN departments d ON d.id = e.dept_id AND d.name <> 'IT' ORDER BY e.id, d.id";
    expect(run(defaultTables, sql)).toEqual([
      ["Ana", "Ventas"],
      ["Beto", null],
      ["Cid", "Ventas"],
      ["Dora", null],
      ["Eva", null],
    ]);
  });

  it("encadena varios JOIN", () => {
    const tables = {
      a: { columns: ["id", "b_id"], rows: [[1, 10], [2, 20]] },
      b: { columns: ["id", "c_id"], rows: [[10, 100], [20, 200]] },
      c: { columns: ["id", "label"], rows: [[100, "cien"], [200, "doscientos"]] },
    };
    const sql = "SELECT a.id, c.label FROM a JOIN b ON a.b_id = b.id JOIN c ON b.c_id = c.id ORDER BY a.id";
    expect(run(tables, sql)).toEqual([
      [1, "cien"],
      [2, "doscientos"],
    ]);
  });

  it("permite alias de tabla y califica columnas", () => {
    expect(run(defaultTables, "SELECT p.id, p.name FROM people AS p WHERE p.id > 3")).toEqual([
      [4, "Dora"],
      [5, "Eva"],
    ]);
    expect(cols(defaultTables, "SELECT e.* FROM employees e LIMIT 1")).toEqual(["id", "name", "dept_id", "salary"]);
  });

  it("oculta el nombre original de la tabla cuando hay alias", () => {
    expect(() => run(defaultTables, "SELECT employees.id FROM employees e")).toThrow(/no such column/i);
  });

  it("JOIN sobre igualdad con tablas sin filas", () => {
    const tables = {
      a: { columns: ["id"], rows: [[1]] },
      b: { columns: ["id"], rows: [] as number[][] },
    };
    expect(run(tables, "SELECT a.id FROM a JOIN b ON a.id = b.id")).toEqual([]);
    expect(run(tables, "SELECT a.id, b.id FROM a LEFT JOIN b ON a.id = b.id")).toEqual([[1, null]]);
  });
});
