import { describe, expect, it } from "vitest";
import { expand, parseRRule, utcToWall } from "../src/index.js";

function wallDays(tz: string, dates: Date[]): [number, number, number][] {
  return dates.map((d) => {
    const w = utcToWall(tz, d.getTime());
    return [w.year, w.month, w.day];
  });
}

describe("expand (RRULE subset)", () => {
  it("mantiene la hora local 10:00 al cruzar el cambio de hora de octubre en Europe/Madrid", () => {
    const occurrences = expand(
      { dtstart: "2026-09-04T10:00:00", rrule: "FREQ=WEEKLY", tz: "Europe/Madrid" },
      new Date(Date.UTC(2026, 8, 20)),
      new Date(Date.UTC(2026, 10, 8)),
    );

    expect(occurrences).toHaveLength(7);

    for (const occ of occurrences) {
      const wall = utcToWall("Europe/Madrid", occ.getTime());
      expect(wall.hour).toBe(10);
      expect(wall.minute).toBe(0);
    }

    const utcHours = occurrences.map((o) => o.getUTCHours());
    expect(utcHours[0]).toBe(8); // CEST antes del cambio (25-oct-2026)
    expect(utcHours[6]).toBe(9); // CET después del cambio

    const beforeGap = occurrences[4]!.getTime() - occurrences[3]!.getTime();
    expect(beforeGap).toBe(168 * 3600 * 1000);

    const dstGap = occurrences[5]!.getTime() - occurrences[4]!.getTime();
    expect(dstGap).toBe(169 * 3600 * 1000); // 23-oct -> 30-oct: una semana de 169 h
  });

  it("calcula el último viernes de cada mes (BYDAY=-1FR)", () => {
    const occurrences = expand(
      { dtstart: "2026-01-30T09:00:00", rrule: "FREQ=MONTHLY;BYDAY=-1FR", tz: "Europe/Madrid" },
      new Date(Date.UTC(2026, 1, 1)),
      new Date(Date.UTC(2026, 4, 1)),
    );

    expect(wallDays("Europe/Madrid", occurrences)).toEqual([
      [2026, 2, 27],
      [2026, 3, 27],
      [2026, 4, 24],
    ]);
  });

  it("salta los meses que no tienen día 31", () => {
    const occurrences = expand(
      { dtstart: "2026-01-31T08:00:00", rrule: "FREQ=MONTHLY", tz: "Europe/Madrid" },
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2027, 0, 1)),
    );

    expect(wallDays("Europe/Madrid", occurrences)).toEqual([
      [2026, 1, 31],
      [2026, 3, 31],
      [2026, 5, 31],
      [2026, 7, 31],
      [2026, 8, 31],
      [2026, 10, 31],
      [2026, 12, 31],
    ]);
  });

  it("limita con COUNT combinado con BYDAY", () => {
    const occurrences = expand(
      { dtstart: "2026-06-01T09:00:00", rrule: "FREQ=MONTHLY;BYDAY=MO,WE;COUNT=5", tz: "Europe/Madrid" },
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 11, 31)),
    );

    expect(occurrences).toHaveLength(5);
    expect(wallDays("Europe/Madrid", occurrences)).toEqual([
      [2026, 6, 1],
      [2026, 6, 3],
      [2026, 6, 8],
      [2026, 6, 10],
      [2026, 6, 15],
    ]);
  });

  it("aplica INTERVAL=2 semanal con BYDAY", () => {
    const occurrences = expand(
      { dtstart: "2026-09-07T09:00:00", rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR", tz: "Europe/Madrid" },
      new Date(Date.UTC(2026, 8, 1)),
      new Date(Date.UTC(2026, 9, 20)),
    );

    expect(wallDays("Europe/Madrid", occurrences)).toEqual([
      [2026, 9, 7],
      [2026, 9, 11],
      [2026, 9, 21],
      [2026, 9, 25],
      [2026, 10, 5],
      [2026, 10, 9],
      [2026, 10, 19],
    ]);
  });

  it("corta con UNTIL", () => {
    const occurrences = expand(
      { dtstart: "2026-09-01T10:00:00", rrule: "FREQ=DAILY;UNTIL=20260910T235959Z", tz: "Europe/Madrid" },
      new Date(Date.UTC(2026, 8, 1)),
      new Date(Date.UTC(2026, 9, 1)),
    );

    expect(wallDays("Europe/Madrid", occurrences)).toEqual([
      [2026, 9, 1],
      [2026, 9, 2],
      [2026, 9, 3],
      [2026, 9, 4],
      [2026, 9, 5],
      [2026, 9, 6],
      [2026, 9, 7],
      [2026, 9, 8],
      [2026, 9, 9],
      [2026, 9, 10],
    ]);
  });

  it("parsea ordinales de BYDAY como 2TU y -1FR", () => {
    const rule = parseRRule("FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU,-1FR;COUNT=10");
    expect(rule.freq).toBe("MONTHLY");
    expect(rule.interval).toBe(2);
    expect(rule.byday).toEqual([
      { weekday: 1, ordinal: 2 },
      { weekday: 4, ordinal: -1 },
    ]);
    expect(rule.count).toBe(10);
  });
});
