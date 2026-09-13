export interface LocalComponents {
  year: number;
  month: number; // 1-based
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun, 6=Sat
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAY_ABBR: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function toLocal(date: Date, tz: string): LocalComponents {
  const f = getFormatter(tz);
  const parts = f.formatToParts(date);
  const map = new Map<string, string>();
  for (const p of parts) {
    map.set(p.type, p.value);
  }
  return {
    year: parseInt(map.get("year")!, 10),
    month: parseInt(map.get("month")!, 10),
    day: parseInt(map.get("day")!, 10),
    hour: parseInt(map.get("hour")!, 10),
    minute: parseInt(map.get("minute")!, 10),
    second: parseInt(map.get("second")!, 10),
    weekday: WEEKDAY_ABBR[map.get("weekday")!] ?? 0,
  };
}

export function fromLocal(
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute: number,
  second: number,
  tz: string,
): Date {
  // Build a UTC date from local components by using Intl to find the offset
  // Strategy: create a date assuming UTC, get what the tz formatter says,
  // then adjust.
  const guessUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  const guessDate = new Date(guessUTC);
  const localParts = toLocal(guessDate, tz);

  // Calculate offset in ms
  const guessLocalAsUTC = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second,
  );
  const offset = guessUTC - guessLocalAsUTC; // ms to add to local to get UTC

  // Apply offset
  const resultUTC = guessUTC + offset;
  return new Date(resultUTC);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
