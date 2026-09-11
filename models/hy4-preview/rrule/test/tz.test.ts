import { describe, expect, it } from 'vitest';
import { civil, civilToInstant, formatInZone, instantToCivil, offsetMsAt } from '../src';

const MADRID = 'Europe/Madrid';

function iso(instant: number): string {
  return new Date(instant).toISOString();
}

describe('tz: conversión civil <-> instante', () => {
  it('respeta el offset de verano e invierno en Europe/Madrid', () => {
    expect(offsetMsAt(MADRID, Date.UTC(2025, 6, 1, 10, 0))).toBe(2 * 3600_000);
    expect(offsetMsAt(MADRID, Date.UTC(2025, 0, 1, 10, 0))).toBe(1 * 3600_000);
  });

  it('convierte una hora local en verano y en invierno', () => {
    expect(iso(civilToInstant(civil(2025, 7, 1, 9, 0), MADRID))).toBe('2025-07-01T07:00:00.000Z');
    expect(iso(civilToInstant(civil(2025, 1, 1, 9, 0), MADRID))).toBe('2025-01-01T08:00:00.000Z');
  });

  it('convierte un instante a hora local', () => {
    expect(formatInZone(Date.parse('2025-10-26T08:00:00Z'), MADRID)).toBe('2025-10-26 09:00:00');
    expect(formatInZone(Date.parse('2025-10-25T07:00:00Z'), MADRID)).toBe('2025-10-25 09:00:00');
  });

  it('hace round-trip instante -> civil -> instante', () => {
    for (const instant of [
      Date.parse('2025-03-30T01:30:00Z'),
      Date.parse('2025-10-26T00:30:00Z'),
      Date.parse('2025-10-26T08:00:00Z'),
      Date.parse('2026-03-29T01:00:00Z'),
    ]) {
      expect(civilToInstant(instantToCivil(instant, MADRID), MADRID)).toBe(instant);
    }
  });

  it('elige el instante anterior en horas locales ambiguas (fall-back)', () => {
    const ambiguous = civil(2025, 10, 26, 2, 30);
    expect(iso(civilToInstant(ambiguous, MADRID))).toBe('2025-10-26T00:30:00.000Z');
    expect(iso(civilToInstant(ambiguous, MADRID, { ambiguous: 'later' }))).toBe('2025-10-26T01:30:00.000Z');
    expect(formatInZone(civilToInstant(ambiguous, MADRID), MADRID)).toBe('2025-10-26 02:30:00');
  });

  it('desplaza hacia delante las horas locales inexistentes (spring-forward)', () => {
    const gap = civil(2026, 3, 29, 2, 30);
    expect(iso(civilToInstant(gap, MADRID))).toBe('2026-03-29T01:30:00.000Z');
    expect(formatInZone(civilToInstant(gap, MADRID), MADRID)).toBe('2026-03-29 03:30:00');
    expect(formatInZone(civilToInstant(gap, MADRID, { gap: 'backward' }), MADRID)).toBe('2026-03-29 01:30:00');
  });

  it('funciona con otras zonas IANA', () => {
    expect(formatInZone(Date.parse('2025-07-01T16:00:00Z'), 'America/New_York')).toBe('2025-07-01 12:00:00');
    expect(formatInZone(Date.parse('2025-01-01T17:00:00Z'), 'America/New_York')).toBe('2025-01-01 12:00:00');
    expect(iso(civilToInstant(civil(2025, 1, 1, 12, 0), 'UTC'))).toBe('2025-01-01T12:00:00.000Z');
  });

  it('lanza un error con zonas horarias desconocidas', () => {
    expect(() => civilToInstant(civil(2025, 1, 1), 'Europe/Atlantida')).toThrow(/desconocida/);
  });
});
