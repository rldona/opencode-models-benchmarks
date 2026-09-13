export type Freq = "DAILY" | "WEEKLY" | "MONTHLY";

export type ByDay = {
  nth?: number;
  weekday: number;
};

export type ParsedRRule = {
  freq: Freq;
  interval: number;
  byday?: ByDay[];
  count?: number;
  until?: Date;
};

const WEEKDAYS: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function parseUntil(raw: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(raw.trim());
  if (!m) throw new Error(`Invalid UNTIL: ${raw}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (m[4] === undefined) {
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  }
  return new Date(
    Date.UTC(year, month - 1, day, Number(m[4]), Number(m[5]), Number(m[6])),
  );
}

function parseByday(raw: string): ByDay[] {
  return raw.split(",").map((token) => {
    const m = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(token.trim().toUpperCase());
    if (!m) throw new Error(`Invalid BYDAY: ${token}`);
    const nth = m[1] !== undefined ? Number(m[1]) : undefined;
    if (nth === 0) throw new Error("Invalid BYDAY: nth cannot be 0");
    return { nth, weekday: WEEKDAYS[m[2]] };
  });
}

export function parseRRule(rrule: string): ParsedRRule {
  let body = rrule.trim();
  if (body.toUpperCase().startsWith("RRULE:")) body = body.slice(6);

  const map: Record<string, string> = {};
  for (const part of body.split(";")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) throw new Error(`Invalid RRULE part: ${part}`);
    map[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).trim();
  }

  const freqRaw = map.FREQ?.toUpperCase();
  if (freqRaw !== "DAILY" && freqRaw !== "WEEKLY" && freqRaw !== "MONTHLY") {
    throw new Error(`Unsupported FREQ: ${map.FREQ}`);
  }

  const interval = map.INTERVAL !== undefined ? Number(map.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error(`Invalid INTERVAL: ${map.INTERVAL}`);
  }

  const count = map.COUNT !== undefined ? Number(map.COUNT) : undefined;
  if (count !== undefined && (!Number.isInteger(count) || count < 0)) {
    throw new Error(`Invalid COUNT: ${map.COUNT}`);
  }

  return {
    freq: freqRaw,
    interval,
    byday: map.BYDAY ? parseByday(map.BYDAY) : undefined,
    count,
    until: map.UNTIL ? parseUntil(map.UNTIL) : undefined,
  };
}
