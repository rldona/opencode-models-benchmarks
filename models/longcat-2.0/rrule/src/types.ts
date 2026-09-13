export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type Weekday = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

export interface ByDay {
  weekday: number; // 0 = SU, 1 = MO, ..., 6 = SA
  pos: number | null; // e.g. 2 for "2TU", -1 for "-1FR", null for plain "MO"
}

export interface RRule {
  freq: Freq;
  interval: number;
  count?: number;
  until?: number; // epoch ms (UTC instant)
  byday?: ByDay[];
}
