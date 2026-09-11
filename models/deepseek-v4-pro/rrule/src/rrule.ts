import { wallTimeToUtc } from "./tz.js";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ByDay {
  weekday: number;
  ordinal: number;
}

export interface RRule {
  freq: Freq;
  interval: number;
  byday: ByDay[];
  count?: number;
  untilUtc?: number;
}

export interface ExpandInput {
  dtstart: string;
  rrule: string;
  tz: string;
}

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

const MAX_ITERATIONS = 1_000_000;

export function parseRRule(text: string): RRule {
  let freq: Freq | undefined;
  let interval = 1;
  let byday: ByDay[] = [];
  let count: number | undefined;
  let untilUtc: number | undefined;

  const tokens = text
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) throw new Error("RRULE vacía");

  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq === -1) throw new Error(`Parte RRULE inválida: "${token}"`);
    const key = token.slice(0, eq).trim().toUpperCase();
    const value = token.slice(eq + 1).trim();
    switch (key) {
      case "FREQ": {
        const v = value.toUpperCase();
        if (v !== "DAILY" && v !== "WEEKLY" && v !== "MONTHLY") {
          throw new Error(`FREQ no soportada: "${value}"`);
        }
        freq = v;
        break;
      }
      case "INTERVAL": {
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) throw new Error(`INTERVAL inválido: "${value}"`);
        interval = n;
        break;
      }
      case "BYDAY": {
        byday = value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map(parseByDay);
        break;
      }
      case "COUNT": {
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) throw new Error(`COUNT inválido: "${value}"`);
        count = n;
        break;
      }
      case "UNTIL": {
        untilUtc = parseUntil(value);
        break;
      }
      case "WKST":
      case "BYMONTH":
      case "BYMONTHDAY":
      case "BYSETPOS":
        throw new Error(`Parte RRULE no soportada: ${key}`);
      default:
        throw new Error(`Parte RRULE desconocida: "${key}"`);
    }
  }

  if (!freq) throw new Error("FREQ es obligatoria");
  return { freq, interval, byday, count, untilUtc };
}

function parseByDay(text: string): ByDay {
  const m = /^(?<ord>[+-]?\d{1,2})?(?<day>MO|TU|WE|TH|FR|SA|SU)$/i.exec(text);
  if (!m?.groups) throw new Error(`BYDAY inválido: "${text}"`);
  const day = m.groups.day;
  const ordinal = m.groups.ord ? Number(m.groups.ord) : 0;
  if (!day) throw new Error(`BYDAY inválido: "${text}"`);
  const weekday = WEEKDAYS[day.toUpperCase()]!;
  if (Math.abs(ordinal) > 53) throw new Error(`BYDAY ordinal inválido: "${text}"`);
  return { weekday, ordinal };
}

function parseUntil(text: string): number {
  const m = /^(?<y>\d{4})(?<mo>\d{2})(?<d>\d{2})(?:T(?<hh>\d{2})(?<mi>\d{2})(?<ss>\d{2})Z?)?$/.exec(
    text,
  );
  if (!m?.groups) throw new Error(`UNTIL inválido: "${text}"`);
  const { y, mo, d, hh, mi, ss } = m.groups;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mi ?? 0), Number(ss ?? 0));
}

