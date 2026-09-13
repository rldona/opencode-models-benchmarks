import { Op, type AssertKind, type Program } from './compiler.js';
import { advanceIndex } from './chars.js';
import {
  charLengthAt,
  codePointAt,
  isLineTerminator,
  isWordCharAt,
  isWordCharBefore,
  type CharMatcher,
} from './chars.js';
import type { MatchCore } from './backtracker.js';
import type { Match } from './types.js';

interface Thread {
  pc: number;
  mask: number;
  start: number;
}

interface Carried {
  pos: number;
  threads: Thread[];
}

export interface StreamHost<P extends string> {
  readonly program: Program;
  makeMatch(input: string, core: MatchCore, indexOffset?: number): Match<P>;
  captureAt(input: string, start: number): MatchCore | null;
}

export class NfaStream<P extends string> {
  private buffer = '';
  private bufferStart = 0;
  private scanPos = 0;
  private searchStart = 0;
  private eos = false;

  private pending: Thread[] = [];
  private visited = new Set<number>();
  private visitedArr: Uint32Array | null = null;
  private visitedGen = 1;
  private maskCount = 1;
  private consumers: Thread[] = [];
  private paused: Thread | null = null;
  private bestMatch: { start: number; end: number } | null = null;
  private seeded = false;
  private startInjected = false;
  private carried: Carried | null = null;
  private advancePending: number | null = null;

  constructor(private readonly host: StreamHost<P>) {
    const loops = host.program.loopCount;
    if (loops <= 10 && host.program.instructions.length * (1 << loops) <= 1 << 16) {
      this.maskCount = 1 << loops;
      this.visitedArr = new Uint32Array(host.program.instructions.length * this.maskCount);
    }
  }

  private seen(pc: number, mask: number): boolean {
    if (this.visitedArr !== null) {
      const slot = pc * this.maskCount + mask;
      if (this.visitedArr[slot] === this.visitedGen) return true;
      this.visitedArr[slot] = this.visitedGen;
      return false;
    }
    const key = pc * 0x40000000 + mask;
    if (this.visited.has(key)) return true;
    this.visited.add(key);
    return false;
  }

  private newGeneration(): void {
    if (this.visitedArr !== null) {
      this.visitedGen++;
      if (this.visitedGen > 0xffffffff) {
        this.visitedArr.fill(0);
        this.visitedGen = 1;
      }
    } else {
      this.visited.clear();
    }
  }

  private get program(): Program {
    return this.host.program;
  }

  feed(chunk: string): Match<P>[] {
    if (chunk.length > 0) this.buffer += chunk;
    return this.run();
  }

  end(): Match<P>[] {
    this.eos = true;
    return this.run();
  }

  private textEnd(): number {
    let length = this.buffer.length;
    if (!this.eos && this.program.unicode && length > 0) {
      const last = this.buffer.charCodeAt(length - 1);
      if (last >= 0xd800 && last <= 0xdbff) length -= 1;
    }
    return this.bufferStart + length;
  }

  private bit(loopId: number): number {
    return 1 << loopId;
  }

  private beginClosure(freshCarried: Thread[] | null, textEnd = this.textEnd()): void {
    this.pending.length = 0;
    this.newGeneration();
    this.consumers.length = 0;
    this.paused = null;
    this.startInjected = false;
    if (this.bestMatch === null && this.scanPos >= this.searchStart && this.scanPos <= textEnd) {
      this.pending.push({ pc: this.program.entry, mask: 0, start: this.scanPos });
      this.startInjected = true;
    }
    if (freshCarried !== null) {
      for (let i = freshCarried.length - 1; i >= 0; i--) {
        this.pending.push(freshCarried[i]!);
      }
    } else if (this.carried !== null) {
      if (this.carried.pos === this.scanPos) {
        const threads = this.carried.threads;
        this.carried = null;
        for (let i = threads.length - 1; i >= 0; i--) {
          this.pending.push(threads[i]!);
        }
      } else if (this.carried.pos < this.scanPos) {
        this.carried = null;
      }
    }
    this.seeded = true;
  }

