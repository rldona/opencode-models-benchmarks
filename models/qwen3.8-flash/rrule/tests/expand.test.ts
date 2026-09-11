import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  expandRecurrences,
  ExpansionLimitError,
  generateRecurrences,
  InvalidTimeZoneError,
  resolveInstant,
  RRuleError,
} from '../src/expand';
import { parseByDayToken, parseRRule, parseRuleDate } from '../src/rrule';

/** Local Madrid instants, spelled the way a human would: "09:00 in Madrid". */
const startTimes = (occurrences: { start: Date }[]): string[] =>
  occurrences.map((occurrence) => occurrence.start.toISOString());
const wallTimes = (occurrences: { wallStart: string }[]): string[] =>
  occurrences.map((occurrence) => occurrence.wallStart);
const localHourIn = (timeZone: string, occurrences: { start: Date }[]): number[] =>
  occurrences.map(
    (occurrence) =>
      Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone,
          hour: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(occurrence.start).find((part) => part.type === 'hour')?.value,
      ) % 24,
  );

describe('parseRRule', () => {
  it('parses the supported subset', () => {
    const rule = parseRRule('RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=+2TU,-1FR;COUNT=10');
    expect(rule).toMatchObject({ freq: 'MONTHLY', interval: 2, count: 10 });
    expect(rule.byDay).toEqual([
      { code: 'TU', ordinal: 2 },
      { code: 'FR', ordinal: -1 },
    ]);
    expect(parseByDayToken('+2TU').ordinal).toBe(2);
  });

  it('parses lowercase keys and comma lists', () => {
    const rule = parseRRule('freq=daily;interval=3;until=20261231T230000Z');
    expect(rule.freq).toBe('DAILY');
    expect(rule.interval).toBe(3);
    expect(rule.until).toEqual({ kind: 'absolute', instant: new Date('2026-12-31T23:00:00Z') });
  });

  it('keeps UNTIL floating vs absolute distinct', () => {
    expect(parseRuleDate('20260228T235959')).toEqual({
      kind: 'floating',
      wall: { year: 2026, month: 2, day: 28, hour: 23, minute: 59, second: 59, ms: 0 },
    });
    expect(parseRuleDate('20260228T235959Z').kind).toBe('absolute');
  });

  it('parses weekday tokens with and without ordinals', () => {
    expect(parseByDayToken('SU')).toEqual({ code: 'SU', ordinal: null });
    expect(parseByDayToken('-1FR')).toEqual({ code: 'FR', ordinal: -1 });
    expect(parseByDayToken('5MO')).toEqual({ code: 'MO', ordinal: 5 });
    expect(() => parseByDayToken('FRI')).toThrow(RRuleError);
    expect(() => parseByDayToken('0TU')).toThrow(RRuleError);
    expect(() => parseByDayToken('6TU')).toThrow(RRuleError);
  });

  it('rejects anything outside the supported subset', () => {
    expect(() => parseRRule('FREQ=YEARLY;COUNT=3')).toThrow(RRuleError);
    expect(() => parseRRule('FREQ=MONTHLY;BYMONTHDAY=15')).toThrow(/Unsupported RRULE part/);
    expect(() => parseRRule('FREQ=DAILY;BYDAY=MO')).toThrow(/not supported with FREQ=DAILY/);
    expect(() => parseRRule('FREQ=DAILY;COUNT=2;UNTIL=20261231T230000Z')).toThrow(
      /mutually exclusive/,
    );
    expect(() => parseRRule('FREQ=DAILY;INTERVAL=0')).toThrow(/INTERVAL/);
    expect(() => parseRRule('FREQ=DAILY;COUNT=0')).toThrow(/COUNT/);
    expect(() => parseRRule('')).toThrow(RRuleError);
  });

  it('tolerates (with a warning) ordinals in a WEEKLY rule', () => {
    const rule = parseRRule('FREQ=WEEKLY;BYDAY=2MO,WE');
    expect(rule.byDay).toEqual([
      { code: 'MO', ordinal: null },
      { code: 'WE', ordinal: null },
    ]);
    expect(rule.warnings).toHaveLength(1);
  });
});

