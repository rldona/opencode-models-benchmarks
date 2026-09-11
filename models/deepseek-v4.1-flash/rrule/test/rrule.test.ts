import { describe, expect, it } from "vitest";
import { expandRRule } from "../src";
import { partsInZone } from "../src/timezone";

const MADRID = "Europe/Madrid";

function iso(dates: Date[]): string[] {
  return dates.map((date) => date.toISOString());
}

function local(dates: Date[]): string[] {
  return dates.map((date) => {
    const parts = partsInZone(date.getTime(), MADRID);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
  });
}

describe("subconjunto RRULE", () => {
  it("mantiene la hora local de un evento semanal al cruzar el cambio de hora de octubre en Europe/Madrid", () => {
    const occurrences = expandRRule(
      "2026-10-11T10:00:00",
      "FREQ=WEEKLY;COUNT=4",
      MADRID,
      "2026-10-01T00:00:00",
      "2026-12-01T00:00:00",
    );

    // El 25 de octubre de 2026 a las 03:00 CEST se pasa a las 02:00 CET.
    expect(iso(occurrences)).toEqual([
      "2026-10-11T08:00:00.000Z", // CEST (UTC+2)
      "2026-10-18T08:00:00.000Z", // CEST (UTC+2)
      "2026-10-25T09:00:00.000Z", // ya CET (UTC+1)
      "2026-11-01T09:00:00.000Z", // CET (UTC+1)
    ]);
    expect(local(occurrences)).toEqual([
      "2026-10-11 10:00",
      "2026-10-18 10:00",
      "2026-10-25 10:00",
      "2026-11-01 10:00",
    ]);
  });

  it("expande el último viernes de cada mes con BYDAY=-1FR", () => {
    const occurrences = expandRRule(
      "2026-01-30T09:00:00",
      "FREQ=MONTHLY;BYDAY=-1FR;COUNT=3",
      MADRID,
      "2026-01-01T00:00:00",
      "2026-06-01T00:00:00",
    );

    expect(iso(occurrences)).toEqual([
      "2026-01-30T08:00:00.000Z",
      "2026-02-27T08:00:00.000Z",
      "2026-03-27T08:00:00.000Z",
    ]);
    expect(local(occurrences)).toEqual([
      "2026-01-30 09:00",
      "2026-02-27 09:00",
      "2026-03-27 09:00",
    ]);
  });

  it("acepta la regla como objeto tipado", () => {
    const occurrences = expandRRule(
      "2026-01-30T09:00:00",
      { freq: "MONTHLY", byDay: [{ weekday: "FR", ordinal: -1 }], count: 3 },
      MADRID,
      "2026-01-01T00:00:00",
      "2026-06-01T00:00:00",
    );

    expect(local(occurrences)).toEqual([
      "2026-01-30 09:00",
      "2026-02-27 09:00",
      "2026-03-27 09:00",
    ]);
  });

  it("omite los meses que no tienen el día 31", () => {
    const occurrences = expandRRule(
      "2026-01-31T09:00:00",
      "FREQ=MONTHLY;COUNT=4",
      MADRID,
      "2026-01-01T00:00:00",
      "2026-12-31T00:00:00",
    );

    expect(iso(occurrences)).toEqual([
      "2026-01-31T08:00:00.000Z", // CET (UTC+1)
      "2026-03-31T07:00:00.000Z", // CEST (UTC+2), tras el 29 de marzo
      "2026-05-31T07:00:00.000Z",
      "2026-07-31T07:00:00.000Z",
    ]);
    expect(local(occurrences)).toEqual([
      "2026-01-31 09:00",
      "2026-03-31 09:00",
      "2026-05-31 09:00",
      "2026-07-31 09:00",
    ]);
  });

  it("combina COUNT con BYDAY contando desde DTSTART", () => {
    const occurrences = expandRRule(
      "2026-01-06T09:00:00",
      "FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5",
      MADRID,
      "2026-01-01T00:00:00",
      "2026-03-01T00:00:00",
    );

    expect(iso(occurrences)).toEqual([
      "2026-01-06T08:00:00.000Z",
      "2026-01-08T08:00:00.000Z",
      "2026-01-13T08:00:00.000Z",
      "2026-01-15T08:00:00.000Z",
      "2026-01-20T08:00:00.000Z",
    ]);
  });

  it("soporta ordinales positivos como 2TU", () => {
    const occurrences = expandRRule(
      "2026-01-13T09:00:00",
      "FREQ=MONTHLY;BYDAY=2TU;COUNT=3",
      MADRID,
      "2026-01-01T00:00:00",
      "2026-06-01T00:00:00",
    );

    expect(local(occurrences)).toEqual([
      "2026-01-13 09:00",
      "2026-02-10 09:00",
      "2026-03-10 09:00",
    ]);
  });
});

