export enum Frequency {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
}

export enum Weekday {
  SU = 0,
  MO = 1,
  TU = 2,
  WE = 3,
  TH = 4,
  FR = 5,
  SA = 6,
}

export interface ByDayEntry {
  day: Weekday;
  nth?: number; // 1-based positive: e.g. 2TU = 2nd Tuesday
  last?: boolean; // -1FR = last Friday
}

export interface RRuleOptions {
  freq: Frequency;
  interval: number;
  byDay: ByDayEntry[] | null;
  count: number | null;
  until: Date | null; // UTC Date
}

export const WEEKDAY_MAP: Record<string, Weekday> = {
  SU: Weekday.SU,
  MO: Weekday.MO,
  TU: Weekday.TU,
  WE: Weekday.WE,
  TH: Weekday.TH,
  FR: Weekday.FR,
  SA: Weekday.SA,
};
