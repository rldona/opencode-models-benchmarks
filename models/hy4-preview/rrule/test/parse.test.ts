import { describe, expect, it } from 'vitest';
import { civil, parseRRule } from '../src';

describe('parseRRule', () => {
  it('parsea FREQ e INTERVAL', () => {
    expect(parseRRule('FREQ=DAILY;INTERVAL=3')).toMatchObject({ freq: 'DAILY', interval: 3, byDay: [], byMonthDay: [], wkst: 'MO' });
    expect(parseRRule('FREQ=WEEKLY').interval).toBe(1);
  });

  it('parsea BYDAY simple y con ordinal', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR').byDay).toEqual([
      { weekday: 'MO' },
      { weekday: 'WE' },
      { weekday: 'FR' },
    ]);
    expect(parseRRule('FREQ=MONTHLY;BYDAY=2TU,-1FR').byDay).toEqual([
      { ordinal: 2, weekday: 'TU' },
      { ordinal: -1, weekday: 'FR' },
    ]);
  });

  it('parsea COUNT y UNTIL (UTC y local)', () => {
    expect(parseRRule('FREQ=DAILY;COUNT=7').count).toBe(7);
    const utc = parseRRule('FREQ=DAILY;UNTIL=20260401T000000Z').until!;
    expect(utc).toEqual({ civil: civil(2026, 4, 1), utc: true, dateOnly: false });

    const localUntil = parseRRule('FREQ=DAILY;UNTIL=20260401T103000').until!;
    expect(localUntil).toEqual({ civil: civil(2026, 4, 1, 10, 30), utc: false, dateOnly: false });

    expect(parseRRule('FREQ=DAILY;UNTIL=20260401').until).toEqual({ civil: civil(2026, 4, 1), utc: false, dateOnly: true });
  });

  it('acepta el prefijo RRULE: y BYMONTHDAY negativo', () => {
    expect(parseRRule('RRULE:FREQ=MONTHLY;BYMONTHDAY=-1').byMonthDay).toEqual([-1]);
  });

  it('rechaza reglas inválidas', () => {
    expect(() => parseRRule('FREQ=HOURLY')).toThrow(/FREQ no soportado/);
    expect(() => parseRRule('FREQ=DAILY;BYDAY=XX')).toThrow(/BYDAY inválido/);
    expect(() => parseRRule('FREQ=DAILY;BYDAY=0MO')).toThrow(/ordinal 0/);
    expect(() => parseRRule('FREQ=DAILY;INTERVAL=0')).toThrow(/INTERVAL inválido/);
    expect(() => parseRRule('FREQ=DAILY;COUNT=-2')).toThrow(/COUNT inválido/);
    expect(() => parseRRule('FREQ=DAILY;BYMONTHDAY=32')).toThrow(/BYMONTHDAY inválido/);
    expect(() => parseRRule('FREQ=DAILY;UNTIL=2026-04-01')).toThrow(/UNTIL inválido/);
    expect(() => parseRRule('INTERVAL=2')).toThrow(/debe incluir FREQ/);
    expect(() => parseRRule('FREQ=DAILY;BYHOUR=9')).toThrow(/no soportado/);
  });
});
