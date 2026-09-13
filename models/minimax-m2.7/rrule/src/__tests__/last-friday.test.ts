import { describe, it, expect } from 'vitest'
import { expand } from '../index'

describe('Last Friday of month', () => {
  it('returns last Friday of each month', () => {
    const start = new Date(Date.UTC(2026, 0, 30, 9, 0, 0))
    const from = new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
    const to = new Date(Date.UTC(2026, 11, 31, 23, 59, 59))

    const occurrences = expand(start, 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=12', 'UTC', from, to)

    expect(occurrences.length).toBe(12)

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

    const expected = [
      '2026-01-30',
      '2026-02-27',
      '2026-03-27',
      '2026-04-24',
      '2026-05-29',
      '2026-06-26',
      '2026-07-31',
      '2026-08-28',
      '2026-09-25',
      '2026-10-30',
      '2026-11-27',
      '2026-12-25',
    ]

    expected.forEach(exp => {
      expect(localDates).toContain(exp)
    })
  })
})
