import { describe, it, expect } from 'vitest';
import { parseRRule, expand, utcToLocal, localToUTC } from '../src/index';

const MADRID = 'Europe/Madrid';

function localTime(ms: number): { h: number; m: number } {
  const p = utcToLocal(ms, MADRID);
  return { h: p.hour, m: p.minute };
}

function utcOffsetHours(ms: number): number {
  const p = utcToLocal(ms, MADRID);
  const localMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return (localMs - ms) / 3_600_000;
}

describe('Weekly event crossing October DST in Europe/Madrid', () => {
  it('keeps local time at 10:00 across the fall-back transition', () => {
    // DST ends on last Sunday of October 2024 = Oct 27 at 3:00 AM CEST -> 2:00 AM CET
    // Start on Friday Sep 20, 2024 at 10:00 Madrid time
    const startFri = localToUTC(2024, 9, 20, 10, 0, MADRID);

    const rule = parseRRule('FREQ=WEEKLY;BYDAY=FR;COUNT=8');
    const rangeStart = localToUTC(2024, 8, 1, 0, 0, MADRID);
    const rangeEnd = localToUTC(2024, 11, 30, 23, 59, MADRID);

    const occurrences = expand(rule, startFri, MADRID, rangeStart, rangeEnd);

    expect(occurrences.length).toBe(8);

    for (const occ of occurrences) {
      const t = localTime(occ);
      expect(t.h).toBe(10);
      expect(t.m).toBe(0);
    }

    // Before DST change (Oct 27): CEST = UTC+2
    // After DST change: CET = UTC+1
    const beforeDST = occurrences.filter((o) => o < localToUTC(2024, 10, 27, 1, 0, MADRID));
    const afterDST = occurrences.filter((o) => o > localToUTC(2024, 10, 27, 3, 0, MADRID));

    for (const occ of beforeDST) {
      expect(utcOffsetHours(occ)).toBe(2);
    }
    for (const occ of afterDST) {
      expect(utcOffsetHours(occ)).toBe(1);
    }
  });
});

describe('Last Friday of month (BYDAY=-1FR)', () => {
  it('returns the last Friday of each month', () => {
    const start = localToUTC(2024, 1, 1, 9, 0, MADRID);
    const rule = parseRRule('FREQ=MONTHLY;BYDAY=-1FR;COUNT=12');
    const rangeStart = localToUTC(2024, 1, 1, 0, 0, MADRID);
    const rangeEnd = localToUTC(2025, 1, 31, 23, 59, MADRID);

    const occurrences = expand(rule, start, MADRID, rangeStart, rangeEnd);

    expect(occurrences.length).toBe(12);

    for (const occ of occurrences) {
      const p = utcToLocal(occ, MADRID);
      // Friday = 5
      const wd = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
      expect(wd).toBe(5);
      // Last Friday: day must be >= 22 and day+7 must be in next month
      expect(p.day).toBeGreaterThanOrEqual(22);
      const nextWeek = new Date(Date.UTC(p.year, p.month - 1, p.day + 7));
      expect(nextWeek.getUTCMonth()).not.toBe(p.month - 1);
    }
  });
});

describe('Months without day 31', () => {
  it('skips months that do not have 31 days', () => {
    const start = localToUTC(2024, 1, 31, 9, 0, MADRID); // Jan 31
    const rule = parseRRule('FREQ=MONTHLY;COUNT=12');
    const rangeStart = localToUTC(2024, 1, 1, 0, 0, MADRID);
    const rangeEnd = localToUTC(2024, 12, 31, 23, 59, MADRID);

    const occurrences = expand(rule, start, MADRID, rangeStart, rangeEnd);

    // Months with 31 days in 2024: Jan, Mar, May, Jul, Aug, Oct, Dec = 7
    expect(occurrences.length).toBe(7);

    const months = occurrences.map((o) => utcToLocal(o, MADRID).month);
    expect(months).toEqual([1, 3, 5, 7, 8, 10, 12]);

    for (const occ of occurrences) {
      const p = utcToLocal(occ, MADRID);
      expect(p.day).toBe(31);
      expect(p.hour).toBe(9);
      expect(p.minute).toBe(0);
    }
  });
});

describe('COUNT combined with BYDAY', () => {
  it('returns exactly COUNT occurrences spread across BYDAY weekdays', () => {
    // 2024-09-02 is a Monday
    const start = localToUTC(2024, 9, 2, 14, 30, MADRID);
    const rule = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=9');
    const rangeStart = localToUTC(2024, 8, 1, 0, 0, MADRID);
    const rangeEnd = localToUTC(2024, 11, 30, 23, 59, MADRID);

    const occurrences = expand(rule, start, MADRID, rangeStart, rangeEnd);

    expect(occurrences.length).toBe(9);

    // Pattern: MO, WE, FR, MO, WE, FR, MO, WE, FR
    const expectedWd = [1, 3, 5, 1, 3, 5, 1, 3, 5];
    for (let i = 0; i < occurrences.length; i++) {
      const p = utcToLocal(occurrences[i], MADRID);
      const wd = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
      expect(wd).toBe(expectedWd[i]);
      expect(p.hour).toBe(14);
      expect(p.minute).toBe(30);
    }
  });
});
