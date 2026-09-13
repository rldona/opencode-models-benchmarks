import { describe, it, expect } from 'vitest';
import { expandOccurrences } from '../src/rrule.js';
import { parseRRule } from '../src/parser.js';
import { dateToParts, partsToDate } from '../src/timezone.js';

describe('RRule Parser', () => {
  it('should parse simple FREQ', () => {
    const rule = parseRRule('FREQ=DAILY');
    expect(rule).toEqual({ freq: 'DAILY', interval: 1, byDay: undefined, count: undefined, until: undefined });
  });

  it('should parse FREQ with INTERVAL', () => {
    const rule = parseRRule('FREQ=WEEKLY;INTERVAL=2');
    expect(rule.freq).toBe('WEEKLY');
    expect(rule.interval).toBe(2);
  });

  it('should parse BYDAY', () => {
    const rule = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(rule.byDay).toEqual([
      { weekday: 'MO', position: undefined },
      { weekday: 'WE', position: undefined },
      { weekday: 'FR', position: undefined },
    ]);
  });

  it('should parse BYDAY with position', () => {
    const rule = parseRRule('FREQ=MONTHLY;BYDAY=2TU,-1FR');
    expect(rule.byDay).toEqual([
      { weekday: 'TU', position: 2 },
      { weekday: 'FR', position: -1 },
    ]);
  });

  it('should parse COUNT', () => {
    const rule = parseRRule('FREQ=DAILY;COUNT=10');
    expect(rule.count).toBe(10);
  });

  it('should parse UNTIL', () => {
    const rule = parseRRule('FREQ=DAILY;UNTIL=20261231');
    expect(rule.until).toBeDefined();
    expect(rule.until!.getFullYear()).toBe(2026);
    expect(rule.until!.getMonth()).toBe(11);
    expect(rule.until!.getDate()).toBe(31);
  });
});

describe('Timezone utilities', () => {
  it('should convert date to parts in Europe/Madrid', () => {
    // 2026-01-15 10:00 UTC is 11:00 in Europe/Madrid (CET, UTC+1)
    const date = new Date(Date.UTC(2026, 0, 15, 10, 0, 0));
    const parts = dateToParts(date, 'Europe/Madrid');
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(1);
    expect(parts.day).toBe(15);
    expect(parts.hour).toBe(11);
    expect(parts.minute).toBe(0);
  });

  it('should convert date to parts during DST (summer)', () => {
    // 2026-07-15 10:00 UTC is 12:00 in Europe/Madrid (CEST, UTC+2)
    const date = new Date(Date.UTC(2026, 6, 15, 10, 0, 0));
    const parts = dateToParts(date, 'Europe/Madrid');
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(7);
    expect(parts.day).toBe(15);
    expect(parts.hour).toBe(12);
    expect(parts.minute).toBe(0);
  });

  it('should convert parts to date in Europe/Madrid', () => {
    const date = partsToDate({
      year: 2026,
      month: 1,
      day: 15,
      hour: 11,
      minute: 0,
      second: 0,
      millisecond: 0,
    }, 'Europe/Madrid');
    
    const parts = dateToParts(date, 'Europe/Madrid');
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(1);
    expect(parts.day).toBe(15);
    expect(parts.hour).toBe(11);
    expect(parts.minute).toBe(0);
  });
});

