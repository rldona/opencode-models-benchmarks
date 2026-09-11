export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type DayOfWeek = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface ByDayEntry {
  occurrence?: number;
  day: DayOfWeek;
}

export interface ParsedRRule {
  freq: Frequency;
  interval: number;
  byDay?: ByDayEntry[];
  count?: number;
  until?: Date;
}

export interface ExpandOptions {
  dtStart: Date;
  rrule: string;
  timeZone: string;
  from: Date;
  to: Date;
}