  private expand(t: Thread): 'ok' | 'paused' {
    if (t.pc < 0) return 'ok';
    if (this.seen(t.pc, t.mask)) return 'ok';
    const ins = this.program.instructions[t.pc]!;
    switch (ins.op) {
      case Op.Char:
        this.consumers.push(t);
        return 'ok';
      case Op.Split:
        this.pending.push({ pc: ins.b, mask: t.mask, start: t.start });
        this.pending.push({ pc: ins.a, mask: t.mask, start: t.start });
        return 'ok';
      case Op.Jmp:
        this.pending.push({ pc: ins.a, mask: t.mask, start: t.start });
        return 'ok';
      case Op.Save:
      case Op.Clear:
        this.pending.push({ pc: t.pc + 1, mask: t.mask, start: t.start });
        return 'ok';
      case Op.SetReg:
        this.pending.push({ pc: t.pc + 1, mask: t.mask | this.bit(ins.loopId), start: t.start });
        return 'ok';
      case Op.EmptyCheck:
        if ((t.mask & this.bit(ins.loopId)) === 0) {
          this.pending.push({ pc: t.pc + 1, mask: t.mask, start: t.start });
        }
        return 'ok';
      case Op.Loop: {
        const b = this.bit(ins.loopId);
        if (ins.greedy) {
          this.pending.push({ pc: ins.b, mask: t.mask, start: t.start });
          this.pending.push({ pc: ins.a, mask: t.mask | b, start: t.start });
        } else {
          this.pending.push({ pc: ins.a, mask: t.mask | b, start: t.start });
          this.pending.push({ pc: ins.b, mask: t.mask, start: t.start });
        }
        return 'ok';
      }
      case Op.LoopBack:
        if ((t.mask & this.bit(ins.loopId)) === 0) {
          this.pending.push({ pc: ins.a, mask: t.mask, start: t.start });
        }
        return 'ok';
      case Op.Assert: {
        const result = this.evaluateAssert(ins.assertKind!);
        if (result === 'paused') {
          this.paused = t;
          return 'paused';
        }
        if (result === true) {
          this.pending.push({ pc: t.pc + 1, mask: t.mask, start: t.start });
        }
        return 'ok';
      }
      case Op.Match:
        this.bestMatch = { start: t.start, end: this.scanPos };
        this.pending.length = 0;
        this.paused = null;
        return 'ok';
      default:
        return 'ok';
    }
  }

  private evaluateAssert(kind: AssertKind): boolean | 'paused' {
    const abs = this.scanPos;
    const textEnd = this.textEnd();
    const rel = abs - this.bufferStart;
    const { multiline, unicode, ignoreCase } = this.program;
    switch (kind) {
      case 'bol':
        if (abs === 0) return true;
        if (!multiline) return false;
        return isLineTerminator(this.charAt(abs - 1, unicode));
      case 'eol': {
        if (abs === textEnd) {
          if (this.eos) return true;
          return 'paused';
        }
        if (abs > textEnd) return 'paused';
        if (!multiline) return false;
        return isLineTerminator(this.charAt(abs, unicode));
      }
      case 'wb':
      case 'nwb': {
        if (abs > textEnd) return 'paused';
        if (abs === textEnd && !this.eos) return 'paused';
        const before = isWordCharBefore(this.buffer, rel, unicode, ignoreCase);
        const after = isWordCharAt(this.buffer, rel, unicode, ignoreCase);
        const boundary = before !== after;
        return kind === 'wb' ? boundary : !boundary;
      }
      default:
        return false;
    }
  }

  private charAt(abs: number, unicode: boolean): number {
    const rel = abs - this.bufferStart;
    if (rel < 0 || rel >= this.buffer.length) return -1;
    return unicode ? codePointAt(this.buffer, rel) : this.buffer.charCodeAt(rel);
  }

  private resolvePaused(): void {
    const t = this.paused!;
    this.paused = null;
    const ins = this.program.instructions[t.pc]!;
    const result = this.evaluateAssert(ins.assertKind!);
    if (result === true) {
      this.pending.push({ pc: t.pc + 1, mask: t.mask, start: t.start });
    }
  }

  private pump(charKnown: boolean): 'complete' | 'paused' {
    while (true) {
      if (this.paused !== null) {
        if (!charKnown) return 'paused';
        this.resolvePaused();
        continue;
      }
      const t = this.pending.pop();
      if (t === undefined) return 'complete';
      if (this.expand(t) === 'paused' && !charKnown) return 'paused';
    }
  }