describe('Weekly events', () => {
  it('should generate weekly occurrences', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 5, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    // Should have ~52 Mondays in 2026
    expect(occurrences.length).toBeGreaterThanOrEqual(50);
    expect(occurrences.length).toBeLessThanOrEqual(55);
    
    // All should be Mondays at 10:00 Madrid time
    for (const occ of occurrences) {
      const parts = dateToParts(occ.start, 'Europe/Madrid');
      const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      expect(dayOfWeek).toBe(1); // Monday
      expect(parts.hour).toBe(10);
    }
  });

  it('should handle weekly event crossing DST change in October (Europe/Madrid)', () => {
    // DST change in Europe/Madrid 2026: October 25 (last Sunday)
    // Clocks go back from 3:00 to 2:00
    const start = partsToDate({
      year: 2026, month: 10, day: 1, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=WEEKLY;BYDAY=TH',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 11, day: 30, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    // Thursdays in October 2026: 1, 8, 15, 22, 29
    // Thursdays in November: 5, 12, 19, 26
    expect(occurrences.length).toBe(9);
    
    // Check that all occurrences are at 10:00 local time
    for (const occ of occurrences) {
      const parts = dateToParts(occ.start, 'Europe/Madrid');
      expect(parts.hour).toBe(10);
      expect(parts.minute).toBe(0);
    }
    
    // Verify the DST transition week specifically
    // Oct 22 (before DST) and Oct 29 (after DST) should both be 10:00 local
    const oct22 = occurrences.find(o => {
      const p = dateToParts(o.start, 'Europe/Madrid');
      return p.day === 22 && p.month === 10;
    });
    const oct29 = occurrences.find(o => {
      const p = dateToParts(o.start, 'Europe/Madrid');
      return p.day === 29 && p.month === 10;
    });
    
    expect(oct22).toBeDefined();
    expect(oct29).toBeDefined();
    
    // Both should be 10:00 local, but different UTC offsets
    const parts22 = dateToParts(oct22!.start, 'Europe/Madrid');
    const parts29 = dateToParts(oct29!.start, 'Europe/Madrid');
    
    expect(parts22.hour).toBe(10);
    expect(parts29.hour).toBe(10);
    
    // Oct 22 is CEST (UTC+2), Oct 29 is CET (UTC+1)
    // So Oct 22 at 10:00 local = 08:00 UTC
    // Oct 29 at 10:00 local = 09:00 UTC
    expect(oct22!.start.getUTCHours()).toBe(8);
    expect(oct29!.start.getUTCHours()).toBe(9);
  });

  it('should handle weekly event crossing spring DST change', () => {
    // DST change in Europe/Madrid 2026: March 29 (last Sunday)
    // Clocks go forward from 2:00 to 3:00
    const start = partsToDate({
      year: 2026, month: 3, day: 1, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 4, day: 30, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    // Sundays in March: 1, 8, 15, 22, 29
    // Sundays in April: 5, 12, 19, 26
    expect(occurrences.length).toBe(9);
    
    // All should be 10:00 local
    for (const occ of occurrences) {
      const parts = dateToParts(occ.start, 'Europe/Madrid');
      expect(parts.hour).toBe(10);
    }
    
    // Mar 22 (CET, UTC+1): 10:00 local = 09:00 UTC
    // Mar 29 (CEST, UTC+2): 10:00 local = 08:00 UTC
    const mar22 = occurrences.find(o => {
      const p = dateToParts(o.start, 'Europe/Madrid');
      return p.day === 22 && p.month === 3;
    });
    const mar29 = occurrences.find(o => {
      const p = dateToParts(o.start, 'Europe/Madrid');
      return p.day === 29 && p.month === 3;
    });
    
    expect(mar22).toBeDefined();
    expect(mar29).toBeDefined();
    expect(mar22!.start.getUTCHours()).toBe(9);
    expect(mar29!.start.getUTCHours()).toBe(8);
  });
});

describe('Monthly events', () => {
  it('should generate monthly occurrences', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 15, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=MONTHLY',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(12);
    
    // All should be on the 15th at 10:00
    for (const occ of occurrences) {
      const parts = dateToParts(occ.start, 'Europe/Madrid');
      expect(parts.day).toBe(15);
      expect(parts.hour).toBe(10);
    }
  });

  it('should handle months without day 31', () => {
    // Start on 31st
    const start = partsToDate({
      year: 2026, month: 1, day: 31, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=MONTHLY',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(12);
    
    // Check each month
    const expectedDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 2026
    for (let i = 0; i < 12; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(i + 1);
      expect(parts.day).toBe(expectedDays[i]);
      expect(parts.hour).toBe(10);
    }
  });

  it('should handle last Friday of month (-1FR)', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 30, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=MONTHLY;BYDAY=-1FR',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    // Last Fridays of 2026:
    // Jan 30, Feb 27, Mar 27, Apr 24, May 29, Jun 26,
    // Jul 31, Aug 28, Sep 25, Oct 30, Nov 27, Dec 25
    expect(occurrences.length).toBe(12);
    
    const expectedDays = [30, 27, 27, 24, 29, 26, 31, 28, 25, 30, 27, 25];
    
    for (let i = 0; i < 12; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(i + 1);
      expect(parts.day).toBe(expectedDays[i]);
      expect(parts.hour).toBe(10);
      
      // Verify it's actually a Friday
      const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      expect(dayOfWeek).toBe(5); // Friday
    }
  });

  it('should handle 2nd Tuesday of month (2TU)', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 13, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=MONTHLY;BYDAY=2TU',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    // 2nd Tuesdays of 2026:
    // Jan 13, Feb 10, Mar 10, Apr 14, May 12, Jun 9,
    // Jul 14, Aug 11, Sep 8, Oct 13, Nov 10, Dec 8
    expect(occurrences.length).toBe(12);
    
    const expectedDays = [13, 10, 10, 14, 12, 9, 14, 11, 8, 13, 10, 8];
    
    for (let i = 0; i < 12; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(i + 1);
      expect(parts.day).toBe(expectedDays[i]);
      expect(parts.hour).toBe(10);
      
      // Verify it's actually a Tuesday
      const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      expect(dayOfWeek).toBe(2); // Tuesday
    }
  });
});

describe('COUNT and UNTIL', () => {
  it('should limit by COUNT', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 1, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=DAILY;COUNT=5',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(5);
    
    // Should be Jan 1-5
    for (let i = 0; i < 5; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(1);
      expect(parts.day).toBe(i + 1);
    }
  });

  it('should limit by UNTIL', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 1, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=DAILY;UNTIL=20260105',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(5);
    
    // Should be Jan 1-5
    for (let i = 0; i < 5; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(1);
      expect(parts.day).toBe(i + 1);
    }
  });

  it('should combine COUNT with BYDAY', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 1, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(10);
    
    // Should be Mon, Wed, Fri pattern
    const expectedDays = [
      { month: 1, day: 2 },  // Fri (Jan 1 is Thu, so first is Fri Jan 2)
      { month: 1, day: 5 },  // Mon
      { month: 1, day: 7 },  // Wed
      { month: 1, day: 9 },  // Fri
      { month: 1, day: 12 }, // Mon
      { month: 1, day: 14 }, // Wed
      { month: 1, day: 16 }, // Fri
      { month: 1, day: 19 }, // Mon
      { month: 1, day: 21 }, // Wed
      { month: 1, day: 23 }, // Fri
    ];
    
    for (let i = 0; i < 10; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(expectedDays[i].month);
      expect(parts.day).toBe(expectedDays[i].day);
      expect(parts.hour).toBe(10);
    }
  });

  it('should combine COUNT with BYDAY for monthly', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 5, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=MONTHLY;BYDAY=1MO;COUNT=3',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(3);
    
    // 1st Mondays: Jan 5, Feb 2, Mar 2
    const expectedDays = [5, 2, 2];
    const expectedMonths = [1, 2, 3];
    
    for (let i = 0; i < 3; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(expectedMonths[i]);
      expect(parts.day).toBe(expectedDays[i]);
      expect(parts.hour).toBe(10);
      
      // Verify it's Monday
      const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      expect(dayOfWeek).toBe(1);
    }
  });
});

