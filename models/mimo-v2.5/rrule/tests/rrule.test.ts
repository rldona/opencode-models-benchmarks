import { describe, it, expect } from "vitest";
import { expandRRule } from "../src/index.js";
import { toLocal } from "../src/timezone.js";

function fmt(d: Date, tz: string): string {
  return toLocal(d, tz).year + "-" +
    String(toLocal(d, tz).month).padStart(2, "0") + "-" +
    String(toLocal(d, tz).day).padStart(2, "0") + " " +
    String(toLocal(d, tz).hour).padStart(2, "0") + ":" +
    String(toLocal(d, tz).minute).padStart(2, "0") + ":" +
    String(toLocal(d, tz).second).padStart(2, "0");
}

function iso(d: Date): string {
  return d.toISOString();
}

describe("RRULE expander", () => {
  describe("Weekly event crossing DST (Europe/Madrid, October 2026)", () => {
    it("keeps local wall-clock time at 02:30 across DST fall-back", () => {
      // Europe/Madrid DST ends last Sunday of October 2026 = Oct 25
      // Clocks go from 03:00 CEST (UTC+2) back to 02:00 CET (UTC+1)
      // Weekly Wednesday event at 02:30, starting Oct 7 2026
      const dtstart = new Date("2026-10-07T00:30:00Z"); // 02:30 CEST
      const rangeStart = new Date("2026-10-01T00:00:00Z");
      const rangeEnd = new Date("2026-11-01T00:00:00Z");

      const occurrences = expandRRule(
        "FREQ=WEEKLY;BYDAY=WE",
        dtstart,
        "Europe/Madrid",
        rangeStart,
        rangeEnd,
      );

      expect(occurrences).toHaveLength(4);

      // All should show 02:30 in local Madrid time
      expect(fmt(occurrences[0], "Europe/Madrid")).toBe("2026-10-07 02:30:00");
      expect(fmt(occurrences[1], "Europe/Madrid")).toBe("2026-10-14 02:30:00");
      expect(fmt(occurrences[2], "Europe/Madrid")).toBe("2026-10-21 02:30:00");
      // Oct 28 is after DST ends: CET (UTC+1), 02:30 CET = 01:30 UTC
      expect(fmt(occurrences[3], "Europe/Madrid")).toBe("2026-10-28 02:30:00");

      // Verify the UTC times differ before/after DST change
      // Before DST: 02:30 CEST = 00:30 UTC
      expect(iso(occurrences[0])).toBe("2026-10-07T00:30:00.000Z");
      expect(iso(occurrences[1])).toBe("2026-10-14T00:30:00.000Z");
      expect(iso(occurrences[2])).toBe("2026-10-21T00:30:00.000Z");
      // After DST: 02:30 CET = 01:30 UTC
      expect(iso(occurrences[3])).toBe("2026-10-28T01:30:00.000Z");
    });

    it("keeps local wall-clock time at 10:00 across DST spring-forward", () => {
      // Europe/Madrid DST starts last Sunday of March 2026 = Mar 29
      // Clocks go from 02:00 CET (UTC+1) to 03:00 CEST (UTC+2)
      const dtstart = new Date("2026-03-25T09:00:00Z"); // 10:00 CET
      const rangeStart = new Date("2026-03-01T00:00:00Z");
      const rangeEnd = new Date("2026-04-15T00:00:00Z");

      const occurrences = expandRRule(
        "FREQ=WEEKLY;BYDAY=WE",
        dtstart,
        "Europe/Madrid",
        rangeStart,
        rangeEnd,
      );

      // Mar 25, Apr 1, Apr 8
      expect(occurrences).toHaveLength(3);

      expect(fmt(occurrences[0], "Europe/Madrid")).toBe("2026-03-25 10:00:00");
      expect(fmt(occurrences[1], "Europe/Madrid")).toBe("2026-04-01 10:00:00");
      expect(fmt(occurrences[2], "Europe/Madrid")).toBe("2026-04-08 10:00:00");

      // UTC before DST: 10:00 CET = 09:00 UTC
      expect(iso(occurrences[0])).toBe("2026-03-25T09:00:00.000Z");
      // UTC after DST: 10:00 CEST = 08:00 UTC
      expect(iso(occurrences[1])).toBe("2026-04-01T08:00:00.000Z");
      expect(iso(occurrences[2])).toBe("2026-04-08T08:00:00.000Z");
    });
  });

  describe("Last Friday of month (-1FR)", () => {
    it("finds the last Friday of each month", () => {
      const dtstart = new Date("2026-01-30T10:00:00Z"); // Jan 30 is a Friday
      const rangeStart = new Date("2026-01-01T00:00:00Z");
      const rangeEnd = new Date("2026-12-31T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=MONTHLY;BYDAY=-1FR",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      // Last Fridays of 2026:
      // Jan 30, Feb 27, Mar 27, Apr 24, May 29, Jun 26,
      // Jul 31, Aug 28, Sep 25, Oct 30, Nov 27, Dec 25
      expect(occurrences).toHaveLength(12);

      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      expect(dates).toEqual([
        "2026-01-30",
        "2026-02-27",
        "2026-03-27",
        "2026-04-24",
        "2026-05-29",
        "2026-06-26",
        "2026-07-31",
        "2026-08-28",
        "2026-09-25",
        "2026-10-30",
        "2026-11-27",
        "2026-12-25",
      ]);

      // Verify each is actually a Friday (weekday 5)
      for (const occ of occurrences) {
        expect(occ.getUTCDay()).toBe(5);
      }
    });

    it("finds the last Monday of each month in a different year", () => {
      const dtstart = new Date("2025-01-27T14:00:00Z"); // Jan 27, 2025 is a Monday
      const rangeStart = new Date("2025-01-01T00:00:00Z");
      const rangeEnd = new Date("2025-06-30T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=MONTHLY;BYDAY=-1MO",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      expect(dates).toEqual([
        "2025-01-27",
        "2025-02-24",
        "2025-03-31",
        "2025-04-28",
        "2025-05-26",
        "2025-06-30",
      ]);

      for (const occ of occurrences) {
        expect(occ.getUTCDay()).toBe(1);
      }
    });
  });

  describe("Months without day 31", () => {
    it("skips months that don't have 31 days", () => {
      // Monthly event on day 31, starting Jan 31 2026
      const dtstart = new Date("2026-01-31T12:00:00Z");
      const rangeStart = new Date("2026-01-01T00:00:00Z");
      const rangeEnd = new Date("2026-12-31T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=MONTHLY",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      // Should occur on: Jan 31, Mar 31, May 31, Jul 31, Aug 31, Oct 31, Dec 31
      // Feb, Apr, Jun, Sep, Nov don't have 31 days -> clamped to last day
      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      expect(dates).toEqual([
        "2026-01-31",
        "2026-02-28", // clamped
        "2026-03-31",
        "2026-04-30", // clamped
        "2026-05-31",
        "2026-06-30", // clamped
        "2026-07-31",
        "2026-08-31",
        "2026-09-30", // clamped
        "2026-10-31",
        "2026-11-30", // clamped
        "2026-12-31",
      ]);
    });

    it("clamps Feb 29 for leap year starts", () => {
      // Monthly on day 29, starting Feb 29 2024 (leap year)
      const dtstart = new Date("2024-02-29T08:00:00Z");
      const rangeStart = new Date("2024-01-01T00:00:00Z");
      const rangeEnd = new Date("2024-12-31T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=MONTHLY",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      expect(dates).toEqual([
        "2024-02-29",
        "2024-03-29",
        "2024-04-29",
        "2024-05-29",
        "2024-06-29",
        "2024-07-29",
        "2024-08-29",
        "2024-09-29",
        "2024-10-29",
        "2024-11-29",
        "2024-12-29",
      ]);
    });
  });

  describe("COUNT combined with BYDAY", () => {
    it("limits weekly BYDAY occurrences with COUNT", () => {
      const dtstart = new Date("2026-01-05T10:00:00Z"); // Monday
      const rangeStart = new Date("2026-01-01T00:00:00Z");
      const rangeEnd = new Date("2026-12-31T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      expect(occurrences).toHaveLength(5);
      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      // Week 1: Jan 5 (Mon), Jan 7 (Wed), Jan 9 (Fri)
      // Week 2: Jan 12 (Mon), Jan 14 (Wed) -> then COUNT=5 reached
      expect(dates).toEqual([
        "2026-01-05",
        "2026-01-07",
        "2026-01-09",
        "2026-01-12",
        "2026-01-14",
      ]);
    });

    it("limits monthly BYDAY occurrences with COUNT", () => {
      const dtstart = new Date("2026-01-01T10:00:00Z"); // Thursday
      const rangeStart = new Date("2026-01-01T00:00:00Z");
      const rangeEnd = new Date("2026-12-31T23:59:59Z");

      // BYDAY=1TH = first Thursday of each month
      const occurrences = expandRRule(
        "FREQ=MONTHLY;BYDAY=1TH;COUNT=6",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      expect(occurrences).toHaveLength(6);
      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      // Jan: 1st Thursday is Jan 1
      // Feb: 1st Thursday is Feb 5
      // Mar: 1st Thursday is Mar 5
      // Apr: 1st Thursday is Apr 2
      // May: 1st Thursday is May 7
      // Jun: 1st Thursday is Jun 4
      expect(dates).toEqual([
        "2026-01-01",
        "2026-02-05",
        "2026-03-05",
        "2026-04-02",
        "2026-05-07",
        "2026-06-04",
      ]);
    });

    it("respects COUNT with nth weekday BYDAY", () => {
      const dtstart = new Date("2026-01-13T10:00:00Z"); // 2nd Tuesday of Jan
      const rangeStart = new Date("2026-01-01T00:00:00Z");
      const rangeEnd = new Date("2026-12-31T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=MONTHLY;BYDAY=2TU;COUNT=4",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      expect(occurrences).toHaveLength(4);
      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      expect(dates).toEqual([
        "2026-01-13", // 2nd Tuesday of Jan
        "2026-02-10", // 2nd Tuesday of Feb
        "2026-03-10", // 2nd Tuesday of Mar
        "2026-04-14", // 2nd Tuesday of Apr
      ]);

      for (const occ of occurrences) {
        expect(occ.getUTCDay()).toBe(2); // Tuesday
      }
    });
  });

  describe("Basic DAILY frequency", () => {
    it("generates daily occurrences", () => {
      const dtstart = new Date("2026-01-01T08:00:00Z");
      const rangeStart = new Date("2026-01-01T00:00:00Z");
      const rangeEnd = new Date("2026-01-05T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=DAILY",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      expect(occurrences).toHaveLength(5);
      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      expect(dates).toEqual([
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-01-05",
      ]);
    });

    it("generates daily occurrences with INTERVAL", () => {
      const dtstart = new Date("2026-01-01T08:00:00Z");
      const rangeStart = new Date("2026-01-01T00:00:00Z");
      const rangeEnd = new Date("2026-01-15T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=DAILY;INTERVAL=3",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      expect(dates).toEqual([
        "2026-01-01",
        "2026-01-04",
        "2026-01-07",
        "2026-01-10",
        "2026-01-13",
      ]);
    });
  });

  describe("WEEKLY with INTERVAL", () => {
    it("generates bi-weekly occurrences", () => {
      const dtstart = new Date("2026-01-05T10:00:00Z"); // Monday
      const rangeStart = new Date("2026-01-01T00:00:00Z");
      const rangeEnd = new Date("2026-02-28T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=WEEKLY;INTERVAL=2",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      expect(dates).toEqual([
        "2026-01-05",
        "2026-01-19",
        "2026-02-02",
        "2026-02-16",
      ]);
    });
  });

  describe("UNTIL", () => {
    it("stops at UNTIL date", () => {
      const dtstart = new Date("2026-01-01T08:00:00Z");
      const rangeStart = new Date("2026-01-01T00:00:00Z");
      const rangeEnd = new Date("2026-12-31T23:59:59Z");

      const occurrences = expandRRule(
        "FREQ=DAILY;UNTIL=20260105",
        dtstart,
        "UTC",
        rangeStart,
        rangeEnd,
      );

      expect(occurrences).toHaveLength(5);
      const dates = occurrences.map((d) => fmt(d, "UTC").slice(0, 10));
      expect(dates).toEqual([
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-01-05",
      ]);
    });
  });
});
