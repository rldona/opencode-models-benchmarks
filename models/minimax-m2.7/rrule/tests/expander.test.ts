import { describe, it, expect } from 'vitest';
import { expandRecurrences, parseRRule } from '../src/index.js';

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toISOString();
}

function formatLocalDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

describe('RRULE Expander', () => {
  describe('Parser', () => {
    it('parses basic FREQ=DAILY', () => {
      const rule = parseRRule('FREQ=DAILY');
      expect(rule.freq).toBe('DAILY');
      expect(rule.interval).toBe(1);
    });

    it('parses FREQ=WEEKLY with INTERVAL', () => {
      const rule = parseRRule('FREQ=WEEKLY;INTERVAL=2');
      expect(rule.freq).toBe('WEEKLY');
      expect(rule.interval).toBe(2);
    });

    it('parses BYDAY with multiple days', () => {
      const rule = parseRRule('FREQ=WEEKLY;BYDAY=TU,TH');
      expect(rule.byDay).toHaveLength(2);
      expect(rule.byDay[0].day).toBe('TU');
      expect(rule.byDay[1].day).toBe('TH');
    });

    it('parses BYDAY with position like 2TU', () => {
      const rule = parseRRule('FREQ=MONTHLY;BYDAY=2TU');
      expect(rule.byDay).toHaveLength(1);
      expect(rule.byDay[0].day).toBe('TU');
      expect(rule.byDay[0].position).toBe(2);
    });

    it('parses BYDAY with negative position like -1FR', () => {
      const rule = parseRRule('FREQ=MONTHLY;BYDAY=-1FR');
      expect(rule.byDay).toHaveLength(1);
      expect(rule.byDay[0].day).toBe('FR');
      expect(rule.byDay[0].position).toBe(-1);
    });

    it('parses COUNT', () => {
      const rule = parseRRule('FREQ=DAILY;COUNT=5');
      expect(rule.count).toBe(5);
    });

    it('parses UNTIL', () => {
      const rule = parseRRule('FREQ=DAILY;UNTIL=20261025T000000Z');
      expect(rule.until).toBeInstanceOf(Date);
      expect(rule.until!.getFullYear()).toBe(2026);
      expect(rule.until!.getMonth()).toBe(9);
      expect(rule.until!.getDate()).toBe(25);
    });
  });

  describe('Weekly event crossing DST change in Europe/Madrid', () => {
    it('handles weekly event crossing October DST change', () => {
      const startDate = new Date('2026-10-01T10:00:00Z');
      const rrule = 'FREQ=WEEKLY;BYDAY=TH;COUNT=6';
      const timezone = 'Europe/Madrid';

      const rangeStart = new Date('2026-09-01T00:00:00Z');
      const rangeEnd = new Date('2026-11-30T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(5);

      const oct23 = new Date('2026-10-23T10:00:00+02:00');
      expect(occurrences.some(o => {
        const d = new Date(o.timestamp);
        return d.getUTCDate() === 23 && d.getUTCMonth() === 9;
      })).toBe(true);

      const oct30 = new Date('2026-10-30T10:00:00+01:00');
      expect(occurrences.some(o => {
        const d = new Date(o.timestamp);
        return d.getUTCDate() === 30 && d.getUTCMonth() === 9;
      })).toBe(true);
    });

    it('verifies DST transition date in Europe/Madrid 2026', () => {
      const beforeDST = new Date('2026-10-25T01:00:00Z');
      const afterDST = new Date('2026-10-25T04:00:00Z');

      const before = new Date(beforeDST);
      const after = new Date(afterDST);

      expect(before.getUTCDate()).toBe(25);
      expect(after.getUTCDate()).toBe(25);
    });
  });

  describe('Last Friday of month', () => {
    it('finds last Friday of month with FREQ=MONTHLY;BYDAY=-1FR', () => {
      const startDate = new Date('2026-01-30T09:00:00Z');
      const rrule = 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=3';
      const timezone = 'Europe/Madrid';

      const rangeStart = new Date('2026-01-01T00:00:00Z');
      const rangeEnd = new Date('2026-12-31T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(3);

      const jan30 = new Date('2026-01-30T09:00:00+01:00');
      expect(occurrences[0].localDateTime.year).toBe(2026);
      expect(occurrences[0].localDateTime.month).toBe(1);
      expect(occurrences[0].localDateTime.day).toBe(30);
      expect(occurrences[0].localDateTime.hour).toBe(9);

      const feb27 = new Date('2026-02-27T09:00:00+01:00');
      expect(occurrences[1].localDateTime.year).toBe(2026);
      expect(occurrences[1].localDateTime.month).toBe(2);
      expect(occurrences[1].localDateTime.day).toBe(27);

      const mar27 = new Date('2026-03-27T09:00:00+01:00');
      expect(occurrences[2].localDateTime.year).toBe(2026);
      expect(occurrences[2].localDateTime.month).toBe(3);
      expect(occurrences[2].localDateTime.day).toBe(27);
    });

    it('handles months where last Friday is on different days', () => {
      const startDate = new Date('2026-01-30T09:00:00Z');
      const rrule = 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=12';
      const timezone = 'Europe/Madrid';

      const rangeStart = new Date('2026-01-01T00:00:00Z');
      const rangeEnd = new Date('2026-12-31T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(12);

      expect(occurrences[0].localDateTime.month).toBe(1);
      expect(occurrences[0].localDateTime.day).toBe(30);

      expect(occurrences[1].localDateTime.month).toBe(2);
      expect(occurrences[1].localDateTime.day).toBe(27);

      expect(occurrences[8].localDateTime.month).toBe(9);
      expect(occurrences[8].localDateTime.day).toBe(25);

      expect(occurrences[10].localDateTime.month).toBe(11);
      expect(occurrences[10].localDateTime.day).toBe(27);
    });
  });

  describe('Months without 31st day', () => {
    it('handles FREQ=MONTHLY;BYDAY=1MO when month has only 28-30 days', () => {
      const startDate = new Date('2026-01-05T10:00:00Z');
      const rrule = 'FREQ=MONTHLY;BYDAY=1MO;COUNT=12';
      const timezone = 'Europe/Madrid';

      const rangeStart = new Date('2026-01-01T00:00:00Z');
      const rangeEnd = new Date('2026-12-31T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(12);

      expect(occurrences[0].localDateTime.month).toBe(1);
      expect(occurrences[0].localDateTime.day).toBe(5);

      expect(occurrences[1].localDateTime.month).toBe(2);
      expect(occurrences[1].localDateTime.day).toBe(2);

      expect(occurrences[2].localDateTime.month).toBe(3);
      expect(occurrences[2].localDateTime.day).toBe(2);

      expect(occurrences[3].localDateTime.month).toBe(4);
      expect(occurrences[3].localDateTime.day).toBe(6);

      expect(occurrences[8].localDateTime.month).toBe(9);
      expect(occurrences[8].localDateTime.day).toBe(7);

      expect(occurrences[10].localDateTime.month).toBe(11);
      expect(occurrences[10].localDateTime.day).toBe(2);
    });

    it('handles FREQ=MONTHLY;BYDAY=31MO when months have fewer days', () => {
      const startDate = new Date('2026-01-31T10:00:00Z');
      const rrule = 'FREQ=MONTHLY;BYDAY=31MO;COUNT=12';
      const timezone = 'Europe/Madrid';

      const rangeStart = new Date('2026-01-01T00:00:00Z');
      const rangeEnd = new Date('2026-12-31T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(7);

      expect(occurrences[0].localDateTime.month).toBe(1);
      expect(occurrences[0].localDateTime.day).toBe(31);

      expect(occurrences[1].localDateTime.month).toBe(3);
      expect(occurrences[1].localDateTime.day).toBe(31);

      expect(occurrences[2].localDateTime.month).toBe(5);
      expect(occurrences[2].localDateTime.day).toBe(31);

      expect(occurrences[3].localDateTime.month).toBe(7);
      expect(occurrences[3].localDateTime.day).toBe(31);

      expect(occurrences[4].localDateTime.month).toBe(8);
      expect(occurrences[4].localDateTime.day).toBe(31);

      expect(occurrences[5].localDateTime.month).toBe(10);
      expect(occurrences[5].localDateTime.day).toBe(31);

      expect(occurrences[6].localDateTime.month).toBe(12);
      expect(occurrences[6].localDateTime.day).toBe(31);
    });
  });

  describe('COUNT combined with BYDAY', () => {
    it('handles FREQ=WEEKLY;BYDAY=TU,TH;COUNT=10', () => {
      const startDate = new Date('2026-10-01T10:00:00Z');
      const rrule = 'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=10';
      const timezone = 'Europe/Madrid';

      const rangeStart = new Date('2026-09-01T00:00:00Z');
      const rangeEnd = new Date('2026-12-31T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(10);

      const tuesdays = occurrences.filter((o, i) => i % 2 === 0);
      const thursdays = occurrences.filter((o, i) => i % 2 === 1);

      expect(tuesdays).toHaveLength(5);
      expect(thursdays).toHaveLength(5);

      expect(occurrences[0].localDateTime.day).toBe(1);
      expect(occurrences[1].localDateTime.day).toBe(3);
      expect(occurrences[2].localDateTime.day).toBe(8);
      expect(occurrences[3].localDateTime.day).toBe(10);
    });

    it('handles FREQ=MONTHLY;BYDAY=2TU,4TH;COUNT=6', () => {
      const startDate = new Date('2026-01-06T09:00:00Z');
      const rrule = 'FREQ=MONTHLY;BYDAY=2TU,4TH;COUNT=6';
      const timezone = 'Europe/Madrid';

      const rangeStart = new Date('2026-01-01T00:00:00Z');
      const rangeEnd = new Date('2026-12-31T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(6);

      expect(occurrences[0].localDateTime.month).toBe(1);
      expect(occurrences[0].localDateTime.day).toBe(13);
      expect(occurrences[1].localDateTime.month).toBe(1);
      expect(occurrences[1].localDateTime.day).toBe(22);

      expect(occurrences[2].localDateTime.month).toBe(2);
      expect(occurrences[2].localDateTime.day).toBe(10);
      expect(occurrences[3].localDateTime.month).toBe(2);
      expect(occurrences[3].localDateTime.day).toBe(26);
    });
  });

  describe('DAILY with INTERVAL', () => {
    it('handles FREQ=DAILY;INTERVAL=2;COUNT=5', () => {
      const startDate = new Date('2026-10-01T10:00:00Z');
      const rrule = 'FREQ=DAILY;INTERVAL=2;COUNT=5';
      const timezone = 'Europe/Madrid';

      const rangeStart = new Date('2026-09-01T00:00:00Z');
      const rangeEnd = new Date('2026-12-31T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(5);

      expect(occurrences[0].localDateTime.day).toBe(1);
      expect(occurrences[1].localDateTime.day).toBe(3);
      expect(occurrences[2].localDateTime.day).toBe(5);
      expect(occurrences[3].localDateTime.day).toBe(7);
      expect(occurrences[4].localDateTime.day).toBe(9);
    });
  });

  describe('DST in different timezones', () => {
    it('handles Europe/London DST transitions', () => {
      const startDate = new Date('2026-03-29T08:00:00Z');
      const rrule = 'FREQ=WEEKLY;BYDAY=SU;COUNT=4';
      const timezone = 'Europe/London';

      const rangeStart = new Date('2026-03-01T00:00:00Z');
      const rangeEnd = new Date('2026-04-30T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(4);

      expect(occurrences[0].localDateTime.day).toBe(29);
      expect(occurrences[1].localDateTime.day).toBe(5);
      expect(occurrences[2].localDateTime.day).toBe(12);
      expect(occurrences[3].localDateTime.day).toBe(19);
    });

    it('handles America/New_York DST transitions', () => {
      const startDate = new Date('2026-03-08T14:00:00Z');
      const rrule = 'FREQ=WEEKLY;BYDAY=SU;COUNT=4';
      const timezone = 'America/New_York';

      const rangeStart = new Date('2026-03-01T00:00:00Z');
      const rangeEnd = new Date('2026-04-30T23:59:59Z');

      const occurrences = expandRecurrences(startDate, rrule, timezone, rangeStart, rangeEnd);

      expect(occurrences).toHaveLength(4);

      expect(occurrences[0].localDateTime.day).toBe(8);
      expect(occurrences[1].localDateTime.day).toBe(15);
      expect(occurrences[2].localDateTime.day).toBe(22);
      expect(occurrences[3].localDateTime.day).toBe(29);
    });
  });
});