describe('weekly series crossing the October 2025 DST change (Europe/Madrid)', () => {
  const occurrences = expandRecurrences({
    dtstart: '2025-10-22T09:00',
    rrule: 'FREQ=WEEKLY;COUNT=4',
    timeZone: 'Europe/Madrid',
    from: '2025-10-01T00:00',
    to: '2025-12-01T00:00',
    durationMs: 60 * 60_000,
  });

  it('returns one occurrence per week from dtstart', () => {
    expect(occurrences).toHaveLength(4);
    expect(wallTimes(occurrences)).toEqual([
      '2025-10-22T09:00:00',
      '2025-10-29T09:00:00',
      '2025-11-05T09:00:00',
      '2025-11-12T09:00:00',
    ]);
  });

  it('keeps 09:00 local while the UTC offset changes from +02:00 to +01:00', () => {
    expect(localHourIn('Europe/Madrid', occurrences)).toEqual([9, 9, 9, 9]);
    expect(occurrences.map((occurrence) => occurrence.utcOffsetMinutes)).toEqual([
      120, 60, 60, 60,
    ]);
    // 09:00 before the change is 07:00Z, after the change it is 08:00Z.
    expect(startTimes(occurrences)).toEqual([
      '2025-10-22T07:00:00.000Z',
      '2025-10-29T08:00:00.000Z',
      '2025-11-05T08:00:00.000Z',
      '2025-11-12T08:00:00.000Z',
    ]);
  });

  it('derives end from durationMs on the same instant', () => {
    expect(occurrences[0]?.end.toISOString()).toBe('2025-10-22T08:00:00.000Z');
    expect(occurrences[1]?.end.toISOString()).toBe('2025-10-29T09:00:00.000Z');
  });

  it('tags every occurrence with a RECURRENCE-ID in the requested zone', () => {
    expect(occurrences[1]?.recurrenceId).toBe('TZID=Europe/Madrid:20251029T090000');
  });
});

describe('DST boundary cases', () => {
  it('pushes a spring-forward 02:30 weekly Sunday to the transition instant', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-03-15T02:30',
      rrule: 'FREQ=WEEKLY;BYDAY=SU;COUNT=4',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-03-15T02:30:00',
      '2026-03-22T02:30:00',
      '2026-03-29T02:30:00',
      '2026-04-05T02:30:00',
    ]);
    expect(startTimes(occurrences)).toEqual([
      '2026-03-15T01:30:00.000Z',
      '2026-03-22T01:30:00.000Z',
      '2026-03-29T01:00:00.000Z', // 02:30 never existed on 2026-03-29
      '2026-04-05T00:30:00.000Z',
    ]);
    expect(occurrences.map((occurrence) => occurrence.status)).toEqual([
      'exact',
      'exact',
      'nonexistent',
      'exact',
    ]);
  });

  it('uses the first pass of a repeated (fall-back) wall clock', () => {
    const occurrences = expandRecurrences({
      dtstart: '2025-10-05T02:30',
      rrule: 'FREQ=WEEKLY;BYDAY=SU;COUNT=5',
      timeZone: 'Europe/Madrid',
    });
    expect(startTimes(occurrences)).toEqual([
      '2025-10-05T00:30:00.000Z',
      '2025-10-12T00:30:00.000Z',
      '2025-10-19T00:30:00.000Z',
      '2025-10-26T00:30:00.000Z', // 02:30 occurs twice; first pass wins
      '2025-11-02T01:30:00.000Z',
    ]);
    expect(occurrences.map((occurrence) => occurrence.status)).toEqual([
      'exact',
      'exact',
      'exact',
      'ambiguous',
      'exact',
    ]);
  });

  it('keeps a fixed local time stable in a southern-hemisphere zone', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-09-24T17:00',
      rrule: 'FREQ=WEEKLY;BYDAY=TH;COUNT=3',
      timeZone: 'Pacific/Auckland',
    });
    expect(occurrences.map((occurrence) => occurrence.utcOffsetMinutes)).toEqual([
      720, 780, 780,
    ]);
    expect(startTimes(occurrences)).toEqual([
      '2026-09-24T05:00:00.000Z',
      '2026-10-01T04:00:00.000Z',
      '2026-10-08T04:00:00.000Z',
    ]);
  });
});