describe('Range filtering', () => {
  it('should only return occurrences within range', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 1, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const rangeStart = partsToDate({
      year: 2026, month: 3, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const rangeEnd = partsToDate({
      year: 2026, month: 3, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      timeZone: 'Europe/Madrid',
      rangeStart,
      rangeEnd,
    });
    
    // Mondays in March 2026: 2, 9, 16, 23, 30
    expect(occurrences.length).toBe(5);
    
    for (const occ of occurrences) {
      const parts = dateToParts(occ.start, 'Europe/Madrid');
      expect(parts.month).toBe(3);
      const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      expect(dayOfWeek).toBe(1);
    }
  });
});

describe('Daily events', () => {
  it('should generate daily occurrences', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 1, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=DAILY;COUNT=7',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(7);
    
    for (let i = 0; i < 7; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(1);
      expect(parts.day).toBe(i + 1);
      expect(parts.hour).toBe(10);
    }
  });

  it('should generate daily occurrences with interval', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 1, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=DAILY;INTERVAL=3;COUNT=5',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(5);
    
    // Jan 1, 4, 7, 10, 13
    const expectedDays = [1, 4, 7, 10, 13];
    for (let i = 0; i < 5; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(1);
      expect(parts.day).toBe(expectedDays[i]);
    }
  });
});

describe('Edge cases', () => {
  it('should handle February 29 in leap year', () => {
    const start = partsToDate({
      year: 2028, month: 1, day: 29, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=MONTHLY;COUNT=3',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2028, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(3);
    
    // Jan 29, Feb 29, Mar 29
    const expectedDays = [29, 29, 29];
    const expectedMonths = [1, 2, 3];
    
    for (let i = 0; i < 3; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(expectedMonths[i]);
      expect(parts.day).toBe(expectedDays[i]);
    }
  });

  it('should handle Feb 29 in non-leap year (clamped to 28)', () => {
    const start = partsToDate({
      year: 2026, month: 1, day: 29, hour: 10, minute: 0, second: 0, millisecond: 0,
    }, 'Europe/Madrid');
    
    const occurrences = expandOccurrences({
      startDate: start,
      rrule: 'FREQ=MONTHLY;COUNT=3',
      timeZone: 'Europe/Madrid',
      rangeStart: new Date(0),
      rangeEnd: partsToDate({
        year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999,
      }, 'Europe/Madrid'),
    });
    
    expect(occurrences.length).toBe(3);
    
    // Jan 29, Feb 28, Mar 29
    const expectedDays = [29, 28, 29];
    const expectedMonths = [1, 2, 3];
    
    for (let i = 0; i < 3; i++) {
      const parts = dateToParts(occurrences[i].start, 'Europe/Madrid');
      expect(parts.month).toBe(expectedMonths[i]);
      expect(parts.day).toBe(expectedDays[i]);
    }
  });
});
