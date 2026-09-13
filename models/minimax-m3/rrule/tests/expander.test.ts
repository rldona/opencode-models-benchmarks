import { describe, expect, it } from 'vitest';
import { expand, parseRRule } from '../src/index.js';

const utc = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date =>
  new Date(Date.UTC(y, m - 1, d, h, mi, s));

const iso = (d: Date): string => d.toISOString();

describe('parser', () => {
  it('parses FREQ, INTERVAL, BYDAY, COUNT', () => {
    const r = parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=10');
    expect(r.freq).toBe('WEEKLY');
    expect(r.interval).toBe(2);
    expect(r.count).toBe(10);
    expect(r.byday).toEqual([
      { weekday: 'MO' },
      { weekday: 'WE' },
      { weekday: 'FR' },
    ]);
  });

  it('parses positional BYDAY (positive and negative)', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=2TU').byday).toEqual([{ weekday: 'TU', pos: 2 }]);
    expect(parseRRule('FREQ=MONTHLY;BYDAY=-1FR').byday).toEqual([{ weekday: 'FR', pos: -1 }]);
    expect(parseRRule('FREQ=MONTHLY;BYDAY=+2WE').byday).toEqual([{ weekday: 'WE', pos: 2 }]);
  });

  it('parses UNTIL with Z suffix', () => {
    const r = parseRRule('FREQ=DAILY;UNTIL=20240105T235959Z');
    expect(r.until?.toISOString()).toBe('2024-01-05T23:59:59.000Z');
  });

  it('parses RRULE: prefix', () => {
    const r = parseRRule('RRULE:FREQ=DAILY;COUNT=3');
    expect(r.freq).toBe('DAILY');
    expect(r.count).toBe(3);
  });

  it('rejects invalid FREQ', () => {
    expect(() => parseRRule('FREQ=HOURLY')).toThrow();
  });

  it('rejects invalid BYDAY position', () => {
    expect(() => parseRRule('FREQ=MONTHLY;BYDAY=5MO')).toThrow();
    expect(() => parseRRule('FREQ=MONTHLY;BYDAY=0MO')).toThrow();
  });
});

describe('expand: DAILY', () => {
  it('basic DAILY with COUNT', () => {
    const out = expand(
      { freq: 'DAILY', count: 5 },
      utc(2024, 1, 1, 9, 0),
      utc(2024, 1, 1),
      utc(2024, 1, 31),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-01T09:00:00.000Z',
      '2024-01-02T09:00:00.000Z',
      '2024-01-03T09:00:00.000Z',
      '2024-01-04T09:00:00.000Z',
      '2024-01-05T09:00:00.000Z',
    ]);
  });

  it('DAILY with INTERVAL=2', () => {
    const out = expand(
      'FREQ=DAILY;INTERVAL=2;COUNT=5',
      utc(2024, 1, 1, 0, 0),
      utc(2024, 1, 1),
      utc(2024, 1, 31),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-01T00:00:00.000Z',
      '2024-01-03T00:00:00.000Z',
      '2024-01-05T00:00:00.000Z',
      '2024-01-07T00:00:00.000Z',
      '2024-01-09T00:00:00.000Z',
    ]);
  });

  it('DAILY with UNTIL (inclusive)', () => {
    const out = expand(
      'FREQ=DAILY;UNTIL=20240105T235959Z',
      utc(2024, 1, 1, 0, 0),
      utc(2024, 1, 1),
      utc(2024, 1, 31),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-01T00:00:00.000Z',
      '2024-01-02T00:00:00.000Z',
      '2024-01-03T00:00:00.000Z',
      '2024-01-04T00:00:00.000Z',
      '2024-01-05T00:00:00.000Z',
    ]);
  });
});

describe('expand: WEEKLY', () => {
  it('WEEKLY single weekday, no BYDAY uses dtstart weekday', () => {
    // 2024-01-03 is a Wednesday
    const out = expand(
      { freq: 'WEEKLY', count: 3 },
      utc(2024, 1, 3, 10, 0),
      utc(2024, 1, 1),
      utc(2024, 1, 31),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-03T10:00:00.000Z',
      '2024-01-10T10:00:00.000Z',
      '2024-01-17T10:00:00.000Z',
    ]);
  });

  it('WEEKLY with INTERVAL=2 and multi BYDAY', () => {
    // 2024-01-01 is a Monday; every other week, MO+WE
    const out = expand(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4',
      utc(2024, 1, 1, 9, 0),
      utc(2024, 1, 1),
      utc(2024, 2, 15),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-01T09:00:00.000Z', // Mon week 1
      '2024-01-03T09:00:00.000Z', // Wed week 1
      '2024-01-15T09:00:00.000Z', // Mon week 3
      '2024-01-17T09:00:00.000Z', // Wed week 3
    ]);
  });
});

describe('expand: MONTHLY', () => {
  it('MONTHLY with positive positional BYDAY (2nd Tuesday)', () => {
    const out = expand(
      'FREQ=MONTHLY;BYDAY=2TU;COUNT=3',
      utc(2024, 1, 1, 9, 0),
      utc(2024, 1, 1),
      utc(2024, 4, 1),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-09T09:00:00.000Z', // 2nd Tue of Jan
      '2024-02-13T09:00:00.000Z', // 2nd Tue of Feb
      '2024-03-12T09:00:00.000Z', // 2nd Tue of Mar
    ]);
  });
});