describe('last Friday of every month (BYDAY=-1FR)', () => {
  const occurrences = expandRecurrences({
    dtstart: '2026-01-30T18:00',
    rrule: 'FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20260630T225959Z',
    timeZone: 'Europe/Madrid',
  });

  it('resolves the ordinal against each month separately', () => {
    expect(wallTimes(occurrences)).toEqual([
      '2026-01-30T18:00:00',
      '2026-02-27T18:00:00',
      '2026-03-27T18:00:00',
      '2026-04-24T18:00:00',
      '2026-05-29T18:00:00',
      '2026-06-26T18:00:00',
    ]);
  });

  it('stores 18:00 local as 17:00Z in winter and 16:00Z in summer', () => {
    expect(startTimes(occurrences)).toEqual([
      '2026-01-30T17:00:00.000Z',
      '2026-02-27T17:00:00.000Z',
      '2026-03-27T17:00:00.000Z',
      '2026-04-24T16:00:00.000Z',
      '2026-05-29T16:00:00.000Z',
      '2026-06-26T16:00:00.000Z',
    ]);
  });

  it('stops at UNTIL, inclusive', () => {
    expect(
      expandRecurrences({
        dtstart: '2026-01-30T18:00',
        rrule: 'FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20260424T160000Z',
        timeZone: 'Europe/Madrid',
      }),
    ).toHaveLength(4);
  });

  it('supports several BYDAY entries and both ordinal directions', () => {
    const mixed = expandRecurrences({
      dtstart: '2026-01-01T08:00',
      rrule: 'FREQ=MONTHLY;BYDAY=-1FR,1MO;UNTIL=20260331T230000',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(mixed)).toEqual([
      '2026-01-05T08:00:00',
      '2026-01-30T08:00:00',
      '2026-02-02T08:00:00',
      '2026-02-27T08:00:00',
      '2026-03-02T08:00:00',
      '2026-03-27T08:00:00',
    ]);
  });

  it('skips months without a 5th weekday', () => {
    const fifthMonday = expandRecurrences({
      dtstart: '2026-01-01T08:00',
      rrule: 'FREQ=MONTHLY;BYDAY=5MO;COUNT=2',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(fifthMonday)).toEqual(['2026-03-30T08:00:00', '2026-06-29T08:00:00']);
  });
});

describe('months without day 31', () => {
  it('omits the months that have no matching day-of-month', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-01-31T09:00',
      rrule: 'FREQ=MONTHLY;COUNT=4',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-01-31T09:00:00',
      '2026-03-31T09:00:00',
      '2026-05-31T09:00:00',
      '2026-07-31T09:00:00',
    ]);
  });

  it('does not shift INTERVAL=1 anchors either, and keeps the local time', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-01-31T23:30',
      rrule: 'FREQ=MONTHLY;UNTIL=20260701T000000',
      timeZone: 'Europe/Madrid',
    });
    expect(occurrences.map((occurrence) => occurrence.recurrenceId)).toEqual([
      'TZID=Europe/Madrid:20260131T233000',
      'TZID=Europe/Madrid:20260331T233000',
      'TZID=Europe/Madrid:20260531T233000',
    ]);
  });

  it('handles a 29 February anchor across non-leap years', () => {
    const occurrences = expandRecurrences({
      dtstart: '2024-02-29T12:00',
      // INTERVAL=12 months = yearly: only leap years have a 29 February.
      rrule: 'FREQ=MONTHLY;INTERVAL=12;COUNT=3',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2024-02-29T12:00:00',
      '2028-02-29T12:00:00',
      '2032-02-29T12:00:00',
    ]);
  });
});

