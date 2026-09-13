import type { ByDayEntry, RRule, Weekday } from './types.js';
import { WEEKDAYS } from './types.js';
import { zonedWallToUtc } from './tz.js';
import { parseRRule } from './parser.js';

const WEEKDAY_TO_INDEX: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

function addDaysYMD(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function addMonthsYM(y: number, m: number, months: number): { y: number; m: number } {
  const idx = m - 1 + months;
  const ny = y + Math.floor(idx / 12);
  const nm = ((idx % 12) + 12) % 12;
  return { y: ny, m: nm + 1 };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function weekdayOfYMD(y: number, m: number, d: number): Weekday {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const iso = wd === 0 ? 7 : wd;
  return WEEKDAYS[iso - 1]!;
}

function nthWeekdayOfMonth(y: number, m: number, wd: Weekday, n: number): number | null {
  const firstWdIdx = WEEKDAY_TO_INDEX[weekdayOfYMD(y, m, 1)];
  const target = WEEKDAY_TO_INDEX[wd];
  let day = 1 + ((target - firstWdIdx + 7) % 7);
  day += (n - 1) * 7;
  const dim = daysInMonth(y, m);
  return day <= dim ? day : null;
}

function lastNthWeekdayOfMonth(y: number, m: number, wd: Weekday, n: number): number | null {
  const dim = daysInMonth(y, m);
  const lastWdIdx = WEEKDAY_TO_INDEX[weekdayOfYMD(y, m, dim)];
  const target = WEEKDAY_TO_INDEX[wd];
  let day = dim - ((lastWdIdx - target + 7) % 7);
  day -= (n - 1) * 7;
  return day >= 1 ? day : null;
}

function monthlyByDaySlots(y: number, m: number, byday: ByDayEntry[]): number[] {
  const days = new Set<number>();
  for (const entry of byday) {
    if (entry.pos === undefined) {
      const firstWdIdx = WEEKDAY_TO_INDEX[weekdayOfYMD(y, m, 1)];
      const target = WEEKDAY_TO_INDEX[entry.weekday];
      let day = 1 + ((target - firstWdIdx + 7) % 7);
      const dim = daysInMonth(y, m);
      while (day <= dim) {
        days.add(day);
        day += 7;
      }
    } else if (entry.pos > 0) {
      const day = nthWeekdayOfMonth(y, m, entry.weekday, entry.pos);
      if (day !== null) days.add(day);
    } else {
      const day = lastNthWeekdayOfMonth(y, m, entry.weekday, -entry.pos);
      if (day !== null) days.add(day);
    }
  }
  return [...days].sort((a, b) => a - b);
}

function ymdOfWallClock(dt: Date): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
    h: dt.getUTCHours(),
    mi: dt.getUTCMinutes(),
    s: dt.getUTCSeconds(),
  };
}

export function expand(
  rule: RRule | string,
  dtstart: Date,
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string,
): Date[] {
  const parsed: RRule = typeof rule === 'string' ? parseRRule(rule) : rule;
  const interval = Math.max(1, parsed.interval ?? 1);
  const count = parsed.count;
  const until = parsed.until;
  const byday = parsed.byday;

  if (count === undefined && until === undefined && rangeEnd.getTime() <= rangeStart.getTime()) {
    return [];
  }

  const wc = ymdOfWallClock(dtstart);
  const dsH = wc.h;
  const dsMi = wc.mi;
  const dsS = wc.s;

  const out: Date[] = [];
  let emitted = 0;

  type Action = 'continue' | 'stop';
  const tryEmit = (y: number, m: number, d: number): Action => {
    const utc = zonedWallToUtc(y, m, d, dsH, dsMi, dsS, timeZone).getTime();
    if (utc < rangeStart.getTime()) return 'continue';
    if (utc >= rangeEnd.getTime()) return 'stop';
    if (until !== undefined && utc > until.getTime()) return 'stop';
    if (count !== undefined && emitted >= count) return 'stop';
    out.push(new Date(utc));
    emitted++;
    if (count !== undefined && emitted >= count) return 'stop';
    return 'continue';
  };

  if (parsed.freq === 'DAILY') {
    let y = wc.y;
    let m = wc.m;
    let d = wc.d;
    for (;;) {
      const action = tryEmit(y, m, d);
      if (action === 'stop') break;
      const next = addDaysYMD(y, m, d, interval);
      y = next.y;
      m = next.m;
      d = next.d;
    }
  } else if (parsed.freq === 'WEEKLY') {
    const bydays: ByDayEntry[] =
      byday && byday.length > 0
        ? byday.map((e) => ({ weekday: e.weekday }))
        : [{ weekday: weekdayOfYMD(wc.y, wc.m, wc.d) }];

    const dtWdIso = weekdayOfYMD(wc.y, wc.m, wc.d);
    const dtWdIdx = WEEKDAY_TO_INDEX[dtWdIso];
    const monday = addDaysYMD(wc.y, wc.m, wc.d, -(dtWdIdx - 1));

    let ay = monday.y;
    let am = monday.m;
    let ad = monday.d;

    for (;;) {
      let stopped = false;
      for (const entry of bydays) {
        const wdIdx = WEEKDAY_TO_INDEX[entry.weekday];
        const target = addDaysYMD(ay, am, ad, wdIdx - 1);
        const action = tryEmit(target.y, target.m, target.d);
        if (action === 'stop') {
          stopped = true;
          break;
        }
      }
      if (stopped) break;
      const next = addDaysYMD(ay, am, ad, interval * 7);
      ay = next.y;
      am = next.m;
      ad = next.d;
    }
  } else if (parsed.freq === 'MONTHLY') {
    if (!byday || byday.length === 0) {
      let y = wc.y;
      let m = wc.m;
      for (;;) {
        const dim = daysInMonth(y, m);
        let action: Action = 'continue';
        if (wc.d <= dim) {
          action = tryEmit(y, m, wc.d);
        }
        if (action === 'stop') break;
        const next = addMonthsYM(y, m, interval);
        y = next.y;
        m = next.m;
        if (y > 2200) break;
      }
    } else {
      let y = wc.y;
      let m = wc.m;
      for (;;) {
        const slots = monthlyByDaySlots(y, m, byday);
        let stopped = false;
        for (const day of slots) {
          const action = tryEmit(y, m, day);
          if (action === 'stop') {
            stopped = true;
            break;
          }
        }
        if (stopped) break;
        const next = addMonthsYM(y, m, interval);
        y = next.y;
        m = next.m;
        if (y > 2200) break;
      }
    }
  }

  return out;
}
