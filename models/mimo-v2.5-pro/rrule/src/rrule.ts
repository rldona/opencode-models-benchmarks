import { ExpandOptions, Occurrence, ParsedRRule, WeekdayPosition } from './types.js';
import { parseRRule } from './parser.js';
import {
  dateToParts,
  partsToDate,
  addDays,
  addMonths,
  getDaysInMonth,
  getWeekday,
  WEEKDAY_MAP,
  TimeZoneParts,
} from './timezone.js';

function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

function weekdayMatches(date: Date, timeZone: string, byDays: WeekdayPosition[]): boolean {
  const dayOfWeek = getWeekday(date, timeZone);
  const parts = dateToParts(date, timeZone);
  
  for (const byDay of byDays) {
    const targetDay = WEEKDAY_MAP[byDay.weekday];
    if (dayOfWeek !== targetDay) continue;
    
    // If no position specified, just matching the weekday is enough
    if (byDay.position === undefined) return true;
    
    // For monthly frequency with position
    if (byDay.position === -1) {
      // Last occurrence of this weekday in the month
      const daysInMonth = getDaysInMonth(parts.year, parts.month);
      const lastDay = partsToDate({
        ...parts,
        day: daysInMonth,
      }, timeZone);
      const lastDayOfWeek = getWeekday(lastDay, timeZone);
      
      // Find the last occurrence of targetDay
      let diff = lastDayOfWeek - targetDay;
      if (diff < 0) diff += 7;
      const lastOccurrence = daysInMonth - diff;
      
      return parts.day === lastOccurrence;
    } else {
      // nth occurrence (1-4)
      // Find the first occurrence of this weekday in the month
      const firstDay = partsToDate({ ...parts, day: 1 }, timeZone);
      const firstDayOfWeek = getWeekday(firstDay, timeZone);
      
      let firstOccurrence = 1 + ((targetDay - firstDayOfWeek + 7) % 7);
      const nthOccurrence = firstOccurrence + (byDay.position - 1) * 7;
      
      return parts.day === nthOccurrence && nthOccurrence <= getDaysInMonth(parts.year, parts.month);
    }
  }
  
  return false;
}

function generateDailyCandidates(
  startDate: Date,
  rrule: ParsedRRule,
  timeZone: string,
  rangeEnd: Date,
): Date[] {
  const candidates: Date[] = [];
  let current = startDate;
  let count = 0;
  const maxIterations = rrule.count ?? 10000; // Safety limit
  
  while (candidates.length < maxIterations) {
    // Check UNTIL
    if (rrule.until && isAfter(current, rrule.until)) break;
    
    // Check range
    if (isAfter(current, rangeEnd)) break;
    
    // Check COUNT
    if (rrule.count && count >= rrule.count) break;
    
    // Check BYDAY filter
    if (!rrule.byDay || weekdayMatches(current, timeZone, rrule.byDay)) {
      candidates.push(current);
      count++;
    }
    
    // Advance by interval days
    current = addDays(current, rrule.interval, timeZone);
  }
  
  return candidates;
}

function generateWeeklyCandidates(
  startDate: Date,
  rrule: ParsedRRule,
  timeZone: string,
  rangeEnd: Date,
): Date[] {
  const candidates: Date[] = [];
  const startParts = dateToParts(startDate, timeZone);
  
  // Find the start of the week (Monday)
  const startDayOfWeek = getWeekday(startDate, timeZone);
  const mondayOffset = (startDayOfWeek + 6) % 7; // Convert to Mon=0
  const weekStart = addDays(startDate, -mondayOffset, timeZone);
  
  let weekOffset = 0;
  let count = 0;
  const maxWeeks = Math.ceil((rrule.count ?? 10000) / (rrule.byDay?.length ?? 1));
  
  while (weekOffset < maxWeeks * rrule.interval) {
    const currentWeekStart = addDays(weekStart, weekOffset * 7, timeZone);
    
    // Check if this week is in range
    const weekEnd = addDays(currentWeekStart, 6, timeZone);
    if (isBefore(weekEnd, startDate) && weekOffset === 0) {
      weekOffset++;
      continue;
    }
    
    // Generate candidates for each day in BYDAY
    if (rrule.byDay) {
      for (const byDay of rrule.byDay) {
        const targetDay = WEEKDAY_MAP[byDay.weekday];
        const currentMonday = getWeekday(currentWeekStart, timeZone);
        const dayOffset = (targetDay - currentMonday + 7) % 7;
        const candidate = addDays(currentWeekStart, dayOffset, timeZone);
        
        // Check UNTIL
        if (rrule.until && isAfter(candidate, rrule.until)) return candidates;
        
        // Check range
        if (isAfter(candidate, rangeEnd)) return candidates;
        
        // Must be on or after start date
        if (isBefore(candidate, startDate)) continue;
        
        // Check COUNT
        if (rrule.count && count >= rrule.count) return candidates;
        
        candidates.push(candidate);
        count++;
      }
    } else {
      // No BYDAY, use the start date's weekday
      const candidate = currentWeekStart;
      
      if (rrule.until && isAfter(candidate, rrule.until)) return candidates;
      if (isAfter(candidate, rangeEnd)) return candidates;
      if (!isBefore(candidate, startDate)) {
        if (rrule.count && count >= rrule.count) return candidates;
        candidates.push(candidate);
        count++;
      }
    }
    
    weekOffset += rrule.interval;
  }
  
  return candidates;
}

