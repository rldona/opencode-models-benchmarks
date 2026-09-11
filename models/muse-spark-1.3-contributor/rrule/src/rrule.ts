/** Parser del subconjunto RRULE soportado. */

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

/** 0=Domingo ... 6=Sábado (convención Date.getUTCDay). */
export interface ByDayEntry {
  weekday: number;
  /** 1..53 o -53..-1. Solo permitido en MONTHLY. */
  ordinal?: number;
}

export interface ParsedRRule {
  freq: Frequency;
  interval: number;
  byday: ByDayEntry[];
  count?: number;
  untilMs?: number;
}

const WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const BYDAY_RE = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/;

/** Acepta UNTIL en ISO extendido y en formato básico RFC (YYYYMMDD[T1851571]HMMSS[Z]). */
export function parseUntilToMs(raw: string): number {
  const v = raw.trim();
  // Formato básico: 20261025T000000Z o 20261025
  const basicDateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;
  const basicDate = /^(\d{4})(\d{2})(\d{2})$/;
  let m = basicDateTime.exec(v);
  if (m) {
    return Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    );
  }
  m = basicDate.exec(v);
  if (m) {
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const parsed = Date.parse(v);
  if (!Number.isNaN(parsed)) return parsed;
  throw new Error(`Invalid UNTIL value: ${raw}`);
}

function parsePositiveInt(raw: string, name: string): number {
  if (!/^\d+$/.test(raw.trim())) throw new Error(`Invalid ${name}: ${raw}`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid ${name}: ${raw}`);
  return n;
}

export function parseRRule(rrule: string): ParsedRRule {
  if (!rrule || typeof rrule !== "string") throw new Error("RRULE must be a non-empty string");
  const parts = rrule
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) throw new Error("RRULE must be a non-empty string");

  const map = new Map<string, string>();
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq === -1) throw new Error(`Invalid RRULE part: ${p}`);
    const key = p.slice(0, eq).trim().toUpperCase();
    const value = p.slice(eq + 1).trim();
    if (!key || !value) throw new Error(`Invalid RRULE part: ${p}`);
    if (map.has(key)) throw new Error(`Duplicate RRULE property: ${key}`);
    map.set(key, value);
  }

  const freqRaw = map.get("FREQ");
  if (!freqRaw) throw new Error("RRULE missing FREQ");
  const freqUpper = freqRaw.toUpperCase();
  if (freqUpper !== "DAILY" && freqUpper !== "WEEKLY" && freqUpper !== "MONTHLY") {
    throw new Error(`Unsupported FREQ: ${freqRaw}`);
  }
  const freq: Frequency = freqUpper;

  let interval = 1;
  if (map.has("INTERVAL")) {
    interval = parsePositiveInt(map.get("INTERVAL") as string, "INTERVAL");
  }

  let byday: ByDayEntry[] = [];
  if (map.has("BYDAY")) {
    const raw = (map.get("BYDAY") as string).toUpperCase();
    const entries = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (entries.length === 0) throw new Error("Invalid BYDAY: empty");
    byday = entries.map((e) => {
      const mm = BYDAY_RE.exec(e);
      if (!mm) throw new Error(`Invalid BYDAY entry: ${e}`);
      const ordRaw = mm[1];
      const code = mm[2] as string;
      const weekday = WEEKDAY_MAP[code] as number;
      let ordinal: number | undefined;
      if (ordRaw !== undefined) {
        if (freq !== "MONTHLY") {
          throw new Error(`BYDAY ordinal (${e}) only allowed with FREQ=MONTHLY`);
        }
        ordinal = Number(ordRaw);
        if (!Number.isSafeInteger(ordinal) || ordinal === 0 || ordinal > 53 || ordinal < -53) {
          throw new Error(`Invalid BYDAY ordinal: ${e}`);
        }
      }
      return ordinal === undefined ? { weekday } : { weekday, ordinal };
    });
  }

  if (freq === "DAILY" && byday.length > 0) {
    throw new Error("BYDAY is not supported with FREQ=DAILY in this subset");
  }

  let count: number | undefined;
  if (map.has("COUNT")) {
    count = parsePositiveInt(map.get("COUNT") as string, "COUNT");
  }

  let untilMs: number | undefined;
  if (map.has("UNTIL")) {
    untilMs = parseUntilToMs(map.get("UNTIL") as string);
  }

  // Propiedades no soportadas del subconjunto.
  const supported = new Set(["FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL"]);
  for (const key of map.keys()) {
    if (!supported.has(key)) throw new Error(`Unsupported RRULE property: ${key}`);
  }

  return { freq, interval, byday, count, untilMs };
}
