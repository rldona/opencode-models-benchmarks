import { localToUtc, utcFromParts } from "./timezone";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY";
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface ByDayInput {
  weekday: Weekday;
  ordinal?: number;
}

export interface RRuleInput {
  freq: Freq;
  interval?: number;
  byDay?: Array<string | ByDayInput>;
  count?: number;
  until?: string | Date;
}

export interface ByDay {
  weekday: Weekday;
  ordinal?: number;
}

export interface NormalizedRule {
  freq: Freq;
  interval: number;
  byDay: ByDay[];
  count?: number;
  until?: number;
}

const FREQUENCIES: readonly Freq[] = ["DAILY", "WEEKLY", "MONTHLY"];
const WEEKDAYS: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const SUPPORTED_PARTS = new Set(["FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL"]);
const BYDAY_PATTERN = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/;
const UNTIL_BASIC_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i;
const UNTIL_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function parseByDayToken(token: string): ByDay {
  const match = BYDAY_PATTERN.exec(token.trim().toUpperCase());
  if (!match) throw new Error(`Invalid BYDAY value: "${token}"`);

  const ordinalText = match[1];
  const weekday = match[2] as Weekday;
  if (ordinalText === undefined) return { weekday };

  const ordinal = Number(ordinalText);
  if (!Number.isInteger(ordinal) || ordinal === 0 || Math.abs(ordinal) > 53) {
    throw new Error(`Invalid BYDAY ordinal: "${token}"`);
  }
  return { weekday, ordinal };
}

function normalizeByDayEntry(entry: string | ByDayInput): ByDay {
  if (typeof entry === "string") return parseByDayToken(entry);

  const weekday = String(entry.weekday).toUpperCase() as Weekday;
  if (!WEEKDAYS.includes(weekday)) throw new Error(`Invalid BYDAY weekday: "${entry.weekday}"`);

  if (entry.ordinal === undefined) return { weekday };
  if (!Number.isInteger(entry.ordinal) || entry.ordinal === 0 || Math.abs(entry.ordinal) > 53) {
    throw new Error(`Invalid BYDAY ordinal: "${entry.ordinal}"`);
  }
  return { weekday, ordinal: entry.ordinal };
}

function parsePositiveInteger(text: string, name: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${text}"`);
  }
  return value;
}

function parseUntil(value: string, timeZone: string): number {
  const text = value.trim();

  const basic = UNTIL_BASIC_PATTERN.exec(text);
  if (basic) {
    const [, year, month, day, hour, minute, second, utc] = basic;
    const parts = {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
    };
    if (utc) return utcFromParts(parts);
    return localToUtc(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second, timeZone);
  }

  const local = UNTIL_LOCAL_PATTERN.exec(text);
  if (local) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = local;
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
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid UNTIL value: "${value}"`);
  return parsed.getTime();
}

export function parseRule(rule: string | RRuleInput, timeZone: string): NormalizedRule {
  const parts: Record<string, string> = {};
  const objectByDay = typeof rule === "string" ? undefined : rule.byDay;

  if (typeof rule === "string") {
    for (const chunk of rule.split(";")) {
      const text = chunk.trim();
      if (text === "") continue;

      const separator = text.indexOf("=");
      if (separator <= 0) throw new Error(`Invalid RRULE part: "${text}"`);

      const key = text.slice(0, separator).trim().toUpperCase();
      const value = text.slice(separator + 1).trim();
      if (!SUPPORTED_PARTS.has(key)) throw new Error(`Unsupported RRULE part: "${key}"`);
      if (parts[key] !== undefined) throw new Error(`Duplicated RRULE part: "${key}"`);
      parts[key] = value;
    }
  } else {
    parts["FREQ"] = String(rule.freq);
    if (rule.interval !== undefined) parts["INTERVAL"] = String(rule.interval);
    if (rule.count !== undefined) parts["COUNT"] = String(rule.count);
    if (rule.until !== undefined) {
      parts["UNTIL"] = rule.until instanceof Date ? rule.until.toISOString() : rule.until;
    }
  }

  const rawFreq = parts["FREQ"];
  const freqText = (rawFreq ?? "").toUpperCase();
  if (freqText === "") throw new Error("RRULE requires a FREQ part");
  if (!FREQUENCIES.includes(freqText as Freq)) {
    throw new Error(`Unsupported FREQ: "${rawFreq}" (supported: ${FREQUENCIES.join(", ")})`);
  }
  const freq = freqText as Freq;

  const rawInterval = parts["INTERVAL"];
  const interval = rawInterval !== undefined ? parsePositiveInteger(rawInterval, "INTERVAL") : 1;

  const byDay: ByDay[] = [];
  const rawByDay = parts["BYDAY"];
  if (rawByDay !== undefined) {
    for (const token of rawByDay.split(",")) {
      if (token.trim() !== "") byDay.push(parseByDayToken(token));
    }
  }
  if (objectByDay !== undefined) {
    if (rawByDay !== undefined) throw new Error("BYDAY was provided more than once");
    for (const entry of objectByDay) byDay.push(normalizeByDayEntry(entry));
  }

  if (byDay.length > 0 && freq === "DAILY") {
    throw new Error("BYDAY is only supported with WEEKLY or MONTHLY frequencies");
  }
  if (freq === "WEEKLY" && byDay.some((entry) => entry.ordinal !== undefined)) {
    throw new Error("BYDAY ordinals (e.g. 2TU, -1FR) are only supported with MONTHLY frequency");
  }

  const rawCount = parts["COUNT"];
  const rawUntil = parts["UNTIL"];
  if (rawCount !== undefined && rawUntil !== undefined) {
    throw new Error("COUNT and UNTIL are mutually exclusive");
  }
  const count = rawCount !== undefined ? parsePositiveInteger(rawCount, "COUNT") : undefined;
  const until = rawUntil !== undefined ? parseUntil(rawUntil, timeZone) : undefined;

  return { freq, interval, byDay, count, until };
}
