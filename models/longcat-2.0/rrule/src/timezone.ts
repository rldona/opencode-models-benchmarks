const WEEKDAY_STR = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function weekdayToNum(w: string): number {
  const idx = WEEKDAY_STR.indexOf(w.toUpperCase());
  if (idx === -1) throw new Error(`Invalid weekday: ${w}`);
  return idx;
}

export function numToWeekday(n: number): string {
  return WEEKDAY_STR[((n % 7) + 7) % 7];
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

function formatParts(ms: number, tz: string): LocalParts {
  const d = new Date(ms);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string): number =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function partsToUTC(parts: LocalParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

export function localToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): number {
  const target = partsToUTC({ year, month, day, hour, minute });

  let guess = target;
  for (let i = 0; i < 10; i++) {
    const local = formatParts(guess, tz);
    const localMs = partsToUTC(local);
    const error = localMs - target;

    if (Math.abs(error) < 100) break;

    guess -= error;
  }

  return Math.round(guess);
}

export function utcToLocal(ms: number, tz: string): LocalParts {
  return formatParts(ms, tz);
}
