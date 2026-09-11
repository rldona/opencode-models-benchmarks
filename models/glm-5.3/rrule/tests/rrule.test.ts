import { describe, expect, it } from 'vitest';
import { normalizeRule, parseRule, RuleError } from '../src/rrule.js';

describe('parseRule', () => {
  it('analiza todas las partes soportadas', () => {
    expect(parseRule('RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU,-1FR;COUNT=10')).toEqual({
      freq: 'MONTHLY',
      interval: 2,
      byDay: [
        { ord: 2, day: 'TU' },
        { ord: -1, day: 'FR' },
      ],
      count: 10,
    });
  });

  it('aplica valores por defecto', () => {
    expect(parseRule('FREQ=DAILY')).toEqual({ freq: 'DAILY' });
  });

  it('es tolerante con mayúsculas y espacios', () => {
    expect(parseRule('freq=weekly; byday=mo, fr')).toEqual({
      freq: 'WEEKLY',
      byDay: [{ day: 'MO' }, { day: 'FR' }],
    });
  });

  it('analiza UNTIL en formato iCalendar y en ISO', () => {
    expect(parseRule('FREQ=DAILY;UNTIL=20261231T235959Z').until).toEqual(
      new Date(Date.UTC(2026, 11, 31, 23, 59, 59))
    );
    expect(parseRule('FREQ=DAILY;UNTIL=2026-03-27T11:00:00Z').until).toEqual(
      new Date(Date.UTC(2026, 2, 27, 11))
    );
  });
});

describe('validación', () => {
  it.each([
    ['regla vacía', ''],
    ['solo prefijo RRULE', 'RRULE:'],
    ['FREQ ausente', 'BYDAY=MO'],
    ['FREQ no soportado', 'FREQ=YEARLY'],
    ['parte sin =', 'FREQ=DAILY;COUNT'],
    ['INTERVAL=0', 'FREQ=DAILY;INTERVAL=0'],
    ['INTERVAL negativo', 'FREQ=DAILY;INTERVAL=-1'],
    ['INTERVAL decimal', 'FREQ=DAILY;INTERVAL=1.5'],
    ['COUNT=0', 'FREQ=DAILY;COUNT=0'],
    ['COUNT no numérico', 'FREQ=DAILY;COUNT=abc'],
    ['COUNT y UNTIL juntos', 'FREQ=DAILY;COUNT=3;UNTIL=20261231T235959Z'],
    ['BYDAY con DAILY', 'FREQ=DAILY;BYDAY=MO'],
    ['ordinal en WEEKLY', 'FREQ=WEEKLY;BYDAY=2MO'],
    ['ordinal 0', 'FREQ=MONTHLY;BYDAY=0MO'],
    ['ordinal fuera de rango', 'FREQ=MONTHLY;BYDAY=99MO'],
    ['token no válido', 'FREQ=WEEKLY;BYDAY=MO,XYZ'],
    ['token vacío', 'FREQ=WEEKLY;BYDAY=MO,'],
    ['clave no soportada', 'FREQ=DAILY;WKST=SU'],
    ['clave duplicada', 'FREQ=DAILY;FREQ=WEEKLY'],
    ['UNTIL sin zona', 'FREQ=DAILY;UNTIL=2026-12-31'],
    ['UNTIL no válido', 'FREQ=DAILY;UNTIL=nope'],
  ])('lanza RuleError con %s', (_name, input) => {
    expect(() => parseRule(input)).toThrow(RuleError);
  });

  it('BYDAY vacío en formato objeto', () => {
    expect(() => normalizeRule({ freq: 'WEEKLY', byDay: [] })).toThrow(RuleError);
  });

  it('COUNT y UNTIL juntos en formato objeto', () => {
    expect(() => normalizeRule({ freq: 'DAILY', count: 2, until: '20261231T235959Z' })).toThrow(
      RuleError
    );
  });

  it('normalizeRule resuelve UNTIL como cadena a Date', () => {
    expect(normalizeRule({ freq: 'DAILY', until: '20261231T235959Z' })).toEqual({
      freq: 'DAILY',
      until: new Date(Date.UTC(2026, 11, 31, 23, 59, 59)),
    });
  });
});
