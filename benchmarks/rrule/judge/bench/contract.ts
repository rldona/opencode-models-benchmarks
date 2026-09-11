// Contrato común con el que la suite oculta llama a cualquier solución.
// El juez escribe __bench__/adapter.ts exportando `expand` con esta firma.

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface BenchRule {
  freq: Freq;
  /** 1 si la regla no lo indica */
  interval: number;
  /** Tal cual aparecen en la regla: ['MO', 'WE'], ['2TU'], ['-1FR'], ['1MO', '-1MO'] */
  byday?: string[];
  count?: number;
  /** Instante ISO UTC, p. ej. '2025-04-03T17:00:00.000Z' (UNTIL de RFC 5545 es inclusivo) */
  until?: string;
}

export interface BenchInput {
  /** Hora local de pared en `tz`, sin offset: 'YYYY-MM-DDTHH:mm:ss' */
  dtstartLocal: string;
  /** El mismo inicio como instante ISO UTC (dtstartLocal interpretado en `tz`) */
  dtstartUtc: string;
  /** Zona horaria IANA */
  tz: string;
  /** Regla RFC 5545 en texto, sin prefijo 'RRULE:': 'FREQ=WEEKLY;BYDAY=MO;COUNT=5' */
  rrule: string;
  /** La misma regla ya parseada */
  rule: BenchRule;
  /** Ventana [from, to) como instantes ISO UTC. Ningún caso tiene ocurrencias justo en los bordes. */
  from: string;
  to: string;
}

/** Ocurrencias dentro de la ventana, en orden, como instantes ISO UTC (Date#toISOString) o Date. */
export type Expand = (input: BenchInput) => Array<string | Date> | Promise<Array<string | Date>>;