describe('COUNT combined with BYDAY', () => {
  it('counts WEEKLY occurrences in week order from dtstart', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-01-28T09:00', // Wednesday
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-01-28T09:00:00',
      '2026-01-30T09:00:00',
      '2026-02-02T09:00:00',
      '2026-02-04T09:00:00',
      '2026-02-06T09:00:00',
      '2026-02-09T09:00:00',
      '2026-02-11T09:00:00',
    ]);
  });

  it('respects INTERVAL with BYDAY (bi-weekly Mon/Wed/Fri)', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-01-28T09:00',
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=6',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-01-28T09:00:00',
      '2026-01-30T09:00:00',
      '2026-02-09T09:00:00',
      '2026-02-11T09:00:00',
      '2026-02-13T09:00:00',
      '2026-02-23T09:00:00',
    ]);
  });

  it('counts MONTHLY BYDAY occurrences, skipping empty months', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-01-13T10:00', // 2nd Tuesday of January 2026
      rrule: 'FREQ=MONTHLY;BYDAY=2TU;COUNT=6',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-01-13T10:00:00',
      '2026-02-10T10:00:00',
      '2026-03-10T10:00:00',
      '2026-04-14T10:00:00',
      '2026-05-12T10:00:00',
      '2026-06-09T10:00:00',
    ]);
  });

  it('counts COUNT from dtstart even when the window starts later', () => {
    const all = expandRecurrences({
      dtstart: '2026-01-01T09:00',
      rrule: 'FREQ=DAILY;COUNT=10',
      timeZone: 'Europe/Madrid',
    });
    expect(all).toHaveLength(10);
    const windowed = expandRecurrences({
      dtstart: '2026-01-01T09:00',
      rrule: 'FREQ=DAILY;COUNT=10',
      timeZone: 'Europe/Madrid',
      from: '2026-01-07T00:00',
      to: '2026-01-31T00:00',
    });
    expect(wallTimes(windowed)).toEqual([
      '2026-01-07T09:00:00',
      '2026-01-08T09:00:00',
      '2026-01-09T09:00:00',
      '2026-01-10T09:00:00',
    ]);
  });

  it('stops the window as soon as it is past "to", even with COUNT unmet', () => {
    const windowed = expandRecurrences({
      dtstart: '2026-01-28T09:00',
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=30',
      timeZone: 'Europe/Madrid',
      to: '2026-01-31T23:59',
    });
    expect(windowed).toHaveLength(2);
    expect(wallTimes(windowed)).toEqual(['2026-01-28T09:00:00', '2026-01-30T09:00:00']);
  });
});

describe('DST coverage around the spring-forward change (Europe/Madrid 2026-03-29)', () => {
  it('shifts the UTC time of a weekly Wednesday by one hour', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-03-18T09:00',
      rrule: 'FREQ=WEEKLY;BYDAY=WE;COUNT=3',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-03-18T09:00:00',
      '2026-03-25T09:00:00',
      '2026-04-01T09:00:00',
    ]);
    expect(startTimes(occurrences)).toEqual([
      '2026-03-18T08:00:00.000Z',
      '2026-03-25T08:00:00.000Z',
      '2026-04-01T07:00:00.000Z',
    ]);
    expect(occurrences.map((occurrence) => occurrence.utcOffsetMinutes)).toEqual([60, 60, 120]);
    expect(occurrences.every((occurrence) => occurrence.status === 'exact')).toBe(true);
  });

  it('keeps a late-night DAILY time stable and never skips a day', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-03-27T23:30',
      rrule: 'FREQ=DAILY;COUNT=4',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-03-27T23:30:00',
      '2026-03-28T23:30:00',
      '2026-03-29T23:30:00',
      '2026-03-30T23:30:00',
    ]);
    expect(startTimes(occurrences)).toEqual([
      '2026-03-27T22:30:00.000Z',
      '2026-03-28T22:30:00.000Z',
      '2026-03-29T21:30:00.000Z',
      '2026-03-30T21:30:00.000Z',
    ]);
  });

  it('starts a WEEKLY series on the requested weekday, not on the dtstart weekday', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-01-30T09:00', // Friday
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=4',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-01-30T09:00:00',
      '2026-02-02T09:00:00',
      '2026-02-04T09:00:00',
      '2026-02-06T09:00:00',
    ]);
  });

  it('is a no-op for zones without DST (Asia/Kolkata)', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-01-14T09:00',
      rrule: 'FREQ=WEEKLY;BYDAY=WE;COUNT=3',
      timeZone: 'Asia/Kolkata',
      durationMs: 90 * 60_000,
    });
    expect(startTimes(occurrences)).toEqual([
      '2026-01-14T03:30:00.000Z',
      '2026-01-21T03:30:00.000Z',
      '2026-01-28T03:30:00.000Z',
    ]);
    expect(occurrences.map((occurrence) => occurrence.utcOffsetMinutes)).toEqual([330, 330, 330]);
    expect(occurrences[0]?.end.toISOString()).toBe('2026-01-14T05:00:00.000Z');
  });

  it('supports UTC as a time zone', () => {
    const occurrences = expandRecurrences({
      dtstart: new Date('2026-10-28T06:00:00Z'),
      rrule: 'FREQ=WEEKLY;BYDAY=WE;COUNT=2',
      timeZone: 'UTC',
    });
    expect(startTimes(occurrences)).toEqual([
      '2026-10-28T06:00:00.000Z',
      '2026-11-04T06:00:00.000Z',
    ]);
    expect(occurrences.map((occurrence) => occurrence.utcOffsetMinutes)).toEqual([0, 0]);
  });
});

