import { Op, type Program } from './compiler.js';
import { canonicalize, charLengthAt, codePointAt, isWordCharAt, isWordCharBefore } from './chars.js';

export interface MatchCore {
  start: number;
  end: number;
  captures: (number | undefined)[];
}

interface ChoicePoint {
  kind: 0 | 1;
  pc: number;
  pos: number;
  undoLen: number;
  loopId: number;
  clearFrom: number;
  clearTo: number;
}

const MEMO_LIMIT = 24_000_000;

class Memo {
  private readonly stamp: Int32Array | null;
  private readonly failedSet: Set<number> | null;
  private readonly activeSet: Set<number> | null;
  private readonly keyShift: number;

  constructor(numPcs: number, inputLength: number) {
    this.keyShift = inputLength + 1;
    const size = numPcs * this.keyShift;
    if (size > 0 && size <= MEMO_LIMIT) {
      this.stamp = new Int32Array(size);
      this.failedSet = null;
      this.activeSet = null;
    } else {
      this.stamp = null;
      this.failedSet = new Set<number>();
      this.activeSet = new Set<number>();
    }
  }

  key(pc: number, pos: number): number {
    return pc * this.keyShift + pos;
  }

  isActive(key: number): boolean {
    if (this.stamp !== null) return this.stamp[key] === 1;
    return this.activeSet!.has(key);
  }

  isFailed(key: number): boolean {
    if (this.stamp !== null) return this.stamp[key] === -1;
    return this.failedSet!.has(key);
  }

  enter(key: number): void {
    if (this.stamp !== null) this.stamp[key] = 1;
    else this.activeSet!.add(key);
  }

  markFailed(key: number): void {
    if (this.stamp !== null) this.stamp[key] = -1;
    else {
      this.failedSet!.add(key);
      this.activeSet!.delete(key);
    }
  }
}

export class Backtracker {
  readonly program: Program;

  constructor(program: Program) {
    this.program = program;
  }

  private executeAnchored(
    program: Program,
    input: string,
    startPos: number,
    captures: (number | undefined)[],
    memo: Memo | null,
  ): number {
    const instructions = program.instructions;
    const regs: number[] = [];
    const undoSlots: number[] = [];
    const undoVals: (number | undefined)[] = [];
    const stack: ChoicePoint[] = [];
    const buckets: number[][] = [];
    const memoizable = memo !== null ? program.memoizable : null;

    let pc = program.entry;
    let pos = startPos;

    const logSet = (slot: number, value: number | undefined): void => {
      undoSlots.push(slot);
      undoVals.push(captures[slot]);
      captures[slot] = value;
    };

    const clearRange = (from: number, to: number): void => {
      for (let slot = from; slot < to; slot++) logSet(slot, undefined);
    };

    const markBucket = (depth: number): void => {
      if (memo === null) return;
      const bucket = buckets[depth];
      if (bucket === undefined) return;
      for (const key of bucket) memo.markFailed(key);
      bucket.length = 0;
    };

    while (true) {
      let failed = false;
      while (!failed) {
        if (memoizable !== null && memoizable[pc]! && memo !== null) {
          const key = memo.key(pc, pos);
          if (memo.isFailed(key)) {
            failed = true;
            break;
          }
          if (memo.isActive(key)) {
            failed = true;
            break;
          }
          memo.enter(key);
          const depth = stack.length;
          while (buckets.length <= depth) buckets.push([]);
          buckets[depth]!.push(key);
        }
        const ins = instructions[pc]!;
        switch (ins.op) {
          case Op.Char: {
            const next = ins.matcher!(input, pos);
            if (next < 0) failed = true;
            else {
              pos = next;
              pc++;
            }
            break;
          }
          case Op.Split: {
            stack.push({
              kind: 0,
              pc: ins.b,
              pos,
              undoLen: undoSlots.length,
              loopId: -1,
              clearFrom: -1,
              clearTo: -1,
            });
            pc = ins.a;
            break;
          }
          case Op.Jmp:
            pc = ins.a;
            break;
          case Op.Save:
            logSet(ins.a, pos);
            pc++;
            break;
          case Op.Clear:
            clearRange(ins.clearFrom, ins.clearTo);
            pc++;
            break;
          case Op.Assert: {
            if (this.testAssert(ins.assertKind!, input, pos, program)) pc++;
            else failed = true;
            break;
          }
          case Op.Backref: {
            const g = ins.a;
            const from = captures[2 * g];
            const to = captures[2 * g + 1];
            if (from === undefined || to === undefined) {
              pc++;
            } else {
              const next = this.matchBackref(input, pos, from, to, program);
              if (next < 0) failed = true;
              else {
                pos = next;
                pc++;
              }
            }
            break;
          }
          case Op.Lookahead: {
            const sub = ins.program!;
            const subCaptures = captures.slice();
            const subEnd = this.executeAnchored(sub, input, pos, subCaptures, null);
            const matched = subEnd >= 0;
            if (ins.a === 1) {
              if (matched) failed = true;
              else pc++;
            } else if (!matched) {
              failed = true;
            } else {
              for (let slot = 0; slot < captures.length; slot++) {
                logSet(slot, subCaptures[slot]);
              }
              pc++;
            }
            break;
          }
          case Op.Match:
            return pos;
          case Op.Loop: {
            if (ins.greedy) {
              stack.push({
                kind: 0,
                pc: ins.b,
                pos,
                undoLen: undoSlots.length,
                loopId: -1,
                clearFrom: -1,
                clearTo: -1,
              });
              if (ins.clearFrom >= 0) clearRange(ins.clearFrom, ins.clearTo);
              regs[ins.loopId] = pos;
              pc = ins.a;
            } else {
              stack.push({
                kind: 1,
                pc: ins.a,
                pos,
                undoLen: undoSlots.length,
                loopId: ins.loopId,
                clearFrom: ins.clearFrom,
                clearTo: ins.clearTo,
              });
              pc = ins.b;
            }
            break;
          }
          case Op.LoopBack: {
            if (regs[ins.loopId] === pos) failed = true;
            else pc = ins.a;
            break;
          }
          case Op.SetReg:
            regs[ins.loopId] = pos;
            pc++;
            break;
          case Op.EmptyCheck:
            if (regs[ins.loopId] === pos) failed = true;
            else pc++;
            break;
        }
      }

      let resumed = false;
      while (!resumed) {
        if (stack.length === 0) {
          if (memo !== null) {
            for (let d = 0; d < buckets.length; d++) markBucket(d);
          }
          return -1;
        }
        const cp = stack.pop()!;
        markBucket(stack.length + 1);
        while (undoSlots.length > cp.undoLen) {
          const slot = undoSlots.pop()!;
          captures[slot] = undoVals.pop();
        }
        if (cp.kind === 1) {
          if (cp.clearFrom >= 0) clearRange(cp.clearFrom, cp.clearTo);
          regs[cp.loopId] = cp.pos;
        }
        pc = cp.pc;
        pos = cp.pos;
        if (
          memoizable !== null &&
          memoizable[pc]! &&
          memo !== null &&
          memo.isFailed(memo.key(pc, pos))
        ) {
          continue;
        }
        resumed = true;
      }
    }
  }

