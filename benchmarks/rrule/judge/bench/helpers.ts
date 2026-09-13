// Utilidades de conversión de formato para el adaptador. NO calculan ocurrencias.
import type { BenchInput, BenchRule, Freq } from './contract';

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function offsetMs(tz: string, t: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(t));
  const p = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
}

/** 'YYYY-MM-DDTHH:mm:ss' (hora local en tz) → partes numéricas */
export function parseLocal(local: string): ZonedParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`hora local inválida: ${local}`);
  const [, year, month, day, hour, minute, second] = m.map(Number);
  return { year, month, day, hour, minute, second };
}

/** Hora local de pared en tz → instante (Date) */
export function zonedToInstant(local: string | ZonedParts, tz: string): Date {
  const p = typeof local === 'string' ? parseLocal(local) : local;
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  let t = guess - offsetMs(tz, guess);
  t = guess - offsetMs(tz, t);
  return new Date(t);
}

/** Instante → hora local de pared en tz */
export function instantToZoned(instant: Date | string, tz: string): ZonedParts {
  const t = new Date(instant).getTime();
  const d = new Date(t + offsetMs(tz, t));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

export function parseRule(rrule: string): BenchRule {
  const kv = Object.fromEntries(rrule.split(';').map((s) => s.split('=') as [string, string]));
  const rule: BenchRule = { freq: kv.FREQ as Freq, interval: kv.INTERVAL ? Number(kv.INTERVAL) : 1 };
  if (kv.BYDAY) rule.byday = kv.BYDAY.split(',');
  if (kv.COUNT) rule.count = Number(kv.COUNT);
  if (kv.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(kv.UNTIL);
    if (!m) throw new Error(`UNTIL no soportado en el contrato: ${kv.UNTIL}`);
    const [, y, mo, d, h, mi, s] = m.map(Number);
    rule.until = new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString();
  }
  return rule;
}

export interface BenchCase {
  dtstart: string;
  tz: string;
  rrule: string;
  from: string;
  to: string;
}

export function buildInput(c: BenchCase): BenchInput {
  return {
    dtstartLocal: c.dtstart,
    dtstartUtc: zonedToInstant(c.dtstart, c.tz).toISOString(),
    tz: c.tz,
    rrule: c.rrule,
    rule: parseRule(c.rrule),
    from: new Date(c.from).toISOString(),
    to: new Date(c.to).toISOString(),
  };
}

export const normalize = (out: Array<string | Date>) => out.map((x) => new Date(x).toISOString());
