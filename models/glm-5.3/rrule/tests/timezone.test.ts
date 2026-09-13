import { describe, expect, it } from 'vitest';
import { assertValidTimeZone, localToInstant, offsetMsAt, wallClockOf } from '../src/timezone.js';

const MADRID = 'Europe/Madrid';
const MS_HOUR = 3_600_000;

describe('offsetMsAt', () => {
  it('devuelve +2h en CEST y +1h en CET', () => {
    expect(offsetMsAt(Date.parse('2026-10-24T07:00:00Z'), MADRID)).toBe(2 * MS_HOUR);
    expect(offsetMsAt(Date.parse('2026-10-26T08:00:00Z'), MADRID)).toBe(1 * MS_HOUR);
  });
});

describe('localToInstant', () => {
  it('resuelve horas locales normales', () => {
    expect(localToInstant({ year: 2026, month: 10, day: 26, hour: 9, minute: 0, second: 0 }, MADRID)).toBe(
      Date.parse('2026-10-26T08:00:00Z')
    );
  });

  it('desplaza hacia adelante las horas inexistentes (cambio de marzo)', () => {
    expect(localToInstant({ year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 }, MADRID)).toBe(
      Date.parse('2026-03-29T01:30:00Z')
    );
  });

  it('elige la primera de las horas ambiguas (cambio de octubre)', () => {
    expect(localToInstant({ year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 }, MADRID)).toBe(
      Date.parse('2026-10-25T00:30:00Z')
    );
  });
});

describe('wallClockOf', () => {
  it('descompone instantes en hora local', () => {
    expect(wallClockOf(Date.parse('2026-10-25T00:30:00Z'), MADRID)).toEqual({
      year: 2026,
      month: 10,
      day: 25,
      hour: 2,
      minute: 30,
      second: 0,
    });
  });
});

describe('assertValidTimeZone', () => {
  it('rechaza zonas no válidas', () => {
    expect(() => assertValidTimeZone('Not/AZone')).toThrow(RangeError);
  });

  it('acepta zonas IANA válidas', () => {
    expect(() => assertValidTimeZone('Europe/Madrid')).not.toThrow();
  });
});