  /** Consumes the character at `scanPos`, advancing positions by one UTF-16 unit. */
  private consume(): void {
    const rel = this.scanPos - this.bufferStart;
    const { unicode } = this.program;
    const len = unicode ? charLengthAt(this.buffer, rel) : 1;
    const next: Thread[] = [];
    for (const t of this.consumers) {
      const ins = this.program.instructions[t.pc]!;
      const matcher = ins.matcher as CharMatcher;
      if (matcher(this.buffer, rel) >= 0) {
        next.push({ pc: t.pc + 1, mask: 0, start: t.start });
      }
    }
    const target = this.scanPos + len;
    if (this.carried !== null && this.carried.pos === target) {
      for (const t of next) this.carried.threads.push(t);
    } else {
      this.carried = { pos: target, threads: next };
    }
    this.scanPos += 1;
    this.seeded = false;
  }

  private resetAfterMatch(): void {
    this.bestMatch = null;
    this.consumers.length = 0;
    this.pending.length = 0;
    this.paused = null;
    this.seeded = false;
    this.startInjected = false;
    this.carried = null;
  }

  private run(): Match<P>[] {
    const out: Match<P>[] = [];
    while (true) {
      if (this.advancePending !== null) {
        const p = this.advancePending;
        const rel = p - this.bufferStart;
        if (!this.eos && rel >= this.buffer.length) break;
        const cu = this.buffer.charCodeAt(rel);
        const isHigh = cu >= 0xd800 && cu <= 0xdbff;
        if (!this.eos && isHigh && rel + 1 >= this.buffer.length) break;
        this.searchStart = advanceIndex(this.buffer, rel, this.program.unicode) + this.bufferStart;
        this.scanPos = this.searchStart;
        this.advancePending = null;
        this.seeded = false;
      }
      const textEnd = this.textEnd();
      if (!this.seeded) this.beginClosure(null, textEnd);
      else if (
        !this.startInjected &&
        this.bestMatch === null &&
        this.scanPos >= this.searchStart &&
        this.scanPos <= textEnd
      ) {
        this.pending.unshift({ pc: this.program.entry, mask: 0, start: this.scanPos });
        this.startInjected = true;
      }
      const charKnown = this.eos || this.scanPos < textEnd;
      const status = this.pump(charKnown);
      if (status === 'paused') break;

      if (this.consumers.length === 0 && this.paused === null) {
        if (this.bestMatch !== null && this.carried === null) {
          out.push(this.finalize());
          continue;
        }
        if (this.scanPos >= textEnd) break;
        if (this.bestMatch === null) this.searchStart = this.scanPos + 1;
        this.scanPos = this.scanPos + 1;
        this.seeded = false;
        continue;
      }
      if (this.scanPos >= textEnd) {
        if (this.eos) {
          this.consumers = [];
          continue;
        }
        break;
      }
      this.consume();
    }
    this.compact();
    return out;
  }

  private finalize(): Match<P> {
    const match = this.bestMatch!;
    const relStart = match.start - this.bufferStart;
    const relEnd = match.end - this.bufferStart;
    let captures: (number | undefined)[] = [];
    if (this.program.groupCount > 0) {
      const core = this.host.captureAt(this.buffer, relStart);
      if (core !== null) captures = core.captures;
    }
    const result = this.host.makeMatch(
      this.buffer,
      { start: relStart, end: relEnd, captures },
      this.bufferStart,
    );
    if (match.end > match.start) {
      this.searchStart = match.end;
      this.scanPos = this.searchStart;
      this.advancePending = null;
    } else {
      this.searchStart = match.start;
      this.scanPos = match.start;
      this.advancePending = match.start;
    }
    this.resetAfterMatch();
    this.compact();
    return result;
  }

  private compact(): void {
    const keepAbs = Math.max(this.bufferStart, this.searchStart - 2);
    if (keepAbs > this.bufferStart) {
      this.buffer = this.buffer.slice(keepAbs - this.bufferStart);
      this.bufferStart = keepAbs;
    }
  }
}