describe('frequency and window basics', () => {
  it('expands MONTHLY BYDAY without ordinal (every Tuesday and Thursday)', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-01-01T14:00', // Thursday
      rrule: 'FREQ=MONTHLY;BYDAY=TU,TH;COUNT=9',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-01-01T14:00:00',
      '2026-01-06T14:00:00',
      '2026-01-08T14:00:00',
      '2026-01-13T14:00:00',
      '2026-01-15T14:00:00',
      '2026-01-20T14:00:00',
      '2026-01-22T14:00:00',
      '2026-01-27T14:00:00',
      '2026-01-29T14:00:00',
    ]);
  });

  it('expands DAILY with INTERVAL on the wall clock', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-02-26T20:00',
      rrule: 'FREQ=DAILY;INTERVAL=3;COUNT=4',
      timeZone: 'Europe/Madrid',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-02-26T20:00:00',
      '2026-03-01T20:00:00',
      '2026-03-04T20:00:00',
      '2026-03-07T20:00:00',
    ]);
  });

  it('filters to [from, to] inclusive on both ends', () => {
    const occurrences = expandRecurrences({
      dtstart: '2026-06-01T08:00',
      rrule: 'FREQ=DAILY;UNTIL=20260610T060000Z',
      timeZone: 'Europe/Madrid',
      from: '2026-06-03T08:00',
      to: '2026-06-05T08:00',
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-06-03T08:00:00',
      '2026-06-04T08:00:00',
      '2026-06-05T08:00:00',
    ]);
  });

  it('returns nothing when the window misses the series', () => {
    expect(
      expandRecurrences({
        dtstart: '2026-01-05T09:00',
        rrule: 'FREQ=WEEKLY;COUNT=2',
        timeZone: 'Europe/Madrid',
        from: '2027-01-01T00:00',
      }),
    ).toEqual([]);
  });

  it('accepts a rule object and epoch-millisecond bounds', () => {
    const occurrences = expandRecurrences({
      dtstart: Date.parse('2026-01-01T08:00:00Z'),
      rrule: { freq: 'monthly', byDay: [{ code: 'FR', ordinal: -1 }], count: 3 },
      timeZone: 'Europe/Madrid',
      from: Date.parse('2026-02-01T00:00:00Z'),
    });
    expect(wallTimes(occurrences)).toEqual([
      '2026-02-27T09:00:00',
      '2026-03-27T09:00:00',
    ]);
  });

  it('resolves bare local strings through the zone and ISO instants directly', () => {
    expect(resolveInstant('2026-01-30T18:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-01-30T17:00:00.000Z',
    );
    expect(resolveInstant('2026-07-30T18:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-07-30T16:00:00.000Z',
    );
    expect(resolveInstant('2026-01-30T18:00:00Z', 'Europe/Madrid').toISOString()).toBe(
      '2026-01-30T18:00:00.000Z',
    );
    expect(() => resolveInstant('not a date', 'Europe/Madrid')).toThrow(RRuleError);
  });

  it('is lazy: generateRecurrences stops at the first match', () => {
    const first = generateRecurrences({
      dtstart: '2026-01-01T09:00',
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timeZone: 'Europe/Madrid',
      maxOccurrences: 1,
    }).next();
    expect(first.done).toBe(false);
    expect(first.value?.wallStart).toBe('2026-01-01T09:00:00');
  });

  it('fast-forwards a distant window to the same result as walking from dtstart', () => {
    const base = {
      dtstart: '2026-01-30T18:00',
      rrule: 'FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20460101T000000Z',
      timeZone: 'Europe/Madrid',
    } as const;
    const from = 'TZID=Europe/Madrid:20450101';
    const walked = expandRecurrences({ ...base, maxIterations: 100_000 })
      .filter((occurrence) => occurrence.recurrenceId >= from)
      .map((occurrence) => occurrence.recurrenceId);
    const jumped = expandRecurrences({ ...base, from: '2045-01-01T00:00' }).map(
      (occurrence) => occurrence.recurrenceId,
    );
    expect(jumped).toHaveLength(12);
    expect(jumped).toEqual(walked);
    expect(jumped[0]).toBe('TZID=Europe/Madrid:20450127T180000');
    expect(jumped.at(-1)).toBe('TZID=Europe/Madrid:20451229T180000');
  });
});

