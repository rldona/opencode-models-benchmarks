export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface WeekdayPosition {
  weekday: Weekday;
  position?: number; // -1 for last, 1-4 for nth
}

export interface ParsedRRule {
  freq: Frequency;
  interval: number;
  byDay?: WeekdayPosition[];
  count?: number;
  until?: Date;
}

export interface Occurrence {
  start: Date;
  end: Date;
}

export interface ExpandOptions {
  startDate: Date;
  rrule: string | ParsedRRule;
  timeZone: string;
  rangeStart: Date;
  rangeEnd: Date;
  duration?: number; // duration in milliseconds, default 0 (instant)
}
