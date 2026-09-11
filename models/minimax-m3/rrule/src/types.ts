export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export interface ByDayEntry {
  weekday: Weekday;
  /** 1..4 (positive: Nth weekday of month) or -1..-4 (negative: Nth from end). */
  pos?: number;
}

export interface RRule {
  freq: Frequency;
  interval?: number;
  byday?: ByDayEntry[];
  count?: number;
  until?: Date;
}