function generateMonthlyCandidates(
  startDate: Date,
  rrule: ParsedRRule,
  timeZone: string,
  rangeEnd: Date,
): Date[] {
  const candidates: Date[] = [];
  const startParts = dateToParts(startDate, timeZone);
  
  let monthOffset = 0;
  let count = 0;
  const maxMonths = rrule.count ? rrule.count * 2 : 1200; // 100 years safety
  
  while (monthOffset < maxMonths) {
    const targetMonth = startParts.month + monthOffset;
    const targetYear = startParts.year + Math.floor((targetMonth - 1) / 12);
    const targetMonthInYear = ((targetMonth - 1) % 12) + 1;
    
    // Check UNTIL
    if (rrule.until) {
      const monthStart = partsToDate({
        ...startParts,
        year: targetYear,
        month: targetMonthInYear,
        day: 1,
      }, timeZone);
      if (isAfter(monthStart, rrule.until)) return candidates;
    }
    
    if (rrule.byDay) {
      // Generate candidates for each BYDAY in this month
      for (const byDay of rrule.byDay) {
        const candidate = findMonthlyByDay(
          targetYear,
          targetMonthInYear,
          byDay,
          startParts,
          timeZone,
        );
        
        if (!candidate) continue;
        
        // Check UNTIL
        if (rrule.until && isAfter(candidate, rrule.until)) return candidates;
        
        // Check range
        if (isAfter(candidate, rangeEnd)) return candidates;
        
        // Must be on or after start date
        if (isBefore(candidate, startDate)) continue;
        
        // Check COUNT
        if (rrule.count && count >= rrule.count) return candidates;
        
        candidates.push(candidate);
        count++;
      }
    } else {
      // No BYDAY, use the start date's day (clamped to month length)
      const daysInMonth = getDaysInMonth(targetYear, targetMonthInYear);
      const day = Math.min(startParts.day, daysInMonth);
      
      const candidate = partsToDate({
        ...startParts,
        year: targetYear,
        month: targetMonthInYear,
        day,
      }, timeZone);
      
      // Check UNTIL
      if (rrule.until && isAfter(candidate, rrule.until)) return candidates;
      
      // Check range
      if (isAfter(candidate, rangeEnd)) return candidates;
      
      // Must be on or after start date
      if (!isBefore(candidate, startDate)) {
        // Check COUNT
        if (rrule.count && count >= rrule.count) return candidates;
        
        candidates.push(candidate);
        count++;
      }
    }
    
    monthOffset += rrule.interval;
  }
  
  return candidates;
}

function findMonthlyByDay(
  year: number,
  month: number,
  byDay: WeekdayPosition,
  startTime: TimeZoneParts,
  timeZone: string,
): Date | null {
  const targetDay = WEEKDAY_MAP[byDay.weekday];
  const daysInMonth = getDaysInMonth(year, month);
  
  // Find the first occurrence of targetDay in the month
  const firstDay = partsToDate({ ...startTime, year, month, day: 1 }, timeZone);
  const firstDayOfWeek = getWeekday(firstDay, timeZone);
  
  let firstOccurrence = 1 + ((targetDay - firstDayOfWeek + 7) % 7);
  
  if (byDay.position === -1) {
    // Last occurrence
    const lastDay = partsToDate({ ...startTime, year, month, day: daysInMonth }, timeZone);
    const lastDayOfWeek = getWeekday(lastDay, timeZone);
    let diff = lastDayOfWeek - targetDay;
    if (diff < 0) diff += 7;
    const lastOccurrence = daysInMonth - diff;
    
    if (lastOccurrence < 1 || lastOccurrence > daysInMonth) return null;
    
    return partsToDate({
      ...startTime,
      year,
      month,
      day: lastOccurrence,
    }, timeZone);
  } else if (byDay.position !== undefined) {
    // nth occurrence
    const nthOccurrence = firstOccurrence + (byDay.position - 1) * 7;
    
    if (nthOccurrence < 1 || nthOccurrence > daysInMonth) return null;
    
    return partsToDate({
      ...startTime,
      year,
      month,
      day: nthOccurrence,
    }, timeZone);
  } else {
    // No position, just use first occurrence (shouldn't happen for monthly BYDAY)
    return partsToDate({
      ...startTime,
      year,
      month,
      day: firstOccurrence,
    }, timeZone);
  }
}

export function expandOccurrences(options: ExpandOptions): Occurrence[] {
  const {
    startDate,
    rrule: rruleInput,
    timeZone,
    rangeStart,
    rangeEnd,
    duration = 0,
  } = options;
  
  const rrule = typeof rruleInput === 'string' ? parseRRule(rruleInput) : rruleInput;
  
  let candidates: Date[];
  
  switch (rrule.freq) {
    case 'DAILY':
      candidates = generateDailyCandidates(startDate, rrule, timeZone, rangeEnd);
      break;
    case 'WEEKLY':
      candidates = generateWeeklyCandidates(startDate, rrule, timeZone, rangeEnd);
      break;
    case 'MONTHLY':
      candidates = generateMonthlyCandidates(startDate, rrule, timeZone, rangeEnd);
      break;
    default:
      throw new Error(`Unsupported frequency: ${rrule.freq}`);
  }
  
  // Filter to range and create occurrences
  return candidates
    .filter(d => !isBefore(d, rangeStart) && !isAfter(d, rangeEnd))
    .map(start => ({
      start,
      end: new Date(start.getTime() + duration),
    }));
}
