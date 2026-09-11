import { ByDay, Freq, RRule, Weekday } from './types'

const WEEKDAY_MAP: Record<string, Weekday> = {
  MO: 'MO',
  TU: 'TU',
  WE: 'WE',
  TH: 'TH',
  FR: 'FR',
  SA: 'SA',
  SU: 'SU',
}

const WEEKDAY_TO_NUM: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 0,
}

export function parseRRule(rruleString: string): RRule {
  const parts = rruleString.split(';')
  const result: RRule = {
    freq: 'WEEKLY',
    interval: 1,
  }

  for (const part of parts) {
    const [key, value] = part.split('=')
    switch (key) {
      case 'FREQ':
        if (value === 'DAILY' || value === 'WEEKLY' || value === 'MONTHLY') {
          result.freq = value
        }
        break
      case 'INTERVAL':
        result.interval = parseInt(value, 10)
        break
      case 'BYDAY':
        result.byDay = parseByDay(value)
        break
      case 'COUNT':
        result.count = parseInt(value, 10)
        break
      case 'UNTIL':
        result.until = parseUntil(value)
        break
    }
  }

  return result
}

function parseByDay(value: string): ByDay[] {
  return value.split(',').map((item) => {
    const match = item.match(/^(-?\d)?(MO|TU|WE|TH|FR|SA|SU)$/)
    if (!match) return null as unknown as ByDay
    return {
      position: match[1] ? parseInt(match[1], 10) : undefined,
      weekday: WEEKDAY_MAP[match[2]] as Weekday,
    }
  }).filter(Boolean)
}

function parseUntil(value: string): Date {
  const year = parseInt(value.slice(0, 4), 10)
  const month = parseInt(value.slice(4, 6), 10) - 1
  const day = parseInt(value.slice(6, 8), 10)
  const hour = parseInt(value.slice(9, 11), 10)
  const minute = parseInt(value.slice(11, 13), 10)
  const second = parseInt(value.slice(13, 15), 10)
  return new Date(Date.UTC(year, month, day, hour, minute, second))
}

export { WEEKDAY_TO_NUM }
