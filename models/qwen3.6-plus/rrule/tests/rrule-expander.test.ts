import { describe, it, expect } from 'vitest';
import { expandRRule, parseRRule } from '../src/rrule-expander';

function toLocalString(date: Date, timezone: string): string {
  return date.toLocaleString('en-GB', { timeZone: timezone, hour12: false });
}

describe('parseRRule', () => {
  it('parses basic FREQ and INTERVAL', () => {
    const rule = parseRRule('FREQ=WEEKLY;INTERVAL=2');
    expect(rule.freq).toBe('WEEKLY');
    expect(rule.interval).toBe(2);
  });

  it('parses BYDAY with ordinal', () => {
    const rule = parseRRule('FREQ=MONTHLY;BYDAY=2TU,-1FR');
    expect(rule.byDay).toEqual([
      { ordinal: 2, dayOfWeek: 2 },
      { ordinal: -1, dayOfWeek: 5 },
    ]);
  });

  it('parses COUNT and UNTIL', () => {
    const rule = parseRRule('FREQ=DAILY;COUNT=10;UNTIL=20241231T235959Z');
    expect(rule.count).toBe(10);
    expect(rule.until).toBeInstanceOf(Date);
  });
});

describe('DST crossing - Europe/Madrid', () => {
  it('weekly event maintains local hour when crossing October DST', () => {
    const tz = 'Europe/Madrid';
    const dtstart = '2024-10-20T10:00:00';
    const rrule = 'FREQ=WEEKLY;BYDAY=SU';
    const winStart = '2024-10-20T00:00:00Z';
    const winEnd = '2024-11-04T00:00:00Z';

    const occurrences = expandRRule(dtstart, rrule, tz, winStart, winEnd);

    expect(occurrences.length).toBe(3);

    const localHours = occurrences.map((o) => toLocalString(o.start, tz));

    for (const local of localHours) {
      expect(local).toContain('10:00:00');
    }

    expect(occurrences[0].start.toISOString()).toBe('2024-10-20T08:00:00.000Z');
    expect(occurrences[1].start.toISOString()).toBe('2024-10-27T09:00:00.000Z');
    expect(occurrences[2].start.toISOString()).toBe('2024-11-03T09:00:00.000Z');
  });

  it('weekly MO event crossing DST maintains 10:00 local', () => {
    const tz = 'Europe/Madrid';
    const dtstart = '2024-10-21T10:00:00';
    const rrule = 'FREQ=WEEKLY;BYDAY=MO';
    const winStart = '2024-10-21T00:00:00Z';
    const winEnd = '2024-11-05T00:00:00Z';

    const occurrences = expandRRule(dtstart, rrule, tz, winStart, winEnd);

    expect(occurrences.length).toBe(3);

    for (const occ of occurrences) {
      const local = toLocalString(occ.start, tz);
      expect(local).toContain('10:00:00');
    }

    expect(occurrences[0].start.toISOString()).toBe('2024-10-21T08:00:00.000Z');
    expect(occurrences[1].start.toISOString()).toBe('2024-10-28T09:00:00.000Z');
    expect(occurrences[2].start.toISOString()).toBe('2024-11-04T09:00:00.000Z');
  });
});

describe('Last Friday of month (-1FR)', () => {
  it('returns the last Friday of each month', () => {
    const tz = 'Europe/Madrid';
    const dtstart = '2024-01-26T14:00:00';
    const rrule = 'FREQ=MONTHLY;BYDAY=-1FR';
    const winStart = '2024-01-01T00:00:00Z';
    const winEnd = '2024-04-01T00:00:00Z';

    const occurrences = expandRRule(dtstart, rrule, tz, winStart, winEnd);

    expect(occurrences.length).toBe(3);

    const days = occurrences.map((o) => {
      return new Date(o.start.getTime() + (tz === 'Europe/Madrid' ? 3600000 : 0)).getUTCDate();
    });

    const dayNumbers = occurrences.map((o) => {
      const d = new Date(o.start);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        day: 'numeric',
      });
      return parseInt(formatter.format(d), 10);
    });

    expect(dayNumbers).toEqual([26, 23, 29]);
  });

  it('last Friday of February 2024 is 23', () => {
    const tz = 'Europe/Madrid';
    const dtstart = '2024-02-23T14:00:00';
    const rrule = 'FREQ=MONTHLY;BYDAY=-1FR';
    const winStart = '2024-02-01T00:00:00Z';
    const winEnd = '2024-03-01T00:00:00Z';

    const occurrences = expandRRule(dtstart, rrule, tz, winStart, winEnd);

    expect(occurrences.length).toBe(1);

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      day: 'numeric',
    });
    const day = parseInt(formatter.format(occurrences[0].start), 10);
    expect(day).toBe(23);
  });
});

describe('Months without day 31', () => {
  it('monthly on day 31 skips months that do not have 31', () => {
    const tz = 'Europe/Madrid';
    const dtstart = '2024-01-31T09:00:00';
    const rrule = 'FREQ=MONTHLY;BYMONTHDAY=31';
    const winStart = '2024-01-01T00:00:00Z';
    const winEnd = '2024-08-01T00:00:00Z';

    const occurrences = expandRRule(dtstart, rrule, tz, winStart, winEnd);

    expect(occurrences.length).toBe(4);

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'numeric',
      day: 'numeric',
    });

    const dates = occurrences.map((o) => formatter.format(o.start));

    expect(dates).toContain('1/31');
    expect(dates).toContain('3/31');
    expect(dates).toContain('5/31');
    expect(dates).toContain('7/31');
    expect(dates).not.toContain('2/31');
    expect(dates).not.toContain('4/31');
    expect(dates).not.toContain('6/31');
  });
});

describe('COUNT combined with BYDAY', () => {
  it('weekly with BYDAY=MO,WE and COUNT=5 stops after 5 occurrences', () => {
    const tz = 'Europe/Madrid';
    const dtstart = '2024-09-02T11:00:00';
    const rrule = 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5';
    const winStart = '2024-09-01T00:00:00Z';
    const winEnd = '2024-10-01T00:00:00Z';

    const occurrences = expandRRule(dtstart, rrule, tz, winStart, winEnd);

    expect(occurrences.length).toBe(5);

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
    });

    const weekdays = occurrences.map((o) => formatter.format(o.start));
    expect(weekdays).toContain('Mon, 9/2');
    expect(weekdays).toContain('Wed, 9/4');
    expect(weekdays).toContain('Mon, 9/9');
    expect(weekdays).toContain('Wed, 9/11');
    expect(weekdays).toContain('Mon, 9/16');
  });

  it('monthly with BYDAY=2TU and COUNT=3', () => {
    const tz = 'Europe/Madrid';
    const dtstart = '2024-01-09T15:00:00';
    const rrule = 'FREQ=MONTHLY;BYDAY=2TU;COUNT=3';
    const winStart = '2024-01-01T00:00:00Z';
    const winEnd = '2024-04-01T00:00:00Z';

    const occurrences = expandRRule(dtstart, rrule, tz, winStart, winEnd);

    expect(occurrences.length).toBe(3);

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      day: 'numeric',
    });

    const days = occurrences.map((o) => parseInt(formatter.format(o.start), 10));

    expect(days).toEqual([9, 13, 12]);
  });
});
