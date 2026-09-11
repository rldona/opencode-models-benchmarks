export type RRuleErrorCode =
  | 'INPUT'
  | 'PARSE'
  | 'UNSUPPORTED'
  | 'CONFLICT'
  | 'RANGE'
  | 'TIMEZONE'
  | 'LIMIT';

export class RRuleError extends Error {
  readonly code: RRuleErrorCode;

  constructor(message: string, code: RRuleErrorCode) {
    super(message);
    this.name = 'RRuleError';
    this.code = code;
  }
}
