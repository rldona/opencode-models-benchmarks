import {
  type RRuleOptions,
  type ByDayEntry,
  Frequency,
  Weekday,
  WEEKDAY_MAP,
} from "./types.js";

export function parseRRule(ruleStr: string, dtstart: Date): RRuleOptions {
  const parts = new Map<string, string>();
  for (const segment of ruleStr.split(";")) {
    const [key, ...rest] = segment.split("=");
    parts.set(key.trim(), rest.join("=").trim());
  }

  const freq = parseFrequency(parts.get("FREQ"));
  const interval = parseInt(parts.get("INTERVAL") ?? "1", 10);
  const count = parts.has("COUNT") ? parseInt(parts.get("COUNT")!, 10) : null;
  const until = parts.has("UNTIL") ? parseUntilDate(parts.get("UNTIL")!) : null;
  const byDay = parts.has("BYDAY") ? parseByDay(parts.get("BYDAY")!, freq) : null;

  return { freq, interval, byDay, count, until };
}

function parseFrequency(value: string | undefined): Frequency {
  switch (value) {
    case "DAILY":
      return Frequency.DAILY;
    case "WEEKLY":
      return Frequency.WEEKLY;
    case "MONTHLY":
      return Frequency.MONTHLY;
    default:
      throw new Error(`Unsupported FREQ: ${value}`);
  }
}

function parseUntilDate(value: string): Date {
  // RRULE UNTIL format: YYYYMMDD or YYYYMMDDTHHMMSSZ (UTC)
  if (value.endsWith("Z")) {
    const y = parseInt(value.slice(0, 4), 10);
    const m = parseInt(value.slice(4, 6), 10) - 1;
    const d = parseInt(value.slice(6, 8), 10);
    const h = parseInt(value.slice(9, 11), 10);
    const min = parseInt(value.slice(11, 13), 10);
    const s = parseInt(value.slice(13, 15), 10);
    return new Date(Date.UTC(y, m, d, h, min, s));
  }
  // Date-only: treat as local interpretation of the calendar day start
  const y = parseInt(value.slice(0, 4), 10);
  const m = parseInt(value.slice(4, 6), 10) - 1;
  const d = parseInt(value.slice(6, 8), 10);
  return new Date(Date.UTC(y, m, d, 23, 59, 59));
}

function parseByDay(value: string, freq: Frequency): ByDayEntry[] {
  return value.split(",").map((token) => parseByDayToken(token.trim()));
}

function parseByDayToken(token: string): ByDayEntry {
  // Match patterns: MO, 2TU, -1FR
  const match = token.match(/^(-?\d+)?([A-Z]{2})$/);
  if (!match) {
    throw new Error(`Invalid BYDAY token: ${token}`);
  }
  const numPart = match[1];
  const dayStr = match[2];
  const day = WEEKDAY_MAP[dayStr];
  if (day === undefined) {
    throw new Error(`Unknown weekday: ${dayStr}`);
  }

  if (numPart === undefined) {
    return { day };
  }

  const num = parseInt(numPart, 10);
  if (num < 0) {
    return { day, last: true };
  }
  return { day, nth: num };
}
