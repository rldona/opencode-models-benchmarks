import { describe, expect, it } from 'vitest';
import { expand } from '../src';
import { isoAll, localAll } from './helpers';

const MADRID = 'Europe/Madrid';

describe('COUNT combinado con BYDAY', () => {
  it('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=7 genera 7 ocurrencias y se detiene', () => {
    const occurrences = expand({
      start: '2026-01-07T18:00:00',
      rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=7',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2027-01-01T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-07 18:00',
      '2026-01-09 18:00',
      '2026-01-19 18:00',
      '2026-01-21 18:00',
      '2026-01-23 18:00',
      '2026-02-02 18:00',
      '2026-02-04 18:00',
    ]);
    expect(isoAll(occurrences)).toEqual([
      '2026-01-07T17:00:00.000Z',
      '2026-01-09T17:00:00.000Z',
      '2026-01-19T17:00:00.000Z',
      '2026-01-21T17:00:00.000Z',
      '2026-01-23T17:00:00.000Z',
      '2026-02-02T17:00:00.000Z',
      '2026-02-04T17:00:00.000Z',
    ]);
  });

  it('FREQ=MONTHLY;BYDAY=2TU,-1FR;COUNT=4 alterna los dos ordinales del mes', () => {
    const occurrences = expand({
      start: '2026-01-01T09:00:00',
      rule: 'FREQ=MONTHLY;BYDAY=2TU,-1FR;COUNT=4',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2027-01-01T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-13 09:00',
      '2026-01-30 09:00',
      '2026-02-10 09:00',
      '2026-02-27 09:00',
    ]);
  });

  it('COUNT se cuenta desde DTSTART aunque el rango empiece después', () => {
    const occurrences = expand({
      start: '2026-01-01T09:00:00',
      rule: 'FREQ=MONTHLY;BYDAY=2TU,-1FR;COUNT=4',
      timeZone: MADRID,
      rangeStart: '2026-02-01T00:00:00Z',
      rangeEnd: '2027-01-01T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual(['2026-02-10 09:00', '2026-02-27 09:00']);
  });

  it('COUNT=1 devuelve sólo la primera ocurrencia', () => {
    const occurrences = expand({
      start: '2026-01-07T18:00:00',
      rule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=1',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2027-01-01T00:00:00Z',
    });
    expect(localAll(occurrences, MADRID)).toEqual(['2026-01-07 18:00']);
  });
});

describe('COUNT con UNTIL', () => {
  it('UNTIL corta antes de agotar COUNT', () => {
    const occurrences = expand({
      start: '2026-01-05T09:00:00',
      rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=10;UNTIL=20260209T000000Z',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-06-01T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-05 09:00',
      '2026-01-12 09:00',
      '2026-01-19 09:00',
      '2026-01-26 09:00',
      '2026-02-02 09:00',
    ]);
  });

  it('UNTIL local (sin Z) se interpreta en la zona horaria', () => {
    const occurrences = expand({
      start: '2026-01-01T00:00:00',
      rule: 'FREQ=DAILY;UNTIL=20260103T000000',
      timeZone: MADRID,
      rangeStart: '2025-12-31T00:00:00Z',
      rangeEnd: '2026-01-10T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual(['2026-01-01 00:00', '2026-01-02 00:00', '2026-01-03 00:00']);
    expect(isoAll(occurrences)).toEqual([
      '2025-12-31T23:00:00.000Z',
      '2026-01-01T23:00:00.000Z',
      '2026-01-02T23:00:00.000Z',
    ]);
  });

  it('UNTIL como fecha (sin hora) incluye todo el día', () => {
    const occurrences = expand({
      start: '2026-01-01T00:00:00',
      rule: 'FREQ=DAILY;UNTIL=20260103',
      timeZone: MADRID,
      rangeStart: '2025-12-31T00:00:00Z',
      rangeEnd: '2026-01-10T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual(['2026-01-01 00:00', '2026-01-02 00:00', '2026-01-03 00:00']);
  });

  it('UNTIL en UTC se compara como instante absoluto', () => {
    const occurrences = expand({
      start: '2026-01-01T00:00:00',
      rule: 'FREQ=DAILY;UNTIL=20260103T000000Z',
      timeZone: MADRID,
      rangeStart: '2025-12-31T00:00:00Z',
      rangeEnd: '2026-01-10T00:00:00Z',
    });

    expect(isoAll(occurrences)).toEqual(['2025-12-31T23:00:00.000Z', '2026-01-01T23:00:00.000Z', '2026-01-02T23:00:00.000Z']);
  });
});

describe('BYDAY con WKST y DAILY', () => {
  it('WKST=SU agrupa las semanas empezando en domingo', () => {
    const occurrences = expand({
      start: '2026-01-04T10:00:00',
      rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,SA;WKST=SU',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-02-01T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-04 10:00',
      '2026-01-10 10:00',
      '2026-01-18 10:00',
      '2026-01-24 10:00',
    ]);
  });

  it('FREQ=DAILY;BYDAY=MO,FR filtra los días de la semana', () => {
    const occurrences = expand({
      start: '2026-01-05T07:30:00',
      rule: 'FREQ=DAILY;BYDAY=MO,FR',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-01-20T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-05 07:30',
      '2026-01-09 07:30',
      '2026-01-12 07:30',
      '2026-01-16 07:30',
      '2026-01-19 07:30',
    ]);
  });
});
