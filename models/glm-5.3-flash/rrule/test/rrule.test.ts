import { describe, expect, it } from 'vitest';
import { expandEvents } from '../src/index.js';

const MADRID = 'Europe/Madrid';

function expand(start: string, rule: string, from: string, to: string, timeZone: string = MADRID) {
  return expandEvents({ start, rule, timeZone, from, to });
}

const utcs = (occ: ReturnType<typeof expand>) => occ.map((o) => o.utc);

describe('WEEKLY cruzando el cambio de hora de octubre en Europe/Madrid', () => {
  it('mantiene las 10:00 locales mientras la hora UTC pasa de 08:00Z a 09:00Z', () => {
    const occ = expand(
      '2026-09-24T10:00:00',
      'FREQ=WEEKLY',
      '2026-10-01T00:00:00Z',
      '2026-11-10T00:00:00Z'
    );
    expect(utcs(occ)).toEqual([
      '2026-10-01T08:00:00.000Z',
      '2026-10-08T08:00:00.000Z',
      '2026-10-15T08:00:00.000Z',
      '2026-10-22T08:00:00.000Z',
      '2026-10-29T09:00:00.000Z',
      '2026-11-05T09:00:00.000Z',
    ]);
    for (const o of occ) {
      expect(o.local).toMatch(/^2026-10-(01|08|15|22|29)|^2026-11-05/);
      expect(o.local).toMatch(/T10:00:00$/);
    }
  });
});

describe('último viernes de mes (FREQ=MONTHLY;BYDAY=-1FR)', () => {
  it('resuelve -1FR en meses de 28 a 31 días respetando el DST', () => {
    const occ = expand(
      '2026-09-25T09:00:00',
      'FREQ=MONTHLY;BYDAY=-1FR',
      '2026-09-01T00:00:00Z',
      '2026-12-31T23:59:59Z'
    );
    expect(occ.map((o) => o.local)).toEqual([
      '2026-09-25T09:00:00',
      '2026-10-30T09:00:00',
      '2026-11-27T09:00:00',
      '2026-12-25T09:00:00',
    ]);
    expect(utcs(occ)).toEqual([
      '2026-09-25T07:00:00.000Z',
      '2026-10-30T08:00:00.000Z',
      '2026-11-27T08:00:00.000Z',
      '2026-12-25T08:00:00.000Z',
    ]);
  });
});

describe('FREQ=MONTHLY sin BYDAY en un día 31', () => {
  it('salta los meses que no tienen día 31', () => {
    const occ = expand(
      '2026-01-31T12:00:00',
      'FREQ=MONTHLY',
      '2026-02-01T00:00:00Z',
      '2026-12-31T23:59:59Z'
    );
    expect(utcs(occ)).toEqual([
      '2026-03-31T10:00:00.000Z',
      '2026-05-31T10:00:00.000Z',
      '2026-07-31T10:00:00.000Z',
      '2026-08-31T10:00:00.000Z',
      '2026-10-31T11:00:00.000Z',
      '2026-12-31T11:00:00.000Z',
    ]);
    expect(occ).toHaveLength(6);
    expect(occ.every((o) => o.local.endsWith('T12:00:00'))).toBe(true);
  });
});

describe('COUNT combinado con BYDAY', () => {
  it('genera exactamente COUNT ocurrencias con BYDAY=TU,TH', () => {
    const occ = expand(
      '2026-09-01T10:00:00',
      'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5',
      '2026-08-01T00:00:00Z',
      '2026-12-31T00:00:00Z'
    );
    expect(utcs(occ)).toEqual([
      '2026-09-01T08:00:00.000Z',
      '2026-09-03T08:00:00.000Z',
      '2026-09-08T08:00:00.000Z',
      '2026-09-10T08:00:00.000Z',
      '2026-09-15T08:00:00.000Z',
    ]);
  });

  it('cuenta desde DTSTART aunque la ventana de búsqueda empiece después', () => {
    const occ = expand(
      '2026-09-01T10:00:00',
      'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5',
      '2026-09-14T00:00:00Z',
      '2026-12-31T00:00:00Z'
    );
    expect(utcs(occ)).toEqual(['2026-09-15T08:00:00.000Z']);
  });

  it('COUNT+BYDAY=-1FR mensual: DTSTART cuenta como primera ocurrencia', () => {
    const occ = expand(
      '2026-10-30T09:00:00',
      'FREQ=MONTHLY;BYDAY=-1FR;COUNT=3',
      '2026-10-01T00:00:00Z',
      '2026-12-31T23:59:59Z'
    );
    expect(occ.map((o) => o.local)).toEqual([
      '2026-10-30T09:00:00',
      '2026-11-27T09:00:00',
      '2026-12-25T09:00:00',
    ]);
  });
});

