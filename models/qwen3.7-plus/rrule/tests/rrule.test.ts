import { describe, it, expect } from 'vitest';
import { expandRecurrences } from '../src/expand.js';
import { localToUtc, utcToLocal } from '../src/tz.js';

describe('RRULE Expander', () => {
  describe('Weekly event crossing DST in October (Europe/Madrid)', () => {
    it('should maintain 10:00 local time before and after DST change', () => {
      const dtstart = localToUtc(2025, 10, 14, 10, 0, 0, 'Europe/Madrid');
      const rangeStart = new Date('2025-10-01T00:00:00Z');
      const rangeEnd = new Date('2025-11-30T23:59:59Z');

      const results = expandRecurrences(
        dtstart,
        'FREQ=WEEKLY;BYDAY=TU',
        'Europe/Madrid',
        rangeStart,
        rangeEnd,
      );

      expect(results.length).toBeGreaterThan(0);

      for (const date of results) {
        const local = utcToLocal(date, 'Europe/Madrid');
        expect(local.hour).toBe(10);
        expect(local.minute).toBe(0);
      }
    });

    it('should produce correct UTC times before and after DST change', () => {
      const dtstart = localToUtc(2025, 10, 14, 10, 0, 0, 'Europe/Madrid');
      const rangeStart = new Date('2025-10-01T00:00:00Z');
      const rangeEnd = new Date('2025-11-30T23:59:59Z');

      const results = expandRecurrences(
        dtstart,
        'FREQ=WEEKLY;BYDAY=TU',
        'Europe/Madrid',
        rangeStart,
        rangeEnd,
      );

      const oct14 = results.find(
        (d) => utcToLocal(d, 'Europe/Madrid').day === 14 && utcToLocal(d, 'Europe/Madrid').month === 10,
      );
      const oct21 = results.find(
        (d) => utcToLocal(d, 'Europe/Madrid').day === 21 && utcToLocal(d, 'Europe/Madrid').month === 10,
      );
      const oct28 = results.find(
        (d) => utcToLocal(d, 'Europe/Madrid').day === 28 && utcToLocal(d, 'Europe/Madrid').month === 10,
      );
      const nov4 = results.find(
        (d) => utcToLocal(d, 'Europe/Madrid').day === 4 && utcToLocal(d, 'Europe/Madrid').month === 11,
      );

      expect(oct14).toBeDefined();
      expect(oct21).toBeDefined();
      expect(oct28).toBeDefined();
      expect(nov4).toBeDefined();

      expect(oct14!.toISOString()).toBe('2025-10-14T08:00:00.000Z');
      expect(oct21!.toISOString()).toBe('2025-10-21T08:00:00.000Z');
      expect(oct28!.toISOString()).toBe('2025-10-28T09:00:00.000Z');
      expect(nov4!.toISOString()).toBe('2025-11-04T09:00:00.000Z');
    });
  });

  describe('Last Friday of month (-1FR)', () => {
    it('should return the last Friday of each month', () => {
      const dtstart = localToUtc(2025, 1, 31, 10, 0, 0, 'Europe/Madrid');
      const rangeStart = new Date('2025-01-01T00:00:00Z');
      const rangeEnd = new Date('2025-12-31T23:59:59Z');

      const results = expandRecurrences(
        dtstart,
        'FREQ=MONTHLY;BYDAY=-1FR',
        'Europe/Madrid',
        rangeStart,
        rangeEnd,
      );

      expect(results.length).toBe(12);

      const expectedDays = [31, 28, 28, 25, 30, 27, 25, 29, 26, 31, 28, 26];
      const expectedMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

      for (let i = 0; i < results.length; i++) {
        const local = utcToLocal(results[i], 'Europe/Madrid');
        expect(local.day).toBe(expectedDays[i]);
        expect(local.month).toBe(expectedMonths[i]);
        expect(local.hour).toBe(10);
      }
    });

    it('should handle -1FR with COUNT', () => {
      const dtstart = localToUtc(2025, 1, 31, 10, 0, 0, 'Europe/Madrid');
      const rangeStart = new Date('2025-01-01T00:00:00Z');
      const rangeEnd = new Date('2026-12-31T23:59:59Z');

      const results = expandRecurrences(
        dtstart,
        'FREQ=MONTHLY;BYDAY=-1FR;COUNT=3',
        'Europe/Madrid',
        rangeStart,
        rangeEnd,
      );

      expect(results.length).toBe(3);

      const days = results.map((d) => utcToLocal(d, 'Europe/Madrid').day);
      expect(days).toEqual([31, 28, 28]);
    });
  });

  describe('Months without day 31', () => {
    it('should skip months that do not have day 31', () => {
      const dtstart = localToUtc(2025, 1, 31, 10, 0, 0, 'Europe/Madrid');
      const rangeStart = new Date('2025-01-01T00:00:00Z');
      const rangeEnd = new Date('2025-12-31T23:59:59Z');

      const results = expandRecurrences(
        dtstart,
        'FREQ=MONTHLY',
        'Europe/Madrid',
        rangeStart,
        rangeEnd,
      );

      const months = results.map((d) => utcToLocal(d, 'Europe/Madrid').month);

      expect(months).toContain(1);
      expect(months).not.toContain(2);
      expect(months).toContain(3);
      expect(months).not.toContain(4);
      expect(months).toContain(5);
      expect(months).not.toContain(6);
      expect(months).toContain(7);
      expect(months).toContain(8);
      expect(months).not.toContain(9);
      expect(months).toContain(10);
      expect(months).not.toContain(11);
      expect(months).toContain(12);

      expect(results.length).toBe(7);

      for (const date of results) {
        const local = utcToLocal(date, 'Europe/Madrid');
        expect(local.day).toBe(31);
        expect(local.hour).toBe(10);
      }
    });
  });

  describe('COUNT combined with BYDAY', () => {
    it('should stop after COUNT occurrences with multiple BYDAY values', () => {
      const dtstart = localToUtc(2025, 1, 6, 10, 0, 0, 'Europe/Madrid');
      const rangeStart = new Date('2025-01-01T00:00:00Z');
      const rangeEnd = new Date('2025-12-31T23:59:59Z');

      const results = expandRecurrences(
        dtstart,
        'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5',
        'Europe/Madrid',
        rangeStart,
        rangeEnd,
      );

      expect(results.length).toBe(5);

      const dates = results.map((d) => {
        const local = utcToLocal(d, 'Europe/Madrid');
        return { day: local.day, month: local.month, year: local.year, dow: new Date(d).getUTCDay() };
      });

      expect(dates[0]).toMatchObject({ day: 6, month: 1 });
      expect(dates[1]).toMatchObject({ day: 8, month: 1 });
      expect(dates[2]).toMatchObject({ day: 13, month: 1 });
      expect(dates[3]).toMatchObject({ day: 15, month: 1 });
      expect(dates[4]).toMatchObject({ day: 20, month: 1 });

      for (const date of results) {
        const local = utcToLocal(date, 'Europe/Madrid');
        expect(local.hour).toBe(10);
      }
    });

    it('should respect COUNT even when rangeStart filters out early occurrences', () => {
      const dtstart = localToUtc(2025, 1, 6, 10, 0, 0, 'Europe/Madrid');
      const rangeStart = new Date('2025-01-10T00:00:00Z');
      const rangeEnd = new Date('2025-12-31T23:59:59Z');

      const results = expandRecurrences(
        dtstart,
        'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5',
        'Europe/Madrid',
        rangeStart,
        rangeEnd,
      );

      expect(results.length).toBe(3);

      const days = results.map((d) => utcToLocal(d, 'Europe/Madrid').day);
      expect(days).toEqual([13, 15, 20]);
    });
  });
});