describe('errors and guards', () => {
  it('rejects an unbounded rule', () => {
    expect(() =>
      expandRecurrences({
        dtstart: '2026-01-01T09:00',
        rrule: 'FREQ=DAILY',
        timeZone: 'Europe/Madrid',
      }),
    ).toThrow(/Unbounded expansion/);
  });

  it('rejects an inverted window and an unknown zone', () => {
    expect(() =>
      expandRecurrences({
        dtstart: '2026-01-01T09:00',
        rrule: 'FREQ=DAILY;COUNT=2',
        timeZone: 'Europe/Madrid',
        from: '2026-05-01T00:00',
        to: '2026-01-01T00:00',
      }),
    ).toThrow(/from" is after "to/);
    expect(() =>
      expandRecurrences({
        dtstart: '2026-01-01T09:00',
        rrule: 'FREQ=DAILY;COUNT=2',
        timeZone: 'Europe/Madriz',
      }),
    ).toThrow(InvalidTimeZoneError);
  });

  it('honours maxIterations instead of looping forever', () => {
    expect(() =>
      expandRecurrences({
        dtstart: '2026-01-01T09:00',
        rrule: 'FREQ=DAILY;UNTIL=21260101T000000Z',
        timeZone: 'Europe/Madrid',
        maxIterations: 100,
      }),
    ).toThrow(ExpansionLimitError);
  });

  it('ships without runtime dependencies', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).toEqual({});
    // Only the test runner, the compiler and Node's type definitions (types only).
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
      '@types/node',
      'typescript',
      'vitest',
    ]);
    expect(Object.values(pkg.devDependencies ?? {}).every((range) => typeof range === 'string')).toBe(
      true,
    );
  });
});

describe('public entry point (src/index.ts)', () => {
  it('exposes the expander, the parser and the timezone helpers', async () => {
    const api = await import('../src/index');
    expect(Object.keys(api).sort()).toEqual(
      [
        'ExpansionLimitError',
        'FREQUENCIES',
        'InvalidTimeZoneError',
        'RRuleError',
        'WEEKDAY_CODES',
        'daysInMonth',
        'expandRecurrences',
        'formatWallIso',
        'formatWallLocal',
        'generateRecurrences',
        'instantToWall',
        'normalizeRule',
        'nthWeekdayOfMonth',
        'offsetAt',
        'offsetMinutesAt',
        'parseByDayToken',
        'parseRRule',
        'parseRuleDate',
        'resolveInstant',
        'resolveRule',
        'wallToInstant',
        'weekdayIndexOfCode',
        'weekdaysOfMonth',
      ].sort(),
    );
    expect(
      api
        .expandRecurrences({
          dtstart: '2026-01-30T18:00',
          rrule: 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=1',
          timeZone: 'Europe/Madrid',
        })
        .map((occurrence: { start: Date }) => occurrence.start.toISOString()),
    ).toEqual(['2026-01-30T17:00:00.000Z']);
  });
});