describe('BYDAY con ordinal positivo (2TU)', () => {
  it('da el segundo martes de cada mes', () => {
    const occ = expand(
      '2026-10-13T10:00:00',
      'FREQ=MONTHLY;BYDAY=2TU',
      '2026-10-01T00:00:00Z',
      '2027-01-31T23:59:59Z'
    );
    expect(utcs(occ)).toEqual([
      '2026-10-13T08:00:00.000Z',
      '2026-11-10T09:00:00.000Z',
      '2026-12-08T09:00:00.000Z',
      '2027-01-12T09:00:00.000Z',
    ]);
  });
});

describe('cambio de hora: hora inexistente y ambigua', () => {
  it('la hora inexistente del 29/03 se desplaza hacia delante (02:30 -> 03:30)', () => {
    const occ = expand(
      '2026-03-28T02:30:00',
      'FREQ=DAILY',
      '2026-03-28T00:00:00Z',
      '2026-04-01T00:00:00Z'
    );
    expect(occ.map((o) => o.local)).toEqual([
      '2026-03-28T02:30:00',
      '2026-03-29T03:30:00',
      '2026-03-30T02:30:00',
      '2026-03-31T02:30:00',
    ]);
    expect(utcs(occ)).toEqual([
      '2026-03-28T01:30:00.000Z',
      '2026-03-29T01:30:00.000Z',
      '2026-03-30T00:30:00.000Z',
      '2026-03-31T00:30:00.000Z',
    ]);
  });

  it('la hora ambigua del 25/10 usa la primera ocurrencia (02:30 CEST)', () => {
    const occ = expand(
      '2026-10-24T02:30:00',
      'FREQ=DAILY',
      '2026-10-24T00:00:00Z',
      '2026-10-27T00:00:00Z'
    );
    expect(occ.map((o) => o.local)).toEqual([
      '2026-10-24T02:30:00',
      '2026-10-25T02:30:00',
      '2026-10-26T02:30:00',
    ]);
    expect(utcs(occ)).toEqual([
      '2026-10-24T00:30:00.000Z',
      '2026-10-25T00:30:00.000Z',
      '2026-10-26T01:30:00.000Z',
    ]);
  });
});

describe('INTERVAL', () => {
  it('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE salta semanas alternas', () => {
    const occ = expand(
      '2026-09-02T08:00:00',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
      '2026-09-01T00:00:00Z',
      '2026-10-01T00:00:00Z'
    );
    expect(utcs(occ)).toEqual([
      '2026-09-02T06:00:00.000Z',
      '2026-09-14T06:00:00.000Z',
      '2026-09-16T06:00:00.000Z',
      '2026-09-28T06:00:00.000Z',
      '2026-09-30T06:00:00.000Z',
    ]);
  });
});

describe('UNTIL', () => {
  it('excluye la ocurrencia posterior a UNTIL', () => {
    const occ = expand(
      '2026-10-22T10:00:00',
      'FREQ=DAILY;UNTIL=20261025T080000Z',
      '2026-10-21T00:00:00Z',
      '2026-11-30T00:00:00Z'
    );
    expect(utcs(occ)).toEqual([
      '2026-10-22T08:00:00.000Z',
      '2026-10-23T08:00:00.000Z',
      '2026-10-24T08:00:00.000Z',
    ]);
  });

  it('UNTIL es inclusivo (la ocurrencia exacta en UNTIL se incluye)', () => {
    const occ = expand(
      '2026-10-22T10:00:00',
      'FREQ=DAILY;UNTIL=2026-10-22T08:00:00Z',
      '2026-10-21T00:00:00Z',
      '2026-11-30T00:00:00Z'
    );
    expect(utcs(occ)).toEqual(['2026-10-22T08:00:00.000Z']);
  });
});

describe('errores de validación', () => {
  it('rechaza FREQ no soportada', () => {
    expect(() =>
      expand('2026-01-01T00:00:00', 'FREQ=YEARLY', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')
    ).toThrow(/FREQ/);
  });

  it('rechaza BYDAY con FREQ=DAILY', () => {
    expect(() =>
      expand('2026-01-01T00:00:00', 'FREQ=DAILY;BYDAY=MO', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')
    ).toThrow(/BYDAY/);
  });

  it('rechaza BYDAY con ordinal en FREQ=WEEKLY', () => {
    expect(() =>
      expand('2026-01-01T00:00:00', 'FREQ=WEEKLY;BYDAY=2TU', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')
    ).toThrow(/ordinal/i);
  });

  it('rechaza una zona horaria no IANA', () => {
    expect(() =>
      expandEvents({
        start: '2026-01-01T00:00:00',
        rule: 'FREQ=DAILY',
        timeZone: 'Mars/Olympus_Mons',
        from: '2026-01-01T00:00:00Z',
        to: '2026-02-01T00:00:00Z',
      })
    ).toThrow(/time zone/);
  });

  it('rechaza INTERVAL inválido', () => {
    expect(() =>
      expand('2026-01-01T00:00:00', 'FREQ=DAILY;INTERVAL=0', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')
    ).toThrow(/INTERVAL/);
  });
});
