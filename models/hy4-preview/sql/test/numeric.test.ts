import { describe, expect, it } from "vitest";
import { run, defaultTables } from "./helpers";

const reals = { r: { columns: ["x"], rows: [[2.5], [2.5], [1.25]] } };

describe("enteros frente a reales", () => {
  it("hace división entera truncando hacia cero cuando ambos operandos son enteros", () => {
    expect(run(defaultTables, "SELECT 7/2, -7/2, 7/-2, 6/3, 1/2")).toEqual([[3, -3, -3, 2, 0]]);
  });

  it("hace división real si algún operando es real", () => {
    expect(run(defaultTables, "SELECT 7/2.0, 7.0/2, 7.0/2.0, 6/3.0, 1/2.0")).toEqual([[3.5, 3.5, 3.5, 2, 0.5]]);
  });

  it("mantiene el signo del dividendo en el módulo", () => {
    expect(run(defaultTables, "SELECT 7 % 3, -7 % 3, 7 % -3, 7.5 % 2")).toEqual([[1, -1, 1, 1.5]]);
  });

  it("devuelve NULL al dividir o hacer módulo por cero", () => {
    expect(run(defaultTables, "SELECT 1/0, 1%0, 1.0/0, 0/0")).toEqual([[null, null, null, null]]);
  });

  it("trata 2 y 2.0 como iguales pero con formato de texto distinto", () => {
    expect(run(defaultTables, "SELECT 2 = 2.0, 2 < 2.5")).toEqual([[1, 1]]);
    expect(run(defaultTables, "SELECT 2 || '', 2.0 || ''")).toEqual([["2", "2.0"]]);
    expect(run(defaultTables, "SELECT LENGTH(2), LENGTH(2.0)")).toEqual([[1, 3]]);
  });

  it("devuelve AVG siempre real y SUM entero si todos los valores son enteros", () => {
    expect(run(defaultTables, "SELECT AVG(n) || '' FROM nums WHERE n IN (10, 20)")).toEqual([["15.0"]]);
    expect(run(defaultTables, "SELECT (SUM(n)/COUNT(n)) || '' FROM nums WHERE n IN (10, 20)")).toEqual([["15"]]);
    expect(run(defaultTables, "SELECT SUM(n) || '' FROM nums")).toEqual([["60"]]);
    expect(run(reals, "SELECT SUM(x) || '', AVG(x) || '' FROM r")).toEqual([["6.25", "2.08333333333333"]]);
  });

  it("redondea ROUND alejándose de cero", () => {
    expect(run(defaultTables, "SELECT ROUND(2.5), ROUND(-2.5), ROUND(0.5), ROUND(-0.5), ROUND(2)")).toEqual([
      [3, -3, 1, -1, 2],
    ]);
    expect(run(defaultTables, "SELECT ROUND(2.675, 2), ROUND(-2.675, 2), ROUND(123.456, -2), ROUND(1.2345, 3)")).toEqual([
      [2.67, -2.67, 100, 1.234],
    ]);
    expect(run(defaultTables, "SELECT ROUND(NULL), ROUND(2.5, NULL)")).toEqual([[null, null]]);
  });

  it("evalúa ABS, COALESCE, IFNULL y NULLIF", () => {
    expect(run(defaultTables, "SELECT ABS(-3), ABS(3.5), ABS(NULL)")).toEqual([[3, 3.5, null]]);
    expect(run(defaultTables, "SELECT COALESCE(NULL, NULL, 'x'), COALESCE(NULL, NULL)")).toEqual([["x", null]]);
    expect(run(defaultTables, "SELECT IFNULL(NULL, 7), IFNULL(3, 7)")).toEqual([[7, 3]]);
    expect(run(defaultTables, "SELECT NULLIF(3, 3), NULLIF(3, 4), NULLIF(NULL, 1), NULLIF(1, NULL)")).toEqual([
      [null, 3, null, 1],
    ]);
  });

  it("cambia solo letras ASCII en LOWER y UPPER", () => {
    expect(run(defaultTables, "SELECT UPPER('Ana'), LOWER('AnA'), UPPER('ñ1a'), LOWER('Ñ1A')")).toEqual([
      ["ANA", "ana", "ñ1A", "Ñ1a"],
    ]);
    expect(run(defaultTables, "SELECT UPPER(1) || '', LOWER(NULL)")).toEqual([["1", null]]);
  });

  it("convierte a texto los números en LENGTH y ||", () => {
    expect(run(defaultTables, "SELECT LENGTH(1234), LENGTH(1.5), LENGTH(NULL), LENGTH('')")).toEqual([[4, 3, null, 0]]);
  });

  it("convierte textos numéricos en operaciones aritméticas", () => {
    expect(run(defaultTables, "SELECT '3' + 1, '2.5' * 2, 'abc' + 5")).toEqual([[4, 5, 5]]);
  });

  it("convierte enteros grandes a real al desbordar", () => {
    expect(run(defaultTables, "SELECT (9223372036854775807 + 1) || ''")).toEqual([["9.22337203685478e+18"]]);
    expect(run(defaultTables, "SELECT 9223372036854775807 + 0")).toEqual([[9223372036854775807]]);
  });
});
