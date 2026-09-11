import {
  LocalParts,
  localToUtc,
  partsInZone,
} from "./timezone";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ByDayEntry {
  /** weekday 0=domingo ... 6=sábado */
  weekday: number;
  /** ordinales positivos = n-ésimo, negativos = desde el final (-1 = último) */
  ordinal?: number;
}

export interface ParsedRule {
  freq: Freq;
  interval: number;
  byDay: ByDayEntry[] | null;
  count: number | null;
  until: string | null;
}

export interface ExpandOptions {
  timezone: string;
  from: Date | string | number;
  to: Date | string | number;
}

const WEEKDAY_NAMES: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const MAX_BLOCKS = 100_000;

function partsMs(p: Omit<LocalParts, "weekday">): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(
  p: LocalParts,
  n: number,
): LocalParts {
  const d = new Date(
    Date.UTC(p.year, p.month - 1, p.day + n, p.hour, p.minute, p.second),
  );
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: p.hour,
    minute: p.minute,
    second: p.second,
    weekday: d.getUTCDay(),
  };
}

/** Parsea una fecha ISO de calendario ("2025-12-31" o "2025-12-31T09:30:00"). */
function parseIsoParts(s: string): Omit<LocalParts, "weekday"> {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  if (!m) throw new Error(`Fecha inválida: "${s}"`);
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: m[4] !== undefined ? Number(m[4]) : 0,
    minute: m[5] !== undefined ? Number(m[5]) : 0,
    second: m[6] !== undefined ? Number(m[6]) : 0,
  };
}

/** ¿El string ISO lleva offset explícito (Z o ±hh:mm tras la hora)? */
function hasExplicitOffset(s: string): boolean {
  if (/[zZ]$/.test(s)) return true;
  const tIdx = s.indexOf("T");
  if (tIdx < 0) return false;
  return /[+-]\d{2}:?\d{2}$/.test(s.slice(tIdx));
}

/**
 * Normaliza un valor (Date | número | string ISO) a un instante UTC (ms).
 * Un string sin offset/Z se interpreta como hora local de la zona `tz`.
 */
function toInstant(value: Date | string | number, tz: string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (hasExplicitOffset(value)) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) throw new Error(`Instante inválido: "${value}"`);
    return ms;
  }
  return localToUtc(parseIsoParts(value), tz);
}

/** Normaliza el inicio a sus partes de reloj local en la zona. */
function startToParts(start: Date | string | number, tz: string): LocalParts {
  if (typeof start === "string" && !hasExplicitOffset(start)) {
    const p = parseIsoParts(start);
    return { ...p, weekday: weekdayOf(p.year, p.month, p.day) };
  }
  return partsInZone(toInstant(start, tz), tz);
}

function parseByDayToken(token: string): ByDayEntry {
  const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token.trim());
  if (!m) throw new Error(`BYDAY inválido: "${token}"`);
  const entry: ByDayEntry = { weekday: WEEKDAY_NAMES[m[2]] };
  if (m[1] !== undefined) {
    const ordinal = Number(m[1]);
    if (ordinal === 0) throw new Error(`Ordinal BYDAY no puede ser 0: "${token}"`);
    entry.ordinal = ordinal;
  }
  return entry;
}

export function parseRule(rule: string | ParsedRule): ParsedRule {
  if (typeof rule !== "string") {
    if (!rule || typeof rule.freq !== "string") {
      throw new Error("Regla inválida: falta FREQ");
    }
    validateRule(rule);
    return rule;
  }
  const out: ParsedRule = {
    freq: "" as Freq,
    interval: 1,
    byDay: null,
    count: null,
    until: null,
  };
  for (const part of rule.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    switch (key) {
      case "FREQ":
        out.freq = value.toUpperCase() as Freq;
        break;
      case "INTERVAL":
        out.interval = Number(value);
        break;
      case "BYDAY":
        out.byDay = value.split(",").map(parseByDayToken);
        break;
      case "COUNT":
        out.count = Number(value);
        break;
      case "UNTIL":
        out.until = value;
        break;
      default:
        break; // se ignoran claves fuera del subconjunto soportado
    }
  }
  validateRule(out);
  return out;
}

function validateRule(rule: ParsedRule): void {
  const freqs: Freq[] = ["DAILY", "WEEKLY", "MONTHLY"];
  if (!freqs.includes(rule.freq)) {
    throw new Error(`FREQ no soportada: "${rule.freq}"`);
  }
  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    throw new Error(`INTERVAL debe ser entero >= 1, recibido: ${rule.interval}`);
  }
  if (rule.count !== null && (!Number.isInteger(rule.count) || rule.count < 1)) {
    throw new Error(`COUNT debe ser entero >= 1, recibido: ${rule.count}`);
  }
  if (rule.freq === "WEEKLY" && rule.byDay?.some((b) => b.ordinal !== undefined)) {
    throw new Error("BYDAY con ordinal (p. ej. 2TU) no es válido para FREQ=WEEKLY");
  }
}

