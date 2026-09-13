import { describe, expect, it } from 'vitest';
import { expandOccurrences } from '../src/index.js';
import { wallClockOf } from '../src/timezone.js';

const MADRID = 'Europe/Madrid';
const FROM_2026 = new Date('2026-01-01T00:00:00Z');
const TO_2027 = new Date('2027-01-01T00:00:00Z');

const iso = (dates: Date[]): string[] => dates.map((d) => d.toISOString());
const hourIn = (d: Date, tz: string): number => wallClockOf(d.getTime(), tz).hour;
const dayIn = (d: Date, tz: string): number => wallClockOf(d.getTime(), tz).day;
const monthIn = (d: Date, tz: string): number => wallClockOf(d.getTime(), tz).month;
const weekdayIn = (d: Date, tz: string): number => {
  const w = wallClockOf(d.getTime(), tz);
  return (new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7;
};

describe('eventos semanales que cruzan el cambio de hora de octubre (Europe/Madrid)', () => {
  it('mantienen la hora local 09:00 y desplazan el instante UTC una hora', () => {
    const occurrences = expandOccurrences({
      start: '2026-10-05T09:00',
      rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(iso(occurrences)).toEqual([
      '2026-10-05T07:00:00.000Z',
      '2026-10-12T07:00:00.000Z',
      '2026-10-19T07:00:00.000Z',
      '2026-10-26T08:00:00.000Z',
      '2026-11-02T08:00:00.000Z',
      '2026-11-09T08:00:00.000Z',
    ]);
    expect(occurrences.every((d) => hourIn(d, MADRID) === 9)).toBe(true);
    expect(occurrences.every((d) => weekdayIn(d, MADRID) === 0)).toBe(true);
  });

  it('un evento de viernes pasa de +02:00 a +01:00 entre el 23 y el 30 de octubre', () => {
    const occurrences = expandOccurrences({
      start: '2026-10-09T09:00',
      rule: 'FREQ=WEEKLY;BYDAY=FR;COUNT=4',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(iso(occurrences)).toEqual([
      '2026-10-09T07:00:00.000Z',
      '2026-10-16T07:00:00.000Z',
      '2026-10-23T07:00:00.000Z',
      '2026-10-30T08:00:00.000Z',
    ]);
  });

  it('el patrón manda: un inicio que no coincide con BYDAY no se emite', () => {
    const occurrences = expandOccurrences({
      start: '2026-10-07T09:00',
      rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(iso(occurrences)).toEqual(['2026-10-12T07:00:00.000Z', '2026-10-19T07:00:00.000Z']);
  });

  it('salta semanas completas con INTERVAL=2', () => {
    const occurrences = expandOccurrences({
      start: '2026-10-05T09:00',
      rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;COUNT=3',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(iso(occurrences)).toEqual([
      '2026-10-05T07:00:00.000Z',
      '2026-10-19T07:00:00.000Z',
      '2026-11-02T08:00:00.000Z',
    ]);
  });
});

describe('último viernes de mes (FREQ=MONTHLY;BYDAY=-1FR)', () => {
  it('genera el último viernes de cada mes de 2026 con día variable', () => {
    const occurrences = expandOccurrences({
      start: '2026-01-30T15:00',
      rule: 'FREQ=MONTHLY;BYDAY=-1FR',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(occurrences).toHaveLength(12);
    expect(occurrences.map((d) => dayIn(d, MADRID))).toEqual([
      30, 27, 27, 24, 29, 26, 31, 28, 25, 30, 27, 25,
    ]);
    expect(occurrences.map((d) => monthIn(d, MADRID))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(occurrences.every((d) => weekdayIn(d, MADRID) === 4)).toBe(true);
    expect(occurrences.every((d) => hourIn(d, MADRID) === 15)).toBe(true);
    expect(iso(occurrences)).toEqual([
      '2026-01-30T14:00:00.000Z',
      '2026-02-27T14:00:00.000Z',
      '2026-03-27T14:00:00.000Z',
      '2026-04-24T13:00:00.000Z',
      '2026-05-29T13:00:00.000Z',
      '2026-06-26T13:00:00.000Z',
      '2026-07-31T13:00:00.000Z',
      '2026-08-28T13:00:00.000Z',
      '2026-09-25T13:00:00.000Z',
      '2026-10-30T14:00:00.000Z',
      '2026-11-27T14:00:00.000Z',
      '2026-12-25T14:00:00.000Z',
    ]);
  });

  it('respeta INTERVAL=3', () => {
    const occurrences = expandOccurrences({
      start: '2026-01-30T15:00',
      rule: 'FREQ=MONTHLY;INTERVAL=3;BYDAY=-1FR;COUNT=3',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(iso(occurrences)).toEqual([
      '2026-01-30T14:00:00.000Z',
      '2026-04-24T13:00:00.000Z',
      '2026-07-31T13:00:00.000Z',
    ]);
  });
});

describe('meses sin día 31', () => {
  it('omite febrero y abril y conserva el día 31 en los demás', () => {
    const occurrences = expandOccurrences({
      start: '2026-01-31T10:00',
      rule: 'FREQ=MONTHLY;COUNT=7',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(iso(occurrences)).toEqual([
      '2026-01-31T09:00:00.000Z',
      '2026-03-31T08:00:00.000Z',
      '2026-05-31T08:00:00.000Z',
      '2026-07-31T08:00:00.000Z',
      '2026-08-31T08:00:00.000Z',
      '2026-10-31T09:00:00.000Z',
      '2026-12-31T09:00:00.000Z',
    ]);
    expect(occurrences.map((d) => monthIn(d, MADRID))).toEqual([1, 3, 5, 7, 8, 10, 12]);
    expect(occurrences.every((d) => dayIn(d, MADRID) === 31)).toBe(true);
  });
});

describe('COUNT combinado con BYDAY', () => {
  it('cuenta la serie completa y respeta el orden dentro de la semana', () => {
    const occurrences = expandOccurrences({
      start: '2026-11-03T08:00',
      rule: 'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5',
      timeZone: MADRID,
      from: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2027-01-01T00:00:00Z'),
    });
    expect(iso(occurrences)).toEqual([
      '2026-11-03T07:00:00.000Z',
      '2026-11-05T07:00:00.000Z',
      '2026-11-10T07:00:00.000Z',
      '2026-11-12T07:00:00.000Z',
      '2026-11-17T07:00:00.000Z',
    ]);
  });

  it('las ocurrencias anteriores a la ventana también consumen COUNT', () => {
    const occurrences = expandOccurrences({
      start: '2026-11-03T08:00',
      rule: 'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=5',
      timeZone: MADRID,
      from: new Date('2026-11-11T00:00:00Z'),
      to: new Date('2027-01-01T00:00:00Z'),
    });
    expect(iso(occurrences)).toEqual(['2026-11-12T07:00:00.000Z', '2026-11-17T07:00:00.000Z']);
  });

  it('BYDAY=2TU genera el segundo martes de cada mes', () => {
    const occurrences = expandOccurrences({
      start: '2026-11-10T12:00',
      rule: 'FREQ=MONTHLY;BYDAY=2TU;COUNT=3',
      timeZone: MADRID,
      from: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2027-02-01T00:00:00Z'),
    });
    expect(iso(occurrences)).toEqual([
      '2026-11-10T11:00:00.000Z',
      '2026-12-08T11:00:00.000Z',
      '2027-01-12T11:00:00.000Z',
    ]);
    expect(occurrences.map((d) => dayIn(d, MADRID))).toEqual([10, 8, 12]);
    expect(occurrences.every((d) => weekdayIn(d, MADRID) === 1)).toBe(true);
  });

  it('BYDAY simple en MONTHLY genera todos los martes del mes', () => {
    const occurrences = expandOccurrences({
      start: '2026-11-03T12:00',
      rule: 'FREQ=MONTHLY;BYDAY=TU;COUNT=4',
      timeZone: MADRID,
      from: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2027-01-01T00:00:00Z'),
    });
    expect(occurrences.map((d) => dayIn(d, MADRID))).toEqual([3, 10, 17, 24]);
  });

  it('omite los meses sin quinta ocurrencia (BYDAY=5FR)', () => {
    const occurrences = expandOccurrences({
      start: '2026-05-29T10:00',
      rule: 'FREQ=MONTHLY;BYDAY=5FR;COUNT=2',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(iso(occurrences)).toEqual(['2026-05-29T08:00:00.000Z', '2026-07-31T08:00:00.000Z']);
  });
});

describe('UNTIL', () => {
  const from = new Date('2026-03-01T00:00:00Z');
  const to = new Date('2026-04-01T00:00:00Z');

  it('es inclusivo y corta la serie', () => {
    const occurrences = expandOccurrences({
      start: '2026-03-25T12:00',
      rule: 'FREQ=DAILY;UNTIL=2026-03-27T11:00:00Z',
      timeZone: MADRID,
      from,
      to,
    });
    expect(iso(occurrences)).toEqual([
      '2026-03-25T11:00:00.000Z',
      '2026-03-26T11:00:00.000Z',
      '2026-03-27T11:00:00.000Z',
    ]);
  });

  it('excluye lo que supere UNTIL por un segundo', () => {
    const occurrences = expandOccurrences({
      start: '2026-03-25T12:00',
      rule: 'FREQ=DAILY;UNTIL=2026-03-27T10:59:59Z',
      timeZone: MADRID,
      from,
      to,
    });
    expect(iso(occurrences)).toEqual(['2026-03-25T11:00:00.000Z', '2026-03-26T11:00:00.000Z']);
  });
});

describe('eventos diarios', () => {
  it('mantiene la hora local al cruzar el cambio de hora de marzo', () => {
    const occurrences = expandOccurrences({
      start: '2026-03-27T09:00',
      rule: 'FREQ=DAILY;COUNT=4',
      timeZone: MADRID,
      from: new Date('2026-03-01T00:00:00Z'),
      to: new Date('2026-04-01T00:00:00Z'),
    });
    expect(iso(occurrences)).toEqual([
      '2026-03-27T08:00:00.000Z',
      '2026-03-28T08:00:00.000Z',
      '2026-03-29T07:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
    ]);
    expect(occurrences.every((d) => hourIn(d, MADRID) === 9)).toBe(true);
  });

  it('la ventana [from, to] es inclusiva por ambos extremos', () => {
    const occurrences = expandOccurrences({
      start: '2026-11-02T00:00',
      rule: 'FREQ=DAILY',
      timeZone: MADRID,
      from: new Date('2026-11-02T23:00:00Z'),
      to: new Date('2026-11-04T23:00:00Z'),
    });
    expect(iso(occurrences)).toEqual([
      '2026-11-02T23:00:00.000Z',
      '2026-11-03T23:00:00.000Z',
      '2026-11-04T23:00:00.000Z',
    ]);
  });
});

describe('horas locales inexistentes y ambiguas', () => {
  it('una hora inexistente (29/03 02:30) se desplaza al cierre del hueco', () => {
    const occurrences = expandOccurrences({
      start: '2026-03-29T02:30:00',
      rule: 'FREQ=DAILY;COUNT=3',
      timeZone: MADRID,
      from: new Date('2026-03-01T00:00:00Z'),
      to: new Date('2026-04-01T00:00:00Z'),
    });
    expect(iso(occurrences)).toEqual([
      '2026-03-29T01:30:00.000Z',
      '2026-03-30T00:30:00.000Z',
      '2026-03-31T00:30:00.000Z',
    ]);
  });

  it('una hora ambigua (25/10 02:30) usa la primera ocurrencia', () => {
    const occurrences = expandOccurrences({
      start: '2026-10-25T02:30:00',
      rule: 'FREQ=DAILY;COUNT=3',
      timeZone: MADRID,
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-11-01T00:00:00Z'),
    });
    expect(iso(occurrences)).toEqual([
      '2026-10-25T00:30:00.000Z',
      '2026-10-26T01:30:00.000Z',
      '2026-10-27T01:30:00.000Z',
    ]);
  });
});

describe('zonas horarias', () => {
  it('la misma hora local produce instantes distintos según la zona', () => {
    const common = {
      start: '2026-10-05T09:00',
      rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=1',
      from: FROM_2026,
      to: TO_2027,
    };
    expect(iso(expandOccurrences({ ...common, timeZone: MADRID }))).toEqual([
      '2026-10-05T07:00:00.000Z',
    ]);
    expect(iso(expandOccurrences({ ...common, timeZone: 'America/New_York' }))).toEqual([
      '2026-10-05T13:00:00.000Z',
    ]);
    expect(iso(expandOccurrences({ ...common, timeZone: 'UTC' }))).toEqual([
      '2026-10-05T09:00:00.000Z',
    ]);
  });

  it('acepta start como instante (Date) interpretándolo en la zona del evento', () => {
    const occurrences = expandOccurrences({
      start: new Date('2026-10-05T07:00:00Z'),
      rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=1',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(iso(occurrences)).toEqual(['2026-10-05T07:00:00.000Z']);
  });
});

describe('regla en formato objeto', () => {
  it('produce el mismo resultado que la regla en texto', () => {
    const byText = expandOccurrences({
      start: '2026-10-05T09:00',
      rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6',
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    const byObject = expandOccurrences({
      start: '2026-10-05T09:00',
      rule: { freq: 'WEEKLY', byDay: [{ day: 'MO' }], count: 6 },
      timeZone: MADRID,
      from: FROM_2026,
      to: TO_2027,
    });
    expect(byObject).toEqual(byText);
  });
});

describe('errores y validación en expandOccurrences', () => {
  it('rechaza zonas horarias no válidas', () => {
    expect(() =>
      expandOccurrences({
        start: '2026-10-05T09:00',
        rule: 'FREQ=DAILY',
        timeZone: 'Not/AZone',
        from: FROM_2026,
        to: TO_2027,
      })
    ).toThrow(RangeError);
  });

  it('rechaza ventanas con from > to', () => {
    expect(() =>
      expandOccurrences({
        start: '2026-10-05T09:00',
        rule: 'FREQ=DAILY',
        timeZone: MADRID,
        from: TO_2027,
        to: FROM_2026,
      })
    ).toThrow(RangeError);
  });

  it('exige zona explícita en from/to cuando son cadenas', () => {
    expect(() =>
      expandOccurrences({
        start: '2026-10-05T09:00',
        rule: 'FREQ=DAILY',
        timeZone: MADRID,
        from: '2026-11-02T00:00',
        to: TO_2027,
      })
    ).toThrow(TypeError);
  });

  it('rechaza BYDAY con FREQ=DAILY', () => {
    expect(() =>
      expandOccurrences({
        start: '2026-10-05T09:00',
        rule: 'FREQ=DAILY;BYDAY=MO',
        timeZone: MADRID,
        from: FROM_2026,
        to: TO_2027,
      })
    ).toThrow(/DAILY/);
  });
});
