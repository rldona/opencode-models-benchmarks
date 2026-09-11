import { describe, expect, it } from 'vitest';
import { expand } from '../src';
import { isoAll, localAll } from './helpers';

const MADRID = 'Europe/Madrid';

describe('último viernes de mes', () => {
  it('FREQ=MONTHLY;BYDAY=-1FR devuelve el último viernes de cada mes', () => {
    const occurrences = expand({
      start: '2026-01-01T10:00:00',
      rule: 'FREQ=MONTHLY;BYDAY=-1FR',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-07-01T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-30 10:00',
      '2026-02-27 10:00',
      '2026-03-27 10:00',
      '2026-04-24 10:00',
      '2026-05-29 10:00',
      '2026-06-26 10:00',
    ]);
    expect(isoAll(occurrences)).toEqual([
      '2026-01-30T09:00:00.000Z',
      '2026-02-27T09:00:00.000Z',
      '2026-03-27T09:00:00.000Z',
      '2026-04-24T08:00:00.000Z',
      '2026-05-29T08:00:00.000Z',
      '2026-06-26T08:00:00.000Z',
    ]);
  });

  it('FREQ=MONTHLY;BYDAY=-1FR afecta sólo al último viernes, no a todos', () => {
    const occurrences = expand({
      start: '2026-01-01T10:00:00',
      rule: 'FREQ=MONTHLY;BYDAY=-1FR',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-02-01T00:00:00Z',
    });
    expect(localAll(occurrences, MADRID)).toEqual(['2026-01-30 10:00']);
  });

  it('FREQ=MONTHLY;BYDAY=FR devuelve todos los viernes del mes', () => {
    const occurrences = expand({
      start: '2026-01-01T10:00:00',
      rule: 'FREQ=MONTHLY;BYDAY=FR',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-02-01T00:00:00Z',
    });
    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-02 10:00',
      '2026-01-09 10:00',
      '2026-01-16 10:00',
      '2026-01-23 10:00',
      '2026-01-30 10:00',
    ]);
  });
});

describe('meses sin el día 31', () => {
  it('FREQ=MONTHLY desde el 31 de enero salta los meses que no tienen día 31', () => {
    const occurrences = expand({
      start: '2026-01-31T12:00:00',
      rule: 'FREQ=MONTHLY',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-08-01T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-31 12:00',
      '2026-03-31 12:00',
      '2026-05-31 12:00',
      '2026-07-31 12:00',
    ]);
    expect(isoAll(occurrences)).toEqual([
      '2026-01-31T11:00:00.000Z',
      '2026-03-31T10:00:00.000Z',
      '2026-05-31T10:00:00.000Z',
      '2026-07-31T10:00:00.000Z',
    ]);
  });

  it('el 30 de enero sólo salta febrero (y no febrero de año bisiesto)', () => {
    const occurrences = expand({
      start: '2026-01-30T12:00:00',
      rule: 'FREQ=MONTHLY',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-05-01T00:00:00Z',
    });
    expect(localAll(occurrences, MADRID)).toEqual(['2026-01-30 12:00', '2026-03-30 12:00', '2026-04-30 12:00']);
  });

  it('BYMONTHDAY=-1 cae en el último día real de cada mes', () => {
    const occurrences = expand({
      start: '2026-01-15T09:00:00',
      rule: 'FREQ=MONTHLY;BYMONTHDAY=-1',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-05-01T00:00:00Z',
    });
    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-31 09:00',
      '2026-02-28 09:00',
      '2026-03-31 09:00',
      '2026-04-30 09:00',
    ]);
  });
});

describe('ordinales positivos e INTERVAL', () => {
  it('FREQ=MONTHLY;BYDAY=2TU devuelve el segundo martes de cada mes', () => {
    const occurrences = expand({
      start: '2026-01-01T08:00:00',
      rule: 'FREQ=MONTHLY;BYDAY=2TU',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-05-01T00:00:00Z',
    });

    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-13 08:00',
      '2026-02-10 08:00',
      '2026-03-10 08:00',
      '2026-04-14 08:00',
    ]);
    expect(isoAll(occurrences)).toEqual([
      '2026-01-13T07:00:00.000Z',
      '2026-02-10T07:00:00.000Z',
      '2026-03-10T07:00:00.000Z',
      '2026-04-14T06:00:00.000Z',
    ]);
  });

  it('un ordinal inexistente (5º lunes) se omite', () => {
    const occurrences = expand({
      start: '2026-02-01T08:00:00',
      rule: 'FREQ=MONTHLY;BYDAY=5MO',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2026-07-01T00:00:00Z',
    });
    expect(localAll(occurrences, MADRID)).toEqual(['2026-03-30 08:00', '2026-06-29 08:00']);
  });

  it('FREQ=MONTHLY;INTERVAL=3 salta meses', () => {
    const occurrences = expand({
      start: '2026-01-15T08:00:00',
      rule: 'FREQ=MONTHLY;INTERVAL=3',
      timeZone: MADRID,
      rangeStart: '2026-01-01T00:00:00Z',
      rangeEnd: '2027-01-01T00:00:00Z',
    });
    expect(localAll(occurrences, MADRID)).toEqual([
      '2026-01-15 08:00',
      '2026-04-15 08:00',
      '2026-07-15 08:00',
      '2026-10-15 08:00',
    ]);
  });
});
