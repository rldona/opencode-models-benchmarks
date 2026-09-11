import { RRule, ByDayToken } from './types.js';

export function parseRRule(ruleString: string): RRule {
  const parts = ruleString.split(';');
  const rule: Partial<RRule> = { interval: 1 };

  for (const part of parts) {
    const [key, value] = part.split('=');
    
    switch (key) {
      case 'FREQ':
        rule.freq = value as RRule['freq'];
        break;
      case 'INTERVAL':
        rule.interval = parseInt(value, 10);
        break;
      case 'BYDAY':
        rule.byday = value.split(',').map(parseByDayToken);
        break;
      case 'COUNT':
        rule.count = parseInt(value, 10);
        break;
      case 'UNTIL':
        rule.until = new Date(value);
        break;
    }
  }

  if (!rule.freq) {
    throw new Error('FREQ is required in RRULE');
  }

  return rule as RRule;
}

function parseByDayToken(token: string): ByDayToken {
  const match = token.match(/^(-?\d+)?([A-Z]+)$/);
  if (!match) {
    throw new Error(`Invalid BYDAY token: ${token}`);
  }
  
  const [, ordinal, day] = match;
  return {
    ordinal: ordinal ? parseInt(ordinal, 10) : undefined,
    day,
  };
}