  private testAssert(kind: string, input: string, pos: number, program: Program): boolean {
    const { multiline, unicode, ignoreCase } = program;
    switch (kind) {
      case 'bol':
        if (pos === 0) return true;
        if (!multiline) return false;
        return isLineTerminatorAt(input, pos - 1);
      case 'eol':
        if (pos === input.length) return true;
        if (!multiline) return false;
        return isLineTerminatorAt(input, pos);
      case 'wb': {
        const before = isWordCharBefore(input, pos, unicode, ignoreCase);
        const after = isWordCharAt(input, pos, unicode, ignoreCase);
        return before !== after;
      }
      case 'nwb': {
        const before = isWordCharBefore(input, pos, unicode, ignoreCase);
        const after = isWordCharAt(input, pos, unicode, ignoreCase);
        return before === after;
      }
      default:
        return false;
    }
  }

  private matchBackref(
    input: string,
    pos: number,
    from: number,
    to: number,
    program: Program,
  ): number {
    const length = to - from;
    if (pos + length > input.length) return -1;
    if (!program.ignoreCase) {
      if (input.startsWith(input.slice(from, to), pos)) return pos + length;
      return -1;
    }
    if (program.unicode) {
      let a = from;
      let b = pos;
      const endB = pos + length;
      while (a < to && b < endB) {
        const ca = codePointAt(input, a);
        const cb = codePointAt(input, b);
        if (canonicalize(ca, true, true) !== canonicalize(cb, true, true)) return -1;
        a += charLengthAt(input, a);
        b += charLengthAt(input, b);
      }
      if (a !== to || b !== endB) return -1;
      return pos + length;
    }
    for (let i = 0; i < length; i++) {
      if (
        canonicalize(input.charCodeAt(from + i), false, true) !==
        canonicalize(input.charCodeAt(pos + i), false, true)
      ) {
        return -1;
      }
    }
    return pos + length;
  }

  search(input: string, startPos: number): MatchCore | null {
    if (startPos < 0) startPos = 0;
    if (startPos > input.length) return null;
    const useMemo = !this.program.hasBackrefs && !this.program.hasLookahead;
    const memo = useMemo ? new Memo(this.program.instructions.length, input.length) : null;
    const captures: (number | undefined)[] = new Array(this.program.numSlots);
    startPos = normalizeUnicodeStart(input, startPos, this.program.unicode);
    for (let s = startPos; s <= input.length; s++) {
      for (let slot = 0; slot < captures.length; slot++) captures[slot] = undefined;
      const end = this.executeAnchored(this.program, input, s, captures, memo);
      if (end >= 0) {
        return { start: s, end, captures: captures.slice() };
      }
    }
    return null;
  }

  matchAt(input: string, pos: number): MatchCore | null {
    if (pos < 0 || pos > input.length) return null;
    pos = normalizeUnicodeStart(input, pos, this.program.unicode);
    const useMemo = !this.program.hasBackrefs && !this.program.hasLookahead;
    const memo = useMemo ? new Memo(this.program.instructions.length, input.length) : null;
    const captures: (number | undefined)[] = new Array(this.program.numSlots);
    const end = this.executeAnchored(this.program, input, pos, captures, memo);
    if (end >= 0) return { start: pos, end, captures: captures.slice() };
    return null;
  }
}

function isHighSurrogate(cu: number): boolean {
  return cu >= 0xd800 && cu <= 0xdbff;
}

function isLowSurrogate(cu: number): boolean {
  return cu >= 0xdc00 && cu <= 0xdfff;
}

export function normalizeUnicodeStart(input: string, pos: number, unicode: boolean): number {
  if (!unicode) return pos;
  if (pos > 0 && pos < input.length && isLowSurrogate(input.charCodeAt(pos)) && isHighSurrogate(input.charCodeAt(pos - 1))) {
    return pos - 1;
  }
  return pos;
}

function isLineTerminatorAt(input: string, pos: number): boolean {
  if (pos < 0 || pos >= input.length) return false;
  const cu = input.charCodeAt(pos);
  return cu === 0x0a || cu === 0x0d || cu === 0x2028 || cu === 0x2029;
}