function parseLocalDateTime(text: string): LocalDateTime {
  const m = /^(?<y>\d{4})-(?<mo>\d{2})-(?<d>\d{2})(?:[T ](?<hh>\d{2}):(?<mi>\d{2})(?::(?<ss>\d{2})(?:\.(?<frac>\d{1,3}))?)?)?$/.exec(
    text.trim(),
  );
  if (!m?.groups) throw new Error(`DTSTART inválido: "${text}"`);
  const { y, mo, d, hh, mi, ss, frac } = m.groups;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(hh ?? 0);
  const minute = Number(mi ?? 0);
  const second = Number(ss ?? 0);
  const ms = frac ? Number(frac.padEnd(3, "0")) : 0;
  const parts = [year, month, day, hour, minute, second, ms];
  if (parts.some((n) => !Number.isFinite(n))) throw new Error(`DTSTART inválido: "${text}"`);
  if (month < 1 || month > 12 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw new Error(`DTSTART inválido: "${text}"`);
  }
  if (day < 1 || day > daysInMonth(year, month)) throw new Error(`DTSTART inválido: "${text}"`);
  return { year, month, day, hour, minute, second, ms, weekday: weekdayOf(year, month, day) };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays(y: number, m: number, d: number, delta: number): [number, number, number] {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

function addMonths(y: number, m: number, delta: number): [number, number] {
  const total = y * 12 + (m - 1) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}

function weekdayOf(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function compareDate(y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): number {
  if (y1 !== y2) return y1 - y2;
  if (m1 !== m2) return m1 - m2;
  return d1 - d2;
}

export function expand(input: ExpandInput, rangeStart: Date | number, rangeEnd: Date | number): Date[] {
  const tz = input.tz;
  const rule = parseRRule(input.rrule);
  const start = typeof rangeStart === "number" ? rangeStart : rangeStart.getTime();
  const end = typeof rangeEnd === "number" ? rangeEnd : rangeEnd.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Rango inválido");
  if (end < start) return [];

  const dt = parseLocalDateTime(input.dtstart);
  const limitUtc = Math.min(end, rule.untilUtc ?? Infinity);

  const occurrences: number[] = [];
  let generated = 0;
  let stopped = false;

  const emit = (utc: number): void => {
    generated += 1;
    if (utc >= start && utc <= end) occurrences.push(utc);
    if (rule.count !== undefined && generated >= rule.count) stopped = true;
  };

  if (rule.freq === "DAILY") {
    for (let k = 0; k < MAX_ITERATIONS && !stopped; k++) {
      const [y, m, d] = addDays(dt.year, dt.month, dt.day, k * rule.interval);
      const utc = wallTimeToUtc(tz, y, m, d, dt.hour, dt.minute, dt.second, dt.ms);
      if (utc > limitUtc) break;
      emit(utc);
    }
  } else if (rule.freq === "WEEKLY") {
    const [anchorY, anchorM, anchorD] = addDays(dt.year, dt.month, dt.day, -dt.weekday);
    for (let k = 0; k < MAX_ITERATIONS && !stopped; k++) {
      const [wy, wm, wd] = addDays(anchorY, anchorM, anchorD, k * rule.interval * 7);
      const candidates: [number, number, number][] =
        rule.byday.length > 0
          ? rule.byday
              .map((b) => addDays(wy, wm, wd, b.weekday))
              .sort((a, b) => compareDate(...a, ...b))
          : [addDays(dt.year, dt.month, dt.day, k * rule.interval * 7)];
      for (const [y, m, d] of candidates) {
        if (compareDate(y, m, d, dt.year, dt.month, dt.day) < 0) continue;
        const utc = wallTimeToUtc(tz, y, m, d, dt.hour, dt.minute, dt.second, dt.ms);
        if (utc > limitUtc) {
          stopped = true;
          break;
        }
        emit(utc);
        if (stopped) break;
      }
    }
  } else {
    for (let k = 0; k < MAX_ITERATIONS && !stopped; k++) {
      const [y, m] = addMonths(dt.year, dt.month, k * rule.interval);
      if (rule.byday.length > 0) {
        const dim = daysInMonth(y, m);
        const firstDow = weekdayOf(y, m, 1);
        const lastDow = weekdayOf(y, m, dim);
        const days = new Set<number>();
        for (const b of rule.byday) {
          if (b.ordinal === 0) {
            let d = 1 + ((b.weekday - firstDow + 7) % 7);
            for (; d <= dim; d += 7) days.add(d);
          } else if (b.ordinal > 0) {
            const d = 1 + ((b.weekday - firstDow + 7) % 7) + (b.ordinal - 1) * 7;
            if (d <= dim) days.add(d);
          } else {
            const d = dim - ((lastDow - b.weekday + 7) % 7) + (b.ordinal + 1) * 7;
            if (d >= 1) days.add(d);
          }
        }
        for (const d of [...days].sort((a, b) => a - b)) {
          if (compareDate(y, m, d, dt.year, dt.month, dt.day) < 0) continue;
          const utc = wallTimeToUtc(tz, y, m, d, dt.hour, dt.minute, dt.second, dt.ms);
          if (utc > limitUtc) {
            stopped = true;
            break;
          }
          emit(utc);
          if (stopped) break;
        }
      } else {
        if (dt.day > daysInMonth(y, m)) continue;
        const utc = wallTimeToUtc(tz, y, m, dt.day, dt.hour, dt.minute, dt.second, dt.ms);
        if (utc > limitUtc) break;
        emit(utc);
      }
    }
  }

  return occurrences.map((ms) => new Date(ms));
}
