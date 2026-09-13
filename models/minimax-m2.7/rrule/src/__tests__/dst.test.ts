import { describe, it, expect } from 'vitest'
import { expand } from '../index'

describe('Weekly event crossing DST in Europe/Madrid', () => {
  it('produces occurrences at 09:00 local time across DST transition on Oct 25 2026', () => {
    const start = new Date(Date.UTC(2026, 8, 3, 7, 0, 0))
    const from = new Date(Date.UTC(2026, 8, 1, 0, 0, 0))
    const to = new Date(Date.UTC(2026, 9, 30, 23, 59, 59))

    const occurrences = expand(start, 'FREQ=WEEKLY;BYDAY=WE;INTERVAL=1', 'Europe/Madrid', from, to)

    expect(occurrences.length).toBeGreaterThan(0)

    const offsets = occurrences.map(d => {
      const local = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(d)
      const hour = parseInt(local.find(p => p.type === 'hour')?.value ?? '0', 10)
      const min = parseInt(local.find(p => p.type === 'minute')?.value ?? '0', 10)
      return hour * 60 + min
    })

    const allNineAM = offsets.every(o => o === 9 * 60)
    expect(allNineAM).toBe(true)
  })

  it('matches expected Wednesday occurrences from Sept 9 onward (Sept 2 is before start)', () => {
    const start = new Date(Date.UTC(2026, 8, 3, 7, 0, 0))
    const from = new Date(Date.UTC(2026, 8, 1, 0, 0, 0))
    const to = new Date(Date.UTC(2026, 10, 30, 23, 59, 59))

    const occurrences = expand(start, 'FREQ=WEEKLY;BYDAY=WE;INTERVAL=1', 'Europe/Madrid', from, to)

    const localDates = occurrences.map(d => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d)
      return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}T${parts.find(p => p.type === 'hour')?.value}:${parts.find(p => p.type === 'minute')?.value}`
    })

    expect(localDates).toContain('2026-09-09T09:00')
    expect(localDates).toContain('2026-09-16T09:00')
    expect(localDates).toContain('2026-09-23T09:00')
    expect(localDates).toContain('2026-09-30T09:00')
    expect(localDates).toContain('2026-10-07T09:00')
    expect(localDates).toContain('2026-10-14T09:00')
    expect(localDates).toContain('2026-10-21T09:00')
    expect(localDates).toContain('2026-10-28T09:00')
    expect(localDates).toContain('2026-11-04T09:00')
    expect(localDates).toContain('2026-11-11T09:00')
    expect(localDates).toContain('2026-11-18T09:00')
    expect(localDates).toContain('2026-11-25T09:00')
  })
})