describe("rango, INTERVAL y UNTIL", () => {
  it("filtra por [from, to) contando desde el inicio", () => {
    const occurrences = expandRRule(
      "2026-01-06T09:00:00",
      "FREQ=WEEKLY;BYDAY=TU,TH;COUNT=12",
      MADRID,
      "2026-02-01T00:00:00",
      "2026-03-01T00:00:00",
    );

    expect(iso(occurrences)).toEqual([
      "2026-02-03T08:00:00.000Z",
      "2026-02-05T08:00:00.000Z",
      "2026-02-10T08:00:00.000Z",
      "2026-02-12T08:00:00.000Z",
    ]);
  });

  it("aplica INTERVAL en semanas", () => {
    const occurrences = expandRRule(
      "2026-01-06T09:00:00",
      "FREQ=WEEKLY;INTERVAL=2;COUNT=3",
      MADRID,
      "2026-01-01T00:00:00",
      "2026-03-01T00:00:00",
    );

    expect(local(occurrences)).toEqual([
      "2026-01-06 09:00",
      "2026-01-20 09:00",
      "2026-02-03 09:00",
    ]);
  });

  it("detiene la expansión con UNTIL inclusivo", () => {
    const occurrences = expandRRule(
      "2026-01-01T09:00:00",
      "FREQ=DAILY;UNTIL=20260105T235959Z",
      MADRID,
      "2026-01-01T00:00:00",
      "2026-02-01T00:00:00",
    );

    expect(iso(occurrences)).toEqual([
      "2026-01-01T08:00:00.000Z",
      "2026-01-02T08:00:00.000Z",
      "2026-01-03T08:00:00.000Z",
      "2026-01-04T08:00:00.000Z",
      "2026-01-05T08:00:00.000Z",
    ]);
  });

  it("aplica INTERVAL en meses", () => {
    const occurrences = expandRRule(
      "2026-01-31T09:00:00",
      "FREQ=MONTHLY;INTERVAL=2;COUNT=3",
      MADRID,
      "2026-01-01T00:00:00",
      "2027-01-01T00:00:00",
    );

    expect(local(occurrences)).toEqual([
      "2026-01-31 09:00",
      "2026-03-31 09:00",
      "2026-05-31 09:00",
    ]);
  });
});

describe("validaciones", () => {
  it("rechaza ordinales BYDAY en FREQ=WEEKLY", () => {
    expect(() =>
      expandRRule("2026-01-06T09:00:00", "FREQ=WEEKLY;BYDAY=2TU", MADRID, "2026-01-01", "2026-02-01"),
    ).toThrow(/only supported with MONTHLY/);
  });

  it("rechaza COUNT y UNTIL juntos", () => {
    expect(() =>
      expandRRule(
        "2026-01-06T09:00:00",
        "FREQ=DAILY;COUNT=3;UNTIL=20260110T000000Z",
        MADRID,
        "2026-01-01",
        "2026-02-01",
      ),
    ).toThrow(/mutually exclusive/);
  });

  it("rechaza frecuencias no soportadas", () => {
    expect(() => expandRRule("2026-01-06T09:00:00", "FREQ=YEARLY", MADRID, "2026-01-01", "2027-01-01")).toThrow(
      /Unsupported FREQ/,
    );
  });

  it("rechaza partes RRULE no soportadas", () => {
    expect(() =>
      expandRRule("2026-01-06T09:00:00", "FREQ=MONTHLY;BYMONTHDAY=3", MADRID, "2026-01-01", "2026-02-01"),
    ).toThrow(/Unsupported RRULE part/);
  });

  it("rechaza zonas horarias inválidas", () => {
    expect(() =>
      expandRRule("2026-01-06T09:00:00", "FREQ=DAILY;COUNT=1", "Europe/Madridd", "2026-01-01", "2026-02-01"),
    ).toThrow(RangeError);
  });
});
