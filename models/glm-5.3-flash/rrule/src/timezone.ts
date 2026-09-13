export interface Wall {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(zone, formatter);
  }
  return formatter;
}

export function validateTimeZone(zone: string): void {
  try {
    getFormatter(zone);
  } catch {
    throw new Error(`Unknown IANA time zone "${zone}"`);
  }
}

export function zoneParts(zone: string, utcMs: number): Wall {
  const parts = getFormatter(zone).formatToParts(new Date(utcMs));
  const values = new Map<string, number>();
  for (const part of parts) {
    if (part.type !== 'literal') {
      values.set(part.type, Number(part.value));
    }
  }
  const y = values.get('year');
  const mo = values.get('month');
  const d = values.get('day');
  let h = values.get('hour');
  const mi = values.get('minute');
  const s = values.get('second');
  if (y === undefined || mo === undefined || d === undefined || h === undefined || mi === undefined || s === undefined) {
    throw new Error(`Cannot format instant in time zone "${zone}"`);
  }
  if (h === 24) {
    h = 0;
  }
  return { y, mo, d, h, mi, s };
}

export function offsetAt(zone: string, utcMs: number): number {
  const wall = zoneParts(zone, utcMs);
  return Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s) - utcMs;
}

export function wallToUtc(wall: Wall, zone: string): number {
  const wallAsUtc = Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s);
  const offsetA = offsetAt(zone, wallAsUtc);
  const candidate1 = wallAsUtc - offsetA;
  const offsetB = offsetAt(zone, candidate1);
  if (offsetB !== offsetA) {
    const candidate2 = wallAsUtc - offsetB;
    if (offsetAt(zone, candidate2) === offsetB) {
      return Math.min(candidate1, candidate2);
    }
    return wallAsUtc - Math.min(offsetA, offsetB);
  }
  for (const deltaMinutes of [30, 60, 90, 120, 180, 240]) {
    const earlierOffset = offsetA + deltaMinutes * 60_000;
    const earlier = wallAsUtc - earlierOffset;
    if (offsetAt(zone, earlier) === earlierOffset) {
      return earlier;
    }
  }
  return candidate1;
}

export function formatWall(wall: Wall): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${wall.y}-${pad(wall.mo)}-${pad(wall.d)}T${pad(wall.h)}:${pad(wall.mi)}:${pad(wall.s)}`;
}
