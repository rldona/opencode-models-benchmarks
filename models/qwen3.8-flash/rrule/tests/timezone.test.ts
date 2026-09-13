import { describe, expect, it } from 'vitest';

import {
  daysInMonth,
  instantToWall,
  InvalidTimeZoneError,
  nthWeekdayOfMonth,
  offsetAt,
  offsetMinutesAt,
  wallToInstant,
  weekdaysOfMonth,
  type WallClock,
} from '../src/timezone';

const wall = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): WallClock => ({ year, month, day, hour, minute, second, ms: 0 });

const show = (timeZone: string, iso: string): WallClock =>
  instantToWall(timeZone, new Date(iso));

describe('instantToWall / offsetAt', () => {
  it('renders the local date/time of an instant in Europe/Madrid', () => {
    expect(show('Europe/Madrid', '2025-10-22T07:00:00Z')).toMatchObject({
      year: 2025,
      month: 10,
      day: 22,
      hour: 9,
      minute: 0,
    });
    // Same clock time, one week later, after the DST end: now UTC+01:00.
    expect(show('Europe/Madrid', '2025-10-29T08:00:00Z')).toMatchObject({
      month: 10,
      day: 29,
      hour: 9,
      minute: 0,
    });
  });

  it('handles whole-minute, half-hour and 45-minute offsets', () => {
    expect(offsetMinutesAt('Europe/Madrid', '2026-01-15T00:00:00Z')).toBe(60);
    expect(offsetMinutesAt('Europe/Madrid', '2026-07-15T00:00:00Z')).toBe(120);
    expect(offsetMinutesAt('Asia/Kolkata', '2026-01-15T00:00:00Z')).toBe(330);
    expect(offsetMinutesAt('Asia/Kathmandu', '2026-01-15T00:00:00Z')).toBe(345);
    expect(offsetMinutesAt('Pacific/Kiritimati', '2026-01-15T00:00:00Z')).toBe(840);
  });

  it('rejects unknown zone names with a dedicated error', () => {
    expect(() => instantToWall('Mars/Olympus_Mons', new Date())).toThrow(InvalidTimeZoneError);
    expect(() => wallToInstant('Not/AZone', wall(2026, 1, 1))).toThrow(InvalidTimeZoneError);
  });
});

describe('wallToInstant', () => {
  it('round-trips ordinary wall clocks', () => {
    const result = wallToInstant('Europe/Madrid', wall(2026, 6, 15, 9, 30, 15));
    expect(result.status).toBe('exact');
    expect(result.instant.toISOString()).toBe('2026-06-15T07:30:15.000Z');
    expect(result.resolvedWall).toEqual(wall(2026, 6, 15, 9, 30, 15));
  });

  it('keeps wall clock stable across the October 2025 DST end', () => {
    const before = wallToInstant('Europe/Madrid', wall(2025, 10, 22, 9));
    const after = wallToInstant('Europe/Madrid', wall(2025, 10, 29, 9));
    expect(before.instant.toISOString()).toBe('2025-10-22T07:00:00.000Z');
    expect(after.instant.toISOString()).toBe('2025-10-29T08:00:00.000Z');
  });

  it('picks the earliest instant for an ambiguous (repeated) wall clock', () => {
    // 2025-10-26 02:30 in Madrid happens twice (00:30Z and 01:30Z).
    const result = wallToInstant('Europe/Madrid', wall(2025, 10, 26, 2, 30));
    expect(result.status).toBe('ambiguous');
    expect(result.instant.toISOString()).toBe('2025-10-26T00:30:00.000Z');
    expect(offsetAt('Europe/Madrid', result.instant)).toBe(2 * 3_600_000);
  });

  it('pushes a non-existent wall clock to the transition instant', () => {
    // Madrid springs forward 02:00 -> 03:00 on 2026-03-29.
    const result = wallToInstant('Europe/Madrid', wall(2026, 3, 29, 2, 30));
    expect(result.status).toBe('nonexistent');
    expect(result.instant.toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(result.requestedWall.hour).toBe(2);
    expect(result.resolvedWall.hour).toBe(3);
  });

  it('works for southern-hemisphere transitions (Pacific/Auckland)', () => {
    const before = wallToInstant('Pacific/Auckland', wall(2026, 9, 24, 17));
    const after = wallToInstant('Pacific/Auckland', wall(2026, 10, 1, 17));
    expect(before.instant.toISOString()).toBe('2026-09-24T05:00:00.000Z');
    expect(after.instant.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    const gap = wallToInstant('Pacific/Auckland', wall(2026, 9, 27, 2, 30));
    expect(gap.status).toBe('nonexistent');
    expect(gap.instant.toISOString()).toBe('2026-09-26T14:00:00.000Z');
  });

  it('round-trips every hour of a DST year', () => {
    for (const timeZone of ['Europe/Madrid', 'America/Santiago', 'Asia/Kolkata', 'Australia/Sydney']) {
      let instant = Date.UTC(2026, 0, 1);
      const end = Date.UTC(2027, 0, 1);
      let checked = 0;
      for (; instant < end; instant += 3_600_000) {
        const result = wallToInstant(timeZone, instantToWall(timeZone, instant));
        if (result.status === 'exact') {
          expect(result.epochMs).toBe(instant);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(8_000);
    }
  });
});

describe('calendar helpers', () => {
  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('finds weekdays inside a month', () => {
    expect(weekdaysOfMonth(2026, 1, 5)).toEqual([2, 9, 16, 23, 30]); // Fridays
    expect(nthWeekdayOfMonth(2026, 1, 5, -1)).toBe(30); // last Friday of January
    expect(nthWeekdayOfMonth(2026, 2, 5, -1)).toBe(27); // February has no 5th Friday
    expect(nthWeekdayOfMonth(2026, 5, 5, -1)).toBe(29);
    expect(nthWeekdayOfMonth(2026, 3, 2, 2)).toBe(10); // 2nd Tuesday of March
    expect(nthWeekdayOfMonth(2026, 1, 1, 5)).toBeNull(); // no 5th Monday in January
  });
});
