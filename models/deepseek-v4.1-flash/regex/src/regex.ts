import { parsePattern, type ParsedPattern } from './parser.js';
import { buildProgram, type Program } from './compiler.js';
import { Backtracker, type MatchCore } from './backtracker.js';
import { NfaStream } from './nfa.js';
import { advanceIndex } from './chars.js';
import type { Match, Regex, RegexStream } from './types.js';

export { advanceIndex };

export function toLength(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return 0;
  if (!Number.isFinite(n)) return Number.MAX_SAFE_INTEGER;
  return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

export class RegexImpl<P extends string = string> implements Regex<P> {
  readonly source: string;
  readonly flags: string;
  lastIndex = 0;
  readonly parsed: ParsedPattern;
  readonly program: Program;
  readonly backtracker: Backtracker;

  constructor(pattern: string, flags?: string) {
    this.parsed = parsePattern(pattern, flags);
    this.program = buildProgram(this.parsed);
    this.backtracker = new Backtracker(this.program);
    this.source = pattern;
    this.flags = this.parsed.flags;
  }

  exec(input: string): Match<P> | null {
    const { global: isGlobal, sticky } = this.parsed;
    let start = 0;
    if (isGlobal || sticky) {
      start = toLength(this.lastIndex);
      if (start > input.length) {
        this.lastIndex = 0;
        return null;
      }
    }
    const core = sticky ? this.backtracker.matchAt(input, start) : this.backtracker.search(input, start);
    if (core === null) {
      if (isGlobal || sticky) this.lastIndex = 0;
      return null;
    }
    if (isGlobal || sticky) this.lastIndex = core.end;
    return this.makeMatch(input, core);
  }

  makeMatch(input: string, core: MatchCore, indexOffset = 0): Match<P> {
    const { groupCount } = this.program;
    const captures: (string | undefined)[] = new Array(groupCount + 1);
    captures[0] = input.slice(core.start, core.end);
    for (let g = 1; g <= groupCount; g++) {
      const from = core.captures[2 * g];
      const to = core.captures[2 * g + 1];
      captures[g] = from === undefined || to === undefined ? undefined : input.slice(from, to);
    }
    const groups: Record<string, string | undefined> = {};
    for (const [name, index] of this.program.groupNames) {
      groups[name] = captures[index];
    }
    return {
      index: core.start + indexOffset,
      captures: captures as unknown as Match<P>['captures'],
      groups: groups as Match<P>['groups'],
    };
  }

  stream(): RegexStream<P> {
    if (
      !this.program.hasBackrefs &&
      !this.program.hasLookahead &&
      !this.parsed.sticky &&
      this.program.loopCount <= 30
    ) {
      return new NfaStream<P>(this);
    }
    return new BufferedStream<P>(this, this.parsed);
  }

  captureAt(input: string, start: number): MatchCore | null {
    return this.backtracker.matchAt(input, start);
  }
}

/**
 * Temporary streaming implementation: buffers the whole input and computes
 * matches lazily at `end()`. Replaced by the incremental NFA engine below.
 */
class BufferedStream<P extends string> implements RegexStream<P> {
  private chunks: string[] = [];

  constructor(
    private readonly regex: RegexImpl<P>,
    private readonly parsed: ParsedPattern,
  ) {}

  feed(chunk: string): Match<P>[] {
    this.chunks.push(chunk);
    return [];
  }

  end(): Match<P>[] {
    const text = this.chunks.join('');
    const out: Match<P>[] = [];
    let pos = 0;
    while (pos <= text.length) {
      const attempt = this.parsed.sticky
        ? this.regex.backtracker.matchAt(text, pos)
        : this.regex.backtracker.search(text, pos);
      if (attempt === null) break;
      out.push(this.regex.makeMatch(text, attempt));
      if (attempt.end > attempt.start) {
        pos = attempt.end;
      } else {
        pos = advanceIndex(text, attempt.start, this.parsed.unicode);
      }
    }
    return out;
  }
}

export function compile<P extends string = string>(pattern: P, flags?: string): Regex<P> & Regex {
  return new RegexImpl<P>(pattern, flags) as unknown as Regex<P> & Regex;
}
