import { expandOccurrences } from "./expand";
import type { RRuleInput } from "./parse";
import { parseRule } from "./parse";
import { localToUtc } from "./timezone";

export type { ByDay, ByDayInput, Freq, NormalizedRule, RRuleInput, Weekday } from "./parse";
export { partsInZone } from "./timezone";

export type DateInput = Date | number | string;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Convierte la entrada a instante UTC. Las cadenas sin desfase horario
 * (p. ej. "2026-10-11T10:00:00") se interpretan como hora local en `timeZone`.
 */
function toInstant(value: DateInput, timeZone: string): number {
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isNaN(time)) throw new Error("Invalid date");
    return time;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid date");
    return value;
  }

  const text = value.trim();
  const wallClock = LOCAL_DATE_PATTERN.exec(text);
  if (wallClock) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = wallClock;
    return localToUtc(
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      timeZone,
    );
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: "${value}"`);
  return parsed.getTime();
}

/**
 * Expande las ocurrencias de una regla de recurrencia (subconjunto RFC 5545)
 * comprendidas en el intervalo `[from, to)`.
 *
 * @param start fecha de inicio (DTSTART); su hora local en `timeZone` define la hora de pared.
 * @param rule regla RRULE como string (`FREQ=WEEKLY;BYDAY=TU`) u objeto tipado.
 * @param timeZone zona horaria IANA, p. ej. "Europe/Madrid".
 * @param from límite inferior inclusivo del rango.
 * @param to límite superior exclusivo del rango.
 */
export function expandRRule(
  start: DateInput,
  rule: string | RRuleInput,
  timeZone: string,
  from: DateInput,
  to: DateInput,
): Date[] {
  const normalized = parseRule(rule, timeZone);
  const instants = expandOccurrences({
    startMs: toInstant(start, timeZone),
    rule: normalized,
    timeZone,
    fromMs: toInstant(from, timeZone),
    toMs: toInstant(to, timeZone),
  });
  return instants.map((instant) => new Date(instant));
}