/** Días del mes (números 1..31) que satisfacen las entradas BYDAY. */
function resolveMonthDays(year: number, month: number, byDay: ByDayEntry[]): number[] {
  const dim = daysInMonth(year, month);
  const days = new Set<number>();
  for (const entry of byDay) {
    const matching: number[] = [];
    for (let d = 1; d <= dim; d++) {
      if (weekdayOf(year, month, d) === entry.weekday) matching.push(d);
    }
    if (entry.ordinal === undefined) {
      for (const d of matching) days.add(d);
    } else {
      const idx = entry.ordinal > 0 ? entry.ordinal - 1 : matching.length + entry.ordinal;
      if (idx >= 0 && idx < matching.length) days.add(matching[idx]);
    }
  }
  return [...days].sort((a, b) => a - b);
}

/** Candidatos (reloj local) de un bloque periódico, partiendo del ancla. */
function blockCandidates(
  rule: ParsedRule,
  start: LocalParts,
  blockIndex: number,
): LocalParts[] {
  if (rule.freq === "DAILY") {
    return [addDays(start, blockIndex * rule.interval)];
  }
  if (rule.freq === "WEEKLY") {
    const anchor = addDays(start, blockIndex * rule.interval * 7);
    if (!rule.byDay || rule.byDay.length === 0) return [anchor];
    return rule.byDay.map((b) => {
      const delta = (b.weekday - start.weekday + 7) % 7;
      return addDays(anchor, delta);
    });
  }
  // MONTHLY
  const totalMonths = start.month - 1 + blockIndex * rule.interval;
  const year = start.year + Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  let days: number[];
  if (rule.byDay && rule.byDay.length > 0) {
    days = resolveMonthDays(year, month, rule.byDay);
  } else {
    days = start.day <= daysInMonth(year, month) ? [start.day] : [];
  }
  return days.map((d) => ({
    year,
    month,
    day: d,
    hour: start.hour,
    minute: start.minute,
    second: start.second,
    weekday: weekdayOf(year, month, d),
  }));
}

/**
 * Expande una regla RRULE (subconjunto soportado) devolviendo los instantes
 * UTC de las ocurrencias comprendidas en [from, to).
 *
 * La hora de reloj local de `start` en `timezone` se conserva en todas las
 * ocurrencias, incluso a través de transiciones DST.
 */
export function expandRecurrence(
  start: Date | string | number,
  rule: string | ParsedRule,
  options: ExpandOptions,
): Date[] {
  const tz = options.timezone;
  const parsed = parseRule(rule);
  const startParts = startToParts(start, tz);
  const fromMs = toInstant(options.from, tz);
  const toMs = toInstant(options.to, tz);
  if (fromMs >= toMs) return [];

  const untilMs =
    parsed.until === null
      ? undefined
      : hasExplicitOffset(parsed.until) || parsed.until.includes("T")
        ? toInstant(parsed.until, tz)
        : toInstant(parsed.until + "T23:59:59", tz); // fecha sin hora: fin del día

  const limit = parsed.count ?? Number.POSITIVE_INFINITY;
  const results: number[] = [];
  let generated = 0;

  outer: for (let block = 0; block < MAX_BLOCKS; block++) {
    const candidates = blockCandidates(parsed, startParts, block)
      .filter((c) => block > 0 || partsMs(c) >= partsMs(startParts))
      .sort((a, b) => partsMs(a) - partsMs(b));

    if (candidates.length === 0) {
      // Salir pronto cuando el bloque ya queda por encima de la ventana.
      if (parsed.freq === "MONTHLY") {
        const totalMonths = startParts.month - 1 + block * parsed.interval;
        const year = startParts.year + Math.floor(totalMonths / 12);
        const month = (totalMonths % 12) + 1;
        const anchor: LocalParts = {
          year,
          month,
          day: 1,
          hour: startParts.hour,
          minute: startParts.minute,
          second: startParts.second,
          weekday: 0,
        };
        if (localToUtc(anchor, tz) >= toMs) break;
      }
      continue;
    }

    for (const c of candidates) {
      const instant = localToUtc(c, tz);
      if (untilMs !== undefined && instant > untilMs) break outer;
      if (generated >= limit) break outer;
      generated++;
      if (instant >= toMs) break outer;
      if (instant >= fromMs) results.push(instant);
    }
  }

  return results.map((ms) => new Date(ms));
}
