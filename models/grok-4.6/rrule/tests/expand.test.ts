import { describe, expect, it } from "vitest";
import { expand } from "../src/index";

const MADRID = "Europe/Madrid";

function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function localHour(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(h === "24" ? "0" : h);
}

describe("expand", () => {
  it("keeps local time across Europe/Madrid October DST for a weekly event", () => {
    const dtstart = new Date("2025-10-13T08:00:00.000Z");
    const rangeStart = new Date("2025-10-13T00:00:00.000Z");
    const rangeEnd = new Date("2025-11-03T00:00:00.000Z");
    const occ = expand(dtstart, "FREQ=WEEKLY;BYDAY=MO", MADRID, rangeStart, rangeEnd);
    expect(occ.map((d) => d.toISOString())).toEqual([
      "2025-10-13T08:00:00.000Z",
      "2025-10-20T08:00:00.000Z",
      "2025-10-27T09:00:00.000Z",
    ]);
    for (const d of occ) {
      expect(localHour(d, MADRID)).toBe(10);
    }
  });

  it("expands last Friday of each month", () => {
    const dtstart = new Date("2025-01-15T08:00:00.000Z");
    const rangeStart = new Date("2025-01-01T00:00:00.000Z");
    const rangeEnd = new Date("2025-06-01T00:00:00.000Z");
    const occ = expand(dtstart, "FREQ=MONTHLY;BYDAY=-1FR", MADRID, rangeStart, rangeEnd);
    expect(occ.map((d) => localDate(d, MADRID))).toEqual([
      "2025-01-31",
      "2025-02-28",
      "2025-03-28",
      "2025-04-25",
      "2025-05-30",
    ]);
  });

  it("skips months that do not have day 31", () => {
    const dtstart = new Date("2025-01-31T11:00:00.000Z");
    const rangeStart = new Date("2025-01-01T00:00:00.000Z");
    const rangeEnd = new Date("2025-08-01T00:00:00.000Z");
    const occ = expand(dtstart, "FREQ=MONTHLY", MADRID, rangeStart, rangeEnd);
    expect(occ.map((d) => localDate(d, MADRID))).toEqual([
      "2025-01-31",
      "2025-03-31",
      "2025-05-31",
      "2025-07-31",
    ]);
  });

  it("applies COUNT together with BYDAY", () => {
    const dtstart = new Date("2025-01-06T08:00:00.000Z");
    const rangeStart = new Date("2025-01-01T00:00:00.000Z");
    const rangeEnd = new Date("2025-12-31T00:00:00.000Z");
    const occ = expand(
      dtstart,
      "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5",
      MADRID,
      rangeStart,
      rangeEnd,
    );
    expect(occ.map((d) => localDate(d, MADRID))).toEqual([
      "2025-01-06",
      "2025-01-08",
      "2025-01-10",
      "2025-01-13",
      "2025-01-15",
    ]);
  });
});
