export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface ByDayToken {
  ordinal?: number;
  day: string;
}

export interface RRule {
  freq: Frequency;
  interval: number;
  byday?: ByDayToken[];
  count?: number;
  until?: Date;
}
