/**
 * Conversión entre reloj local (wall-clock) de una zona IANA e instantes UTC
 * usando únicamente Intl.DateTimeFormat (sin dependencias externas).
 */

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  weekday: number; // 0=domingo ... 6=sábado (convención JS)
}

function partsAsUtc(p: Omit<LocalParts, "weekday">): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

const formatCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let fmt = formatCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    formatCache.set(tz, fmt);
  }
  return fmt;
}

/** Partes de reloj local de un instante en la zona dada. */
export function partsInZone(instant: number, tz: string): LocalParts {
  const parts = formatter(tz).formatToParts(new Date(instant));
  let p: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of parts) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  const buf: Omit<LocalParts, "weekday"> = {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
  // hourCycle h23 puede devolver "24" para medianoche en algunos entornos.
  if (buf.hour === 24) buf.hour = 0;
  const weekday = new Date(partsAsUtc(buf)).getUTCDay();
  return { ...buf, weekday };
}

/** Offset (ms) de la zona respecto a UTC en ese instante. Positivo = al este. */
export function offsetAt(instant: number, tz: string): number {
  return partsAsUtc(partsInZone(instant, tz)) - instant;
}

/**
 * Convierte un reloj local (parts) de la zona en el instante UTC que le
 * corresponde. Se refinan en dos iteraciones para resolver el offset en el
 * instante correcto (relevante alrededor de transiciones DST).
 */
export function localToUtc(parts: Omit<LocalParts, "weekday">, tz: string): number {
  const asUtc = partsAsUtc(parts);
  let offset = offsetAt(asUtc, tz);
  let utc = asUtc - offset;
  offset = offsetAt(utc, tz);
  utc = asUtc - offset;
  return utc;
}
