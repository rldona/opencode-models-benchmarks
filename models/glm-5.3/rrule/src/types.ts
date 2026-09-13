export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface ByDayToken {
  ord?: number;
  day: Weekday;
}

export interface Rule {
  freq: Freq;
  interval?: number;
  byDay?: ByDayToken[];
  count?: number;
  until?: Date | string;
}

export interface WallDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface ExpandOptions {
  start: Date | string;
  rule: Rule | string;
  timeZone: string;
  from: Date | string;
  to: Date | string;
}
