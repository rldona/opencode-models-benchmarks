export function getUtcOffset(tzid: string, utcMs: number): number {
  const localeStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzid,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(utcMs))

  const localeDate = new Date(localeStr + 'Z')
  return localeDate.getTime() - utcMs
}

export function getLocalTime(tzid: string, utcMs: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzid,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date(utcMs))
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10)
  return {
    year: get('year'),
    month: parseInt(parts.find(p => p.type === 'month')?.value ?? '1', 10) - 1,
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

export function localTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, tzid: string): number {
  const offset = getUtcOffset(tzid, Date.UTC(year, month, day, hour, minute, second))
  const utcMs = Date.UTC(year, month, day, hour, minute, second)
  return utcMs - offset
}
