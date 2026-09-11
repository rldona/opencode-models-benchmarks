import { executeQuery, type TablesInput } from "../src/index";

export function run(tables: TablesInput, sql: string): (number | string | null)[][] {
  return executeQuery(tables, sql).rows;
}

export function cols(tables: TablesInput, sql: string): string[] {
  return executeQuery(tables, sql).columns;
}

export const people = {
  columns: ["id", "name", "age", "city"],
  rows: [
    [1, "Ana", 30, "Madrid"],
    [2, "Beto", 25, "Bilbao"],
    [3, "Cid", 35, "Madrid"],
    [4, "Dora", null, "Alicante"],
    [5, "Eva", 25, null],
  ],
};

export const employees = {
  columns: ["id", "name", "dept_id", "salary"],
  rows: [
    [1, "Ana", 10, 1000],
    [2, "Beto", 20, 1500],
    [3, "Cid", 10, 2000],
    [4, "Dora", null, 1200],
    [5, "Eva", 30, 900],
  ],
};

export const departments = {
  columns: ["id", "name", "budget"],
  rows: [
    [10, "Ventas", 5000],
    [20, "IT", 8000],
    [40, "Legal", 1000],
  ],
};

export const nums = {
  columns: ["n"],
  rows: [[10], [20], [null], [30]],
};

export const defaultTables: TablesInput = { people, employees, departments, nums };
