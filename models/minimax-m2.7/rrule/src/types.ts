export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY'

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

export interface ByDay {
  weekday: Weekday
  position?: number
}

export interface RRule {
  freq: Freq
  interval: number
  byDay?: ByDay[]
  count?: number
  until?: Date
}

export interface ExpandOptions {
  start: Date
  rule: RRule
  tzid: string
  from: Date
  to: Date
}
