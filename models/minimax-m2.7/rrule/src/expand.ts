import { Freq, RRule, Weekday } from './types'
import { WEEKDAY_TO_NUM } from './parse'
import { localTimeToUtc, getLocalTime } from './offset'

function getNthWeekdayOfMonth(year: number, month: number, weekday: Weekday, position: number): number | null {
  if (position === -1) {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const lastDay = new Date(year, month, daysInMonth)
    const lastWeekday = lastDay.getDay()
    const targetWeekday = WEEKDAY_TO_NUM[weekday]
    const diff = (lastWeekday - targetWeekday + 7) % 7
    return daysInMonth - diff
  }

  const firstDay = new Date(year, month, 1)
  const firstWeekday = firstDay.getDay()
  const targetWeekday = WEEKDAY_TO_NUM[weekday]
  const diff = ((targetWeekday - firstWeekday) + 7) % 7
  const firstOccurrence = 1 + diff
  const day = firstOccurrence + (position - 1) * 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return day <= daysInMonth ? day : null
}

function maxDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function addLocalDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const d = new Date(year, month, day + days)
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
}

function addLocalMonths(year: number, month: number, day: number, months: number): { year: number; month: number; day: number } {
  const targetMonth = month + months
  const targetYear = year + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const maxDay = maxDaysInMonth(targetYear, normalizedMonth)
  const cappedDay = Math.min(day, maxDay)
  return { year: targetYear, month: normalizedMonth, day: cappedDay }
}

function sameLocalDay(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

export function expandRRule(options: {
  start: Date
  rule: RRule
  tzid: string
  from: Date
  to: Date
}): Date[] {
  const { start, rule, tzid, from, to } = options
  const { freq, interval, byDay, count, until } = rule

  const localStart = getLocalTime(tzid, start.getTime())
  const startYear = localStart.year
  const startMonth = localStart.month
  const startDay = localStart.day
  const startHour = localStart.hour
  const startMinute = localStart.minute
  const startSecond = localStart.second

  const localFrom = getLocalTime(tzid, from.getTime())
  const untilLocal = until ? getLocalTime(tzid, until.getTime()) : null

  const results: Date[] = []

  const addResult = (year: number, month: number, day: number): boolean => {
    if (count !== undefined && results.length >= count) return false
    if (untilLocal) {
      if (year > untilLocal.year) return false
      if (year === untilLocal.year && month > untilLocal.month) return false
      if (year === untilLocal.year && month === untilLocal.month && day > untilLocal.day) return false
    }

    const utcMs = localTimeToUtc(year, month, day, startHour, startMinute, startSecond, tzid)
    if (utcMs < from.getTime()) return true
    if (utcMs > to.getTime()) return false

    const lt = { year, month, day }
    const existing = results.find(r => {
      const lr = getLocalTime(tzid, r.getTime())
      return sameLocalDay(lr, lt)
    })
    if (!existing) {
      results.push(new Date(utcMs))
    }
    return true
  }

  if (freq === 'DAILY') {
    let cur = { year: startYear, month: startMonth, day: startDay }
    for (let i = 0; i < 1000; i++) {
      if (!addResult(cur.year, cur.month, cur.day)) break
      cur = addLocalDays(cur.year, cur.month, cur.day, interval)
    }
    return results
  }

  if (freq === 'WEEKLY') {
    if (byDay && byDay.length > 0) {
      const targetWeekday = WEEKDAY_TO_NUM[byDay[0].weekday]
      let curDate = new Date(startYear, startMonth, startDay)
      while (curDate.getDay() !== targetWeekday) {
        curDate.setDate(curDate.getDate() - 1)
      }
      let cur = { year: curDate.getFullYear(), month: curDate.getMonth(), day: curDate.getDate() }
      const startMs = start.getTime()
      const candidateMs = localTimeToUtc(cur.year, cur.month, cur.day, startHour, startMinute, startSecond, tzid)
      if (candidateMs < startMs) {
        cur = addLocalDays(cur.year, cur.month, cur.day, 7 * interval)
      }
      for (let i = 0; i < 200; i++) {
        if (!addResult(cur.year, cur.month, cur.day)) break
        cur = addLocalDays(cur.year, cur.month, cur.day, 7 * interval)
      }
      return results
    }

    const startOfWeek = new Date(startYear, startMonth, startDay)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    let cur = { year: startOfWeek.getFullYear(), month: startOfWeek.getMonth(), day: startOfWeek.getDate() }
    let weekIndex = 0
    const seenWeeks = new Set<string>()

    for (let i = 0; i < 200; i++) {
      const weekKey = `${cur.year}-${cur.month}-${cur.day}`
      if (seenWeeks.has(weekKey)) break
      seenWeeks.add(weekKey)

      const candidateMs = localTimeToUtc(cur.year, cur.month, cur.day, startHour, startMinute, startSecond, tzid)
      if (candidateMs >= start.getTime()) {
        if (!addResult(cur.year, cur.month, cur.day)) break
      }
      weekIndex++
      cur = addLocalDays(cur.year, cur.month, cur.day, 7)
      if (interval > 1 && weekIndex % interval !== 0) {
        i--
      }
    }
    return results
  }

  if (freq === 'MONTHLY') {
    if (byDay && byDay.length > 0) {
      const bd = byDay[0]
      if (bd && bd.position !== undefined) {
        let curYear = startYear
        let curMonth = startMonth

        const firstTarget = getNthWeekdayOfMonth(curYear, curMonth, bd.weekday, bd.position)
        let curDay = firstTarget ?? 0
        if (firstTarget === null || (curYear === startYear && curMonth === startMonth && firstTarget < startDay)) {
          curMonth += interval
          if (curMonth > 11) { curMonth = curMonth % 12; curYear++ }
          const nextTarget = getNthWeekdayOfMonth(curYear, curMonth, bd.weekday, bd.position)
          curDay = nextTarget ?? 0
        }

        for (let i = 0; i < 100; i++) {
          const target = getNthWeekdayOfMonth(curYear, curMonth, bd.weekday, bd.position)
          if (target === null) {
            curMonth += interval
            if (curMonth > 11) { curMonth = curMonth % 12; curYear++ }
            continue
          }
          if (!addResult(curYear, curMonth, target)) break
          curMonth += interval
          if (curMonth > 11) { curMonth = curMonth % 12; curYear++ }
        }
        return results
      }
    }

    let curYear = startYear
    let curMonth = startMonth
    const originalDay = startDay
    const startYearMonth = startYear * 12 + startMonth

    for (let i = 0; i < 100; i++) {
      const maxDay = maxDaysInMonth(curYear, curMonth)
      const effectiveDay = Math.min(originalDay, maxDay)
      if (!addResult(curYear, curMonth, effectiveDay)) break
      curMonth += interval
      if (curMonth > 11) { curYear += Math.floor(curMonth / 12); curMonth = curMonth % 12; }
      const currentYearMonth = curYear * 12 + curMonth
      if (i > 0 && currentYearMonth === startYearMonth) break
    }
    return results
  }

  return results
}