describe('required: WEEKLY crossing DST in Europe/Madrid', () => {
  it('keeps 10:00 local across the Oct 27 2024 DST end (CEST→CET)', () => {
    // dtstart wall clock: 2024-10-20 10:00 Madrid (Sunday) — still CEST, UTC+2
    // Oct 27 03:00 CEST = 01:00 UTC → clocks go back to 02:00 CET
    // Oct 27 10:00 Madrid is now CET, UTC+1
    // So occurrences in UTC:
    //   Oct 20 → 08:00Z (CEST)
    //   Oct 27 → 09:00Z (CET, shifted +1h)
    //   Nov  3 → 09:00Z (CET)
    const dtstart = utc(2024, 10, 20, 10, 0, 0);
    const out = expand(
      'FREQ=WEEKLY;BYDAY=SU',
      dtstart,
      utc(2024, 10, 13),
      utc(2024, 11, 10),
      'Europe/Madrid',
    );
    expect(out.map(iso)).toEqual([
      '2024-10-20T08:00:00.000Z',
      '2024-10-27T09:00:00.000Z',
      '2024-11-03T09:00:00.000Z',
    ]);
  });
});

describe('required: last Friday of month (BYDAY=-1FR)', () => {
  it('produces the last Friday of each month in 2024', () => {
    // dtstart 2024-01-26 09:00 (Friday, last Fri of Jan)
    const out = expand(
      'FREQ=MONTHLY;BYDAY=-1FR',
      utc(2024, 1, 26, 9, 0),
      utc(2024, 1, 1),
      utc(2025, 1, 1),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-26T09:00:00.000Z',
      '2024-02-23T09:00:00.000Z',
      '2024-03-29T09:00:00.000Z',
      '2024-04-26T09:00:00.000Z',
      '2024-05-31T09:00:00.000Z',
      '2024-06-28T09:00:00.000Z',
      '2024-07-26T09:00:00.000Z',
      '2024-08-30T09:00:00.000Z',
      '2024-09-27T09:00:00.000Z',
      '2024-10-25T09:00:00.000Z',
      '2024-11-29T09:00:00.000Z',
      '2024-12-27T09:00:00.000Z',
    ]);
  });
});

describe('required: MONTHLY with no BYDAY skips months without day 31', () => {
  it('emits only Jan/Mar/May/Jul/Aug/Oct/Dec', () => {
    const out = expand(
      { freq: 'MONTHLY' },
      utc(2024, 1, 31, 8, 0),
      utc(2024, 1, 1),
      utc(2025, 1, 1),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-31T08:00:00.000Z',
      '2024-03-31T08:00:00.000Z',
      '2024-05-31T08:00:00.000Z',
      '2024-07-31T08:00:00.000Z',
      '2024-08-31T08:00:00.000Z',
      '2024-10-31T08:00:00.000Z',
      '2024-12-31T08:00:00.000Z',
    ]);
  });
});

describe('required: COUNT combined with BYDAY (MO..FR)', () => {
  it('emits the first 10 weekdays starting from Mon 2024-01-01', () => {
    const out = expand(
      'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;COUNT=10',
      utc(2024, 1, 1, 9, 0),
      utc(2024, 1, 1),
      utc(2025, 1, 1),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-01T09:00:00.000Z', // Mon
      '2024-01-02T09:00:00.000Z', // Tue
      '2024-01-03T09:00:00.000Z', // Wed
      '2024-01-04T09:00:00.000Z', // Thu
      '2024-01-05T09:00:00.000Z', // Fri
      '2024-01-08T09:00:00.000Z', // Mon
      '2024-01-09T09:00:00.000Z', // Tue
      '2024-01-10T09:00:00.000Z', // Wed
      '2024-01-11T09:00:00.000Z', // Thu
      '2024-01-12T09:00:00.000Z', // Fri
    ]);
  });
});

describe('edge cases', () => {
  it('returns [] when rangeEnd <= rangeStart and no COUNT/UNTIL', () => {
    const out = expand(
      { freq: 'DAILY' },
      utc(2024, 1, 1),
      utc(2024, 1, 10),
      utc(2024, 1, 10),
      'UTC',
    );
    expect(out).toEqual([]);
  });

  it('respects rangeStart (skips occurrences before it)', () => {
    // dtstart Jan 1, but range starts Jan 10; should skip first 9 days
    const out = expand(
      { freq: 'DAILY', count: 3 },
      utc(2024, 1, 1, 8, 0),
      utc(2024, 1, 10, 0, 0),
      utc(2024, 1, 31),
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-10T08:00:00.000Z',
      '2024-01-11T08:00:00.000Z',
      '2024-01-12T08:00:00.000Z',
    ]);
  });

  it('respects rangeEnd (half-open)', () => {
    // Occurrence exactly at rangeEnd is excluded
    const out = expand(
      { freq: 'DAILY', count: 5 },
      utc(2024, 1, 1, 0, 0),
      utc(2024, 1, 1),
      utc(2024, 1, 4, 0, 0), // half-open: include up to Jan 3 23:59:59.999
      'UTC',
    );
    expect(out.map(iso)).toEqual([
      '2024-01-01T00:00:00.000Z',
      '2024-01-02T00:00:00.000Z',
      '2024-01-03T00:00:00.000Z',
    ]);
  });
});
