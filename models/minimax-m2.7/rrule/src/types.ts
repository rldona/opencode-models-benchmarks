export type FreqType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface ByDayEntry {
  day: Weekday;
  position?: number;
}

export interface ParsedRRule {
  freq: FreqType;
  interval: number;
  byDay: ByDayEntry[];
  count?: number;
  until?: Date;
}

export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isDst: boolean;
}

export interface Occurrence {
  localDateTime: LocalDateTime;
  timestamp: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ExpansionOptions {
  startDate: Date;
  rrule: string;
  timezone: string;
  rangeStart: Date;
  rangeEnd: Date;
}
