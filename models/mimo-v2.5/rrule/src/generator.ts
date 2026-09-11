import { Frequency, type RRuleOptions, type ByDayEntry, Weekday } from "./types.js";
import { toLocal, fromLocal, getDaysInMonth } from "./timezone.js";

export function generateOccurrences(
  options: RRuleOptions,
  dtstart: Date,
  tz: string,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const local = toLocal(dtstart, tz);
  const results: Date[] = [];
  let count = 0;
  const maxCount = options.count ?? Infinity;
  const until = options.until;

  // Current local state we are iterating from
  let curYear = local.year;
  let curMonth = local.month;
  let curDay = local.day;

  const hour = local.hour;
  const minute = local.minute;
  const second = local.second;

  // Safety: limit iterations
  const MAX_ITER = 100000;
  let iter = 0;

  while (count < maxCount && iter < MAX_ITER) {
    iter++;
    const candidates = expandCandidates(
      options.freq,
      options.interval,
      options.byDay,
      curYear,
      curMonth,
      curDay,
    );

    // Sort candidates chronologically
    candidates.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.month !== b.month) return a.month - b.month;
      return a.day - b.day;
    });

    // If we have BYDAY and freq is WEEKLY or MONTHLY, we generated expanded candidates.
    // We need to advance curYear/curMonth/curDay past the last candidate
    // to avoid infinite loops. We do this by tracking what period we processed.
    let advanced = false;

    for (const c of candidates) {
      // Clamp day to valid range for the month
      const maxDay = getDaysInMonth(c.year, c.month);
      const actualDay = Math.min(c.day, maxDay);

      const occ = fromLocal(c.year, c.month, actualDay, hour, minute, second, tz);

      // Check COUNT
      if (count >= maxCount) break;

      // Check UNTIL
      if (until && occ > until) return results;

      // Check range
      if (occ >= rangeStart && occ <= rangeEnd) {
        results.push(occ);
      }

      count++;

      // If occurrence is past rangeEnd, we can stop early (generations are ordered)
      if (occ > rangeEnd) {
        return results;
      }
    }

    // Advance to next period
    const lastCandidate = candidates[candidates.length - 1];
    if (lastCandidate) {
      advancePeriod(
        options.freq,
        options.interval,
        lastCandidate.year,
        lastCandidate.month,
        lastCandidate.day,
      );
    }

    function advancePeriod(
      freq: Frequency,
      interval: number,
      y: number,
      m: number,
      d: number,
    ): void {
      switch (freq) {
        case Frequency.DAILY:
          curDay += interval;
          // Normalize
          while (curDay > getDaysInMonth(curYear, curMonth)) {
            curDay -= getDaysInMonth(curYear, curMonth);
            curMonth++;
            if (curMonth > 12) {
              curMonth = 1;
              curYear++;
            }
          }
          break;
        case Frequency.WEEKLY: {
          // Move to next week start after the last candidate
          curDay += 7 * interval;
          // Normalize
          while (curDay > getDaysInMonth(curYear, curMonth)) {
            curDay -= getDaysInMonth(curYear, curMonth);
            curMonth++;
            if (curMonth > 12) {
              curMonth = 1;
              curYear++;
            }
          }
          break;
        }
        case Frequency.MONTHLY:
          curMonth += interval;
          while (curMonth > 12) {
            curMonth -= 12;
            curYear++;
          }
          // Keep curDay; it will be clamped when generating candidates
          break;
      }
    }

    // Safety: if no candidates generated, break
    if (candidates.length === 0) break;
  }

  return results;
}

interface Candidate {
  year: number;
  month: number;
  day: number;
}

function expandCandidates(
  freq: Frequency,
  interval: number,
  byDay: ByDayEntry[] | null,
  curYear: number,
  curMonth: number,
  curDay: number,
): Candidate[] {
  switch (freq) {
    case Frequency.DAILY:
      return expandDaily(interval, byDay, curYear, curMonth, curDay);
    case Frequency.WEEKLY:
      return expandWeekly(interval, byDay, curYear, curMonth, curDay);
    case Frequency.MONTHLY:
      return expandMonthly(interval, byDay, curYear, curMonth, curDay);
  }
}

function expandDaily(
  interval: number,
  byDay: ByDayEntry[] | null,
  year: number,
  month: number,
  day: number,
): Candidate[] {
  // Single candidate: current day
  // If BYDAY present, filter by weekday
  if (byDay && byDay.length > 0) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const matches = byDay.some((bd) => bd.day === dow);
    if (!matches) return [];
  }
  return [{ year, month, day }];
}

function expandWeekly(
  interval: number,
  byDay: ByDayEntry[] | null,
  year: number,
  month: number,
  day: number,
): Candidate[] {
  if (!byDay || byDay.length === 0) {
    return [{ year, month, day }];
  }

  // Expand: for each BYDAY entry, find that weekday in the current week
  const candidates: Candidate[] = [];
  const startDow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  for (const bd of byDay) {
    // Calculate offset from start of week to target day
    let offset = bd.day - startDow;
    if (offset < 0) offset += 7;

    // Add days to get the target date
    let targetDay = day + offset;
    let targetMonth = month;
    let targetYear = year;

    while (targetDay > getDaysInMonth(targetYear, targetMonth)) {
      targetDay -= getDaysInMonth(targetYear, targetMonth);
      targetMonth++;
      if (targetMonth > 12) {
        targetMonth = 1;
        targetYear++;
      }
    }

    candidates.push({ year: targetYear, month: targetMonth, day: targetDay });
  }

  return candidates;
}

function expandMonthly(
  interval: number,
  byDay: ByDayEntry[] | null,
  year: number,
  month: number,
  day: number,
): Candidate[] {
  if (!byDay || byDay.length === 0) {
    // Single candidate: same day, clamped to month length
    const maxDay = getDaysInMonth(year, month);
    return [{ year, month, day: Math.min(day, maxDay) }];
  }

  // Expand BYDAY for this month
  const candidates: Candidate[] = [];
  const daysInMonth = getDaysInMonth(year, month);

  for (const bd of byDay) {
    if (bd.last) {
      // Find last occurrence of weekday in month
      let d = daysInMonth;
      while (d >= 1) {
        const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
        if (dow === bd.day) {
          candidates.push({ year, month, day: d });
          break;
        }
        d--;
      }
    } else if (bd.nth) {
      // Find nth occurrence of weekday in month
      let count = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
        if (dow === bd.day) {
          count++;
          if (count === bd.nth) {
            candidates.push({ year, month, day: d });
            break;
          }
        }
      }
    } else {
      // All occurrences of weekday in month
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
        if (dow === bd.day) {
          candidates.push({ year, month, day: d });
        }
      }
    }
  }

  return candidates;
}
