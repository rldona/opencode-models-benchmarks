export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export interface ZonedDateTime extends CalendarDate {
  hour: number; // 0-23
  minute: number;
  second: number;
}

const DAY_MS = 86_400_000;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new RangeError(`Invalid IANA time zone: "${timeZone}"`);
  }

  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function assertValidTimeZone(timeZone: string): void {
  getFormatter(timeZone);
}

export function utcFromParts(parts: ZonedDateTime): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

export function partsInZone(instantMs: number, timeZone: string): ZonedDateTime {
  const raw = getFormatter(timeZone).formatToParts(new Date(instantMs));
  const values: Record<string, number> = {};
  for (const part of raw) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values["year"] ?? 0,
    month: values["month"] ?? 0,
    day: values["day"] ?? 0,
    hour: values["hour"] ?? 0,
    minute: values["minute"] ?? 0,
    second: values["second"] ?? 0,
  };
}

export function offsetMs(instantMs: number, timeZone: string): number {
  return utcFromParts(partsInZone(instantMs, timeZone)) - instantMs;
}

function sameWallClock(a: ZonedDateTime, b: ZonedDateTime): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

/**
 * Convierte una hora de pared (calendario local de `timeZone`) al instante UTC.
 *
 * Resolución de cambios de hora:
 * - Hora inexistente (salto de primavera): se desplaza hacia delante el hueco.
 * - Hora ambigua (retroceso de otoño): se devuelve la primera ocurrencia.
 */
export function localToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  const target: ZonedDateTime = { year, month, day, hour, minute, second };
  const nominal = utcFromParts(target);

  const candidates = new Set<number>();
  for (const probe of [nominal - DAY_MS, nominal, nominal + DAY_MS]) {
    candidates.add(nominal - offsetMs(probe, timeZone));
  }

  const matching = [...candidates].filter((candidate) =>
    sameWallClock(partsInZone(candidate, timeZone), target),
  );
  if (matching.length > 0) {
    return Math.min(...matching);
  }

  const forward = [...candidates].filter((candidate) => candidate >= nominal);
  return forward.length > 0 ? Math.min(...forward) : Math.max(...candidates);
}

export function daysInMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCDate();
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const result = new Date(0);
  result.setUTCFullYear(date.year, date.month - 1, date.day + days);
  result.setUTCHours(0, 0, 0, 0);
  return { year: result.getUTCFullYear(), month: result.getUTCMonth() + 1, day: result.getUTCDate() };
}

export function addMonths(year: number, month: number, months: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + months;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function weekdayOf(date: CalendarDate): number {
  const result = new Date(0);
  result.setUTCFullYear(date.year, date.month - 1, date.day);
  result.setUTCHours(0, 0, 0, 0);
  return result.getUTCDay(); // 0 = domingo
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year * 10000 + a.month * 100 + a.day - (b.year * 10000 + b.month * 100 + b.day);
}
