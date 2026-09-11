import { describe, expect, it } from "vitest";
import { expandRecurrence } from "../src/rrule";

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe("expandRecurrence", () => {
  it("evento semanal que cruza el cambio de hora de octubre en Europe/Madrid (se conserva la hora local)", () => {
    // El 27-oct-2024 Madrid pasa de UTC+2 (CEST) a UTC+1 (CET).
    const occurrences = expandRecurrence(
      "2024-10-01T09:00", // string sin offset: se interpreta como hora local
      "FREQ=WEEKLY;COUNT=6",
      {
        timezone: "Europe/Madrid",
        from: new Date(0),
        to: "2024-12-31T23:59:59Z",
      },
    );

    expect(iso(occurrences)).toEqual([
      "2024-10-01T07:00:00.000Z", // antes del cambio: UTC+2
      "2024-10-08T07:00:00.000Z",
      "2024-10-15T07:00:00.000Z",
      "2024-10-22T07:00:00.000Z", // última antes del cambio
      "2024-10-29T08:00:00.000Z", // después del cambio: UTC+1
      "2024-11-05T08:00:00.000Z",
    ]);
  });

  it("último viernes de mes (BYDAY=-1FR mensual)", () => {
    const occurrences = expandRecurrence(
      "2024-01-01T10:30:00Z",
      "FREQ=MONTHLY;BYDAY=-1FR;COUNT=4",
      {
        timezone: "UTC",
        from: new Date(0),
        to: "2024-12-31T23:59:59Z",
      },
    );

    expect(iso(occurrences)).toEqual([
      "2024-01-26T10:30:00.000Z",
      "2024-02-23T10:30:00.000Z", // 2024 es bisiesto: el 29 es jueves
      "2024-03-29T10:30:00.000Z",
      "2024-04-26T10:30:00.000Z",
    ]);
  });

  it("segundo martes de mes (BYDAY=2TU mensual)", () => {
    const occurrences = expandRecurrence(
      "2024-01-01T00:00:00Z",
      "FREQ=MONTHLY;BYDAY=2TU;COUNT=3",
      {
        timezone: "UTC",
        from: new Date(0),
        to: "2024-12-31T23:59:59Z",
      },
    );

    expect(iso(occurrences)).toEqual([
      "2024-01-09T00:00:00.000Z",
      "2024-02-13T00:00:00.000Z",
      "2024-03-12T00:00:00.000Z",
    ]);
  });

  it("mensual con inicio en día 31: omite los meses sin día 31", () => {
    const occurrences = expandRecurrence(
      "2024-01-31T12:00:00Z",
      "FREQ=MONTHLY;COUNT=6",
      {
        timezone: "UTC",
        from: new Date(0),
        to: "2025-12-31T23:59:59Z",
      },
    );

    expect(iso(occurrences)).toEqual([
      "2024-01-31T12:00:00.000Z",
      "2024-03-31T12:00:00.000Z",
      "2024-05-31T12:00:00.000Z",
      "2024-07-31T12:00:00.000Z",
      "2024-08-31T12:00:00.000Z",
      "2024-10-31T12:00:00.000Z",
    ]);
  });

  it("COUNT combinado con BYDAY: se detiene exactamente en N ocurrencias", () => {
    const occurrences = expandRecurrence(
      "2024-01-01T09:00", // lunes
      "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7",
      {
        timezone: "Europe/Madrid",
        from: new Date(0),
        to: "2024-12-31T23:59:59Z",
      },
    );

    expect(iso(occurrences)).toEqual([
      "2024-01-01T08:00:00.000Z", // lu
      "2024-01-03T08:00:00.000Z", // mi
      "2024-01-05T08:00:00.000Z", // vi
      "2024-01-08T08:00:00.000Z", // lu
      "2024-01-10T08:00:00.000Z", // mi
      "2024-01-12T08:00:00.000Z", // vi
      "2024-01-15T08:00:00.000Z", // lu
    ]);
    // COUNT refleja el total de la serie aunque la ventana fuera más amplia.
    expect(occurrences).toHaveLength(7);
  });

  it("recorta la serie a la ventana [from, to)", () => {
    const occurrences = expandRecurrence(
      "2024-01-01T00:00:00Z",
      "FREQ=DAILY",
      {
        timezone: "UTC",
        from: "2024-01-03T12:00:00Z",
        to: "2024-01-08T00:00:00Z",
      },
    );

    expect(iso(occurrences)).toEqual([
      "2024-01-04T00:00:00.000Z",
      "2024-01-05T00:00:00.000Z",
      "2024-01-06T00:00:00.000Z",
      "2024-01-07T00:00:00.000Z", // 'to' es exclusivo
    ]);
  });

  it("ventana vacía (from >= to) devuelve lista vacía", () => {
    const occurrences = expandRecurrence(
      "2024-01-01T00:00:00Z",
      "FREQ=DAILY;COUNT=10",
      {
        timezone: "UTC",
        from: "2024-01-10T00:00:00Z",
        to: "2024-01-01T00:00:00Z",
      },
    );
    expect(occurrences).toEqual([]);
  });

  it("UNTIL con fecha sin hora incluye ese día completo (fin de día local)", () => {
    const occurrences = expandRecurrence(
      "2024-06-10T09:00",
      "FREQ=DAILY;UNTIL=2024-06-12",
      {
        timezone: "Europe/Madrid",
        from: new Date(0),
        to: "2025-01-01T00:00:00Z",
      },
    );

    expect(iso(occurrences)).toEqual([
      "2024-06-10T07:00:00.000Z",
      "2024-06-11T07:00:00.000Z",
      "2024-06-12T07:00:00.000Z",
    ]);
  });

  it("INTERVAL con FREQ=DAILY", () => {
    const occurrences = expandRecurrence(
      "2024-01-01T00:00:00Z",
      "FREQ=DAILY;INTERVAL=3;COUNT=3",
      {
        timezone: "UTC",
        from: new Date(0),
        to: "2024-12-31T23:59:59Z",
      },
    );

    expect(iso(occurrences)).toEqual([
      "2024-01-01T00:00:00.000Z",
      "2024-01-04T00:00:00.000Z",
      "2024-01-07T00:00:00.000Z",
    ]);
  });
});
