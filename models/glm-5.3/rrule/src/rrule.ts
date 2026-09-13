import type { ByDayToken, Freq, Rule, Weekday } from './types.js';

const FREQS: readonly Freq[] = ['DAILY', 'WEEKLY', 'MONTHLY'];
const BYDAY_TOKEN_RE = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/;
const ICAL_UNTIL_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;
const INSTANT_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

type NormalizedRule = Omit<Rule, 'until'> & { until?: Date };

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

function parseFreq(value: string): Freq {
  const v = value.toUpperCase();
  if ((FREQS as readonly string[]).includes(v)) {
    return v as Freq;
  }
  throw new RuleError(`FREQ no válido: "${value}" (soportados: DAILY, WEEKLY, MONTHLY)`);
}

function parsePositiveInt(key: string, value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new RuleError(`${key} debe ser un entero ≥ 1: "${value}"`);
  }
  const n = Number(value);
  if (n < 1) {
    throw new RuleError(`${key} debe ser un entero ≥ 1: "${value}"`);
  }
  return n;
}

export function parseUntil(value: string): Date {
  const s = value.trim();
  const ical = ICAL_UNTIL_RE.exec(s);
  if (ical) {
    return new Date(
      Date.UTC(
        Number(ical[1]),
        Number(ical[2]) - 1,
        Number(ical[3]),
        Number(ical[4]),
        Number(ical[5]),
        Number(ical[6])
      )
    );
  }
  if (!INSTANT_SUFFIX_RE.test(s)) {
    throw new RuleError(`UNTIL debe ser un instante con zona explícita (Z u offset): "${value}"`);
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) {
    throw new RuleError(`UNTIL no es una fecha válida: "${value}"`);
  }
  return new Date(t);
}

function parseByDay(value: string): ByDayToken[] {
  const tokens: ByDayToken[] = [];
  for (const raw of value.split(',')) {
    const token = raw.trim().toUpperCase();
    if (token === '') {
      throw new RuleError(`BYDAY contiene un token vacío: "${value}"`);
    }
    const m = BYDAY_TOKEN_RE.exec(token);
    if (!m) {
      throw new RuleError(`Token BYDAY no válido: "${raw}"`);
    }
    const day = m[2]! as Weekday;
    if (m[1] === undefined) {
      tokens.push({ day });
    } else {
      const ord = Number(m[1]);
      if (ord === 0) {
        throw new RuleError(`El ordinal de BYDAY no puede ser 0: "${raw}"`);
      }
      if (Math.abs(ord) > 53) {
        throw new RuleError(`Ordinal de BYDAY fuera de rango (1-53): "${raw}"`);
      }
      tokens.push({ ord, day });
    }
  }
  return tokens;
}

function validateRule(rule: NormalizedRule): NormalizedRule {
  if (!FREQS.includes(rule.freq)) {
    throw new RuleError(`FREQ no válido: ${String(rule.freq)} (soportados: DAILY, WEEKLY, MONTHLY)`);
  }
  if (rule.interval !== undefined && (!Number.isInteger(rule.interval) || rule.interval < 1)) {
    throw new RuleError(`INTERVAL debe ser un entero ≥ 1: ${String(rule.interval)}`);
  }
  if (rule.count !== undefined && (!Number.isInteger(rule.count) || rule.count < 1)) {
    throw new RuleError(`COUNT debe ser un entero ≥ 1: ${String(rule.count)}`);
  }
  if (rule.count !== undefined && rule.until !== undefined) {
    throw new RuleError('COUNT y UNTIL son mutuamente excluyentes');
  }
  if (rule.until !== undefined && Number.isNaN(rule.until.getTime())) {
    throw new RuleError('UNTIL no es una fecha válida');
  }
  if (rule.byDay !== undefined) {
    if (rule.byDay.length === 0) {
      throw new RuleError('BYDAY no puede estar vacío');
    }
    if (rule.freq === 'DAILY') {
      throw new RuleError('BYDAY no está soportado con FREQ=DAILY en este subconjunto');
    }
    for (const token of rule.byDay) {
      if (token.ord !== undefined && rule.freq !== 'MONTHLY') {
        throw new RuleError('Los ordinales de BYDAY (p. ej. 2TU, -1FR) solo están permitidos con FREQ=MONTHLY');
      }
    }
  }
  return rule;
}

export function parseRule(input: string): Rule {
  let s = input.trim();
  if (s.toUpperCase().startsWith('RRULE:')) {
    s = s.slice(6).trim();
  }
  if (s === '') {
    throw new RuleError('Regla vacía');
  }
  let freq: Freq | undefined;
  let interval: number | undefined;
  let byDay: ByDayToken[] | undefined;
  let count: number | undefined;
  let until: Date | undefined;
  const seen = new Set<string>();
  for (const part of s.split(';')) {
    const trimmed = part.trim();
    if (trimmed === '') {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq < 0) {
      throw new RuleError(`Parte de regla sin "=": "${trimmed}"`);
    }
    const key = trimmed.slice(0, eq).trim().toUpperCase();
    const value = trimmed.slice(eq + 1).trim();
    if (seen.has(key)) {
      throw new RuleError(`Clave duplicada: ${key}`);
    }
    seen.add(key);
    if (key === 'FREQ') {
      freq = parseFreq(value);
    } else if (key === 'INTERVAL') {
      interval = parsePositiveInt(key, value);
    } else if (key === 'COUNT') {
      count = parsePositiveInt(key, value);
    } else if (key === 'BYDAY') {
      byDay = parseByDay(value);
    } else if (key === 'UNTIL') {
      until = parseUntil(value);
    } else {
      throw new RuleError(`Clave no soportada: ${key}`);
    }
  }
  if (freq === undefined) {
    throw new RuleError('FREQ es obligatorio');
  }
  const rule: NormalizedRule = {
    freq,
    ...(interval !== undefined ? { interval } : {}),
    ...(byDay !== undefined ? { byDay } : {}),
    ...(count !== undefined ? { count } : {}),
    ...(until !== undefined ? { until } : {}),
  };
  return validateRule(rule);
}

export function normalizeRule(input: Rule | string): Rule {
  if (typeof input === 'string') {
    return parseRule(input);
  }
  const { until, ...rest } = input;
  const rule: NormalizedRule = {
    ...rest,
    ...(until !== undefined
      ? { until: typeof until === 'string' ? parseUntil(until) : until }
      : {}),
  };
  return validateRule(rule);
}
