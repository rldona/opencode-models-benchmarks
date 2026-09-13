const localFormatters = new Map<string, Intl.DateTimeFormat>();

function localFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = localFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    localFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export function local(date: Date, timeZone: string): string {
  const parts = localFormatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function localAll(dates: Date[], timeZone: string): string[] {
  return dates.map((d) => local(d, timeZone));
}

export function isoAll(dates: Date[]): string[] {
  return dates.map((d) => d.toISOString());
}
