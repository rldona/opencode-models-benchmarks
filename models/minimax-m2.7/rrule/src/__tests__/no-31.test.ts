import { describe, it, expect } from 'vitest'
import { expand } from '../index'

describe('Monthly events on day 31 in months without 31 days', () => {
  it('rolls over to last day of month for FREQ=MONTHLY without BYDAY (Jan-May)', () => {
    const start = new Date(Date.UTC(2026, 0, 31, 9, 0, 0))
    const from = new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
    const to = new Date(Date.UTC(2026, 5, 31, 23, 59, 59))

    const occurrences = expand(start, 'FREQ=MONTHLY;INTERVAL=1', 'UTC', from, to)

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

    expect(localDates).toContain('2026-01-31')
    expect(localDates).toContain('2026-02-28')
    expect(localDates).toContain('2026-03-31')
    expect(localDates).toContain('2026-04-30')
    expect(localDates).toContain('2026-05-31')
    expect(localDates).toContain('2026-06-30')
  })

  it('correctly handles FREQ=MONTHLY without BYDAY across full year', () => {
    const start = new Date(Date.UTC(2026, 0, 31, 9, 0, 0))
    const from = new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
    const to = new Date(Date.UTC(2026, 11, 31, 23, 59, 59))

    const occurrences = expand(start, 'FREQ=MONTHLY;INTERVAL=1', 'UTC', from, to)

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

    expect(localDates).toContain('2026-01-31')
    expect(localDates).toContain('2026-02-28')
    expect(localDates).toContain('2026-03-31')
    expect(localDates).toContain('2026-04-30')
    expect(localDates).toContain('2026-05-31')
    expect(localDates).toContain('2026-06-30')
    expect(localDates).toContain('2026-07-31')
    expect(localDates).toContain('2026-08-31')
    expect(localDates).toContain('2026-09-30')
    expect(localDates).toContain('2026-10-31')
    expect(localDates).toContain('2026-11-30')
    expect(localDates).toContain('2026-12-31')
  })
})
