import { describe, it, expect } from 'vitest'
import { expand } from '../index'

describe('COUNT combined with BYDAY', () => {
  it('returns exactly COUNT occurrences for 2nd Tuesday with COUNT=6', () => {
    const start = new Date(Date.UTC(2026, 0, 13, 9, 0, 0))
    const from = new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
    const to = new Date(Date.UTC(2027, 11, 31, 23, 59, 59))

    const occurrences = expand(start, 'FREQ=MONTHLY;BYDAY=2TU;COUNT=6', 'UTC', from, to)

    expect(occurrences.length).toBe(6)

    const localDates = occurrences.map(d => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d)
      return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`
    })

    expect(localDates).toContain('2026-01-13')
    expect(localDates).toContain('2026-02-10')
    expect(localDates).toContain('2026-03-10')
    expect(localDates).toContain('2026-04-14')
    expect(localDates).toContain('2026-05-12')
    expect(localDates).toContain('2026-06-09')
  })

  it('respects COUNT limit with last weekday of month', () => {
    const start = new Date(Date.UTC(2026, 0, 30, 9, 0, 0))
    const from = new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
    const to = new Date(Date.UTC(2028, 11, 31, 23, 59, 59))

    const occurrences = expand(start, 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=3', 'UTC', from, to)

    expect(occurrences.length).toBe(3)

    const localDates = occurrences.map(d => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d)
      return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`
    })

    expect(localDates).toContain('2026-01-30')
    expect(localDates).toContain('2026-02-27')
    expect(localDates).toContain('2026-03-27')
  })
})
