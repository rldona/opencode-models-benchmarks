export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type DayOfWeek = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export const DAY_ORDER: DayOfWeek[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function dayToNumber(day: DayOfWeek): number {
  return DAY_ORDER.indexOf(day);
}

export interface ByDayPart {
  pos?: number;
  day: DayOfWeek;
}

export interface RRule {
  freq: Freq;
  interval: number;
  count?: number;
  until?: Date;
  byday?: ByDayPart[];
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;
  minute: number;
  second: number;
}
