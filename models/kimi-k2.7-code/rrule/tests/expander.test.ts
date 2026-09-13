import { describe, it, expect } from 'vitest';
import { expand } from '../src/expander.js';
import { getParts } from '../src/timezone.js';

function localParts(ts: number, tzid: string) {
  return getParts(ts, tzid);
}

function iso(ts: number, tzid: string) {
  const p = localParts(ts, tzid);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

describe('expand', () => {
  it('weekly event keeps local time across Europe/Madrid October DST change', () => {
    // Europe/Madrid switches from CEST (UTC+2) to CET (UTC+1) on 27 Oct 2024 at 03:00.
    const tzid = 'Europe/Madrid';
    const dtstart = '2024-09-22T10:00:00'; // Sunday
    const rangeStart = new Date('2024-09-22T00:00:00Z');
    const rangeEnd = new Date('2024-11-10T00:00:00Z');

    const occurrences = expand(dtstart, 'FREQ=WEEKLY;BYDAY=SU', tzid, rangeStart, rangeEnd);

    // Every Sunday at 10:00 Europe/Madrid should appear.
    const localStrings = occurrences.map((d) => iso(d.getTime(), tzid));
    expect(localStrings).toEqual([
      '2024-09-22T10:00:00',
      '2024-09-29T10:00:00',
      '2024-10-06T10:00:00',
      '2024-10-13T10:00:00',
      '2024-10-20T10:00:00',
      '2024-10-27T10:00:00',
      '2024-11-03T10:00:00'
    ]);

    // Verify the UTC timestamps reflect the offset change.
    // 20 Oct 10:00 CEST (UTC+2) = 08:00 UTC
    // 27 Oct 10:00 CET  (UTC+1) = 09:00 UTC
    // The wall-clock interval is 7 days, but the UTC interval is 7 days + 1 hour.
    const beforeDst = occurrences.find((d) => iso(d.getTime(), tzid).startsWith('2024-10-20'))!;
    const afterDst = occurrences.find((d) => iso(d.getTime(), tzid).startsWith('2024-10-27'))!;
    expect(afterDst.getTime() - beforeDst.getTime()).toBe(169 * 60 * 60 * 1000);
  });

  it('returns last Friday of each month', () => {
    const tzid = 'Europe/Madrid';
    const dtstart = '2024-01-01T09:00:00';
    const rangeStart = new Date('2024-01-01T00:00:00Z');
    const rangeEnd = new Date('2024-07-01T00:00:00Z');

    const occurrences = expand(dtstart, 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=6', tzid, rangeStart, rangeEnd);

    const localStrings = occurrences.map((d) => iso(d.getTime(), tzid));
    expect(localStrings).toEqual([
      '2024-01-26T09:00:00',
      '2024-02-23T09:00:00',
      '2024-03-29T09:00:00',
      '2024-04-26T09:00:00',
      '2024-05-31T09:00:00',
      '2024-06-28T09:00:00'
    ]);
  });

  it('skips months that do not have the 31st day', () => {
    const tzid = 'UTC';
    const dtstart = '2024-01-31T14:30:00';
    const rangeStart = new Date('2024-01-01T00:00:00Z');
    const rangeEnd = new Date('2024-12-31T23:59:59Z');

    const occurrences = expand(dtstart, 'FREQ=MONTHLY;COUNT=5', tzid, rangeStart, rangeEnd);

    const localStrings = occurrences.map((d) => iso(d.getTime(), tzid));
    expect(localStrings).toEqual([
      '2024-01-31T14:30:00',
      '2024-03-31T14:30:00',
      '2024-05-31T14:30:00',
      '2024-07-31T14:30:00',
      '2024-08-31T14:30:00'
    ]);
  });

  it('combines COUNT with BYDAY positional rule', () => {
    const tzid = 'America/New_York';
    const dtstart = '2024-01-01T18:00:00';
    const rangeStart = new Date('2024-01-01T00:00:00Z');
    const rangeEnd = new Date('2024-12-31T23:59:59Z');

    const occurrences = expand(dtstart, 'FREQ=MONTHLY;BYDAY=2TU;COUNT=3', tzid, rangeStart, rangeEnd);

    const localStrings = occurrences.map((d) => iso(d.getTime(), tzid));
    expect(localStrings).toEqual([
      '2024-01-09T18:00:00',
      '2024-02-13T18:00:00',
      '2024-03-12T18:00:00'
    ]);
  });

  it('supports INTERVAL greater than 1', () => {
    const tzid = 'UTC';
    const dtstart = '2024-01-01T08:00:00';
    const rangeStart = new Date('2024-01-01T00:00:00Z');
    const rangeEnd = new Date('2024-02-01T00:00:00Z');

    const occurrences = expand(dtstart, 'FREQ=DAILY;INTERVAL=3;COUNT=4', tzid, rangeStart, rangeEnd);

    const localStrings = occurrences.map((d) => iso(d.getTime(), tzid));
    expect(localStrings).toEqual([
      '2024-01-01T08:00:00',
      '2024-01-04T08:00:00',
      '2024-01-07T08:00:00',
      '2024-01-10T08:00:00'
    ]);
  });

  it('respects UNTIL as an absolute instant', () => {
    const tzid = 'UTC';
    const dtstart = '2024-01-01T08:00:00';
    const rangeStart = new Date('2024-01-01T00:00:00Z');
    const rangeEnd = new Date('2024-02-01T00:00:00Z');

    const occurrences = expand(dtstart, 'FREQ=DAILY;UNTIL=20240104T080000Z', tzid, rangeStart, rangeEnd);

    const localStrings = occurrences.map((d) => iso(d.getTime(), tzid));
    expect(localStrings).toEqual([
      '2024-01-01T08:00:00',
      '2024-01-02T08:00:00',
      '2024-01-03T08:00:00',
      '2024-01-04T08:00:00'
    ]);
  });
});
