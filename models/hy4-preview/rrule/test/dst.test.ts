import { describe, expect, it } from 'vitest';
import { expand } from '../src';
import { isoAll, localAll } from './helpers';

const MADRID = 'Europe/Madrid';

describe('expansión semanal cruzando el cambio de hora de octubre (Europe/Madrid)', () => {
  const weekly = expand({
    start: '2025-10-05T09:00:00',
    rule: 'FREQ=WEEKLY;BYDAY=SU',
    timeZone: MADRID,
    rangeStart: '2025-10-01T00:00:00Z',
    rangeEnd: '2025-11-10T00:00:00Z',
  });

  it('devuelve todos los domingos del rango', () => {
    expect(localAll(weekly, MADRID)).toEqual([
      '2025-10-05 09:00',
      '2025-10-12 09:00',
      '2025-10-19 09:00',
      '2025-10-26 09:00',
      '2025-11-02 09:00',
      '2025-11-09 09:00',
    ]);
  });

  it('mantiene la hora local 09:00 y cambia el instante UTC tras el cambio de hora', () => {
    expect(isoAll(weekly)).toEqual([
      '2025-10-05T07:00:00.000Z',
      '2025-10-12T07:00:00.000Z',
      '2025-10-19T07:00:00.000Z',
      '2025-10-26T08:00:00.000Z',
      '2025-11-02T08:00:00.000Z',
      '2025-11-09T08:00:00.000Z',
    ]);
  });

  it('no pierde ni duplica ocurrencias en la semana del cambio de hora', () => {
    expect(weekly).toHaveLength(6);
    const crossingWeek = expand({
      start: '2025-10-05T09:00:00',
      rule: 'FREQ=WEEKLY;BYDAY=SU',
      timeZone: MADRID,
      rangeStart: '2025-10-25T00:00:00Z',
      rangeEnd: '2025-11-03T00:00:00Z',
    });
    expect(isoAll(crossingWeek)).toEqual(['2025-10-26T08:00:00.000Z', '2025-11-02T08:00:00.000Z']);
  });
});

describe('horas locales ambiguas e inexistentes', () => {
  it('repite la misma hora local en el fall-back (02:30 ocurre dos veces)', () => {
    const daily = expand({
      start: '2025-10-25T02:30:00',
      rule: 'FREQ=DAILY',
      timeZone: MADRID,
      rangeStart: '2025-10-24T00:00:00Z',
      rangeEnd: '2025-10-28T00:00:00Z',
    });

    expect(localAll(daily, MADRID)).toEqual(['2025-10-25 02:30', '2025-10-26 02:30', '2025-10-27 02:30']);
    expect(isoAll(daily)).toEqual([
      '2025-10-25T00:30:00.000Z',
      '2025-10-26T00:30:00.000Z',
      '2025-10-27T01:30:00.000Z',
    ]);
  });

  it('adelanta la hora local inexistente en el spring-forward', () => {
    const daily = expand({
      start: '2026-03-28T02:30:00',
      rule: 'FREQ=DAILY',
      timeZone: MADRID,
      rangeStart: '2026-03-27T00:00:00Z',
      rangeEnd: '2026-03-31T00:00:00Z',
    });

    expect(localAll(daily, MADRID)).toEqual(['2026-03-28 02:30', '2026-03-29 03:30', '2026-03-30 02:30']);
    expect(isoAll(daily)).toEqual([
      '2026-03-28T01:30:00.000Z',
      '2026-03-29T01:30:00.000Z',
      '2026-03-30T00:30:00.000Z',
    ]);
  });

  it('permite elegir la política de hora ambigua', () => {
    const later = expand({
      start: '2025-10-25T02:30:00',
      rule: 'FREQ=DAILY',
      timeZone: MADRID,
      rangeStart: '2025-10-24T00:00:00Z',
      rangeEnd: '2025-10-28T00:00:00Z',
      ambiguous: 'later',
    });

    expect(isoAll(later)).toEqual([
      '2025-10-25T00:30:00.000Z',
      '2025-10-26T01:30:00.000Z',
      '2025-10-27T01:30:00.000Z',
    ]);
  });
});

describe('rangos', () => {
  it('el rango es semiabierto [start, end)', () => {
    const occurrences = expand({
      start: '2025-10-05T09:00:00',
      rule: 'FREQ=WEEKLY;BYDAY=SU',
      timeZone: MADRID,
      rangeStart: '2025-10-12T07:00:00Z',
      rangeEnd: '2025-10-26T08:00:00Z',
    });
    expect(isoAll(occurrences)).toEqual(['2025-10-12T07:00:00.000Z', '2025-10-19T07:00:00.000Z']);
  });

  it('acepta fechas de inicio con offset explícito', () => {
    const occurrences = expand({
      start: '2025-10-05T07:00:00Z',
      rule: 'FREQ=WEEKLY;INTERVAL=2',
      timeZone: MADRID,
      rangeStart: '2025-10-01T00:00:00Z',
      rangeEnd: '2025-11-01T00:00:00Z',
    });
    expect(isoAll(occurrences)).toEqual(['2025-10-05T07:00:00.000Z', '2025-10-19T07:00:00.000Z']);
  });
});
