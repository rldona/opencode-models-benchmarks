import {
  buildAnyMatcher,
  buildCharMatcher,
  buildClassMatcher,
  type CharMatcher,
} from './chars.js';
import type { Node, ParsedPattern } from './parser.js';

export const enum Op {
  Char = 0,
  Split = 1,
  Jmp = 2,
  Save = 3,
  Clear = 4,
  Assert = 5,
  Backref = 6,
  Lookahead = 7,
  Match = 8,
  Loop = 9,
  LoopBack = 10,
  SetReg = 11,
  EmptyCheck = 12,
}

export type AssertKind = 'bol' | 'eol' | 'wb' | 'nwb';

export interface Instruction {
  op: Op;
  a: number;
  b: number;
  greedy: boolean;
  loopId: number;
  matcher: CharMatcher | null;
  program: Program | null;
  assertKind: AssertKind | null;
  clearFrom: number;
  clearTo: number;
}

export interface Program {
  instructions: Instruction[];
  entry: number;
  numSlots: number;
  groupCount: number;
  groupNames: Map<string, number>;
  hasNamedGroups: boolean;
  hasBackrefs: boolean;
  hasLookahead: boolean;
  memoizable: boolean[];
  loopCount: number;
  unicode: boolean;
  ignoreCase: boolean;
  multiline: boolean;
  dotAll: boolean;
}

export interface CompileEnv {
  unicode: boolean;
  ignoreCase: boolean;
  multiline: boolean;
  dotAll: boolean;
  groupNames: Map<string, number>;
  groupCount: number;
}

function makeInstruction(op: Op): Instruction {
  return {
    op,
    a: 0,
    b: 0,
    greedy: true,
    loopId: -1,
    matcher: null,
    program: null,
    assertKind: null,
    clearFrom: -1,
    clearTo: -1,
  };
}

class Compiler {
  code: Instruction[] = [];
  loopCounter = 0;

  emit(op: Op): number {
    this.code.push(makeInstruction(op));
    return this.code.length - 1;
  }

  emitChar(matcher: CharMatcher): void {
    const pc = this.emit(Op.Char);
    this.code[pc]!.matcher = matcher;
  }

  emitSave(slot: number): void {
    const pc = this.emit(Op.Save);
    this.code[pc]!.a = slot;
  }

  compile(node: Node, env: CompileEnv): void {
    switch (node.kind) {
      case 'empty':
        return;
      case 'char':
        this.emitChar(buildCharMatcher(node.cp, env));
        return;
      case 'class':
        this.emitChar(buildClassMatcher(node.pieces, node.negated, env));
        return;
      case 'any':
        this.emitChar(buildAnyMatcher(env.dotAll, env.unicode));
        return;
      case 'assert': {
        const pc = this.emit(Op.Assert);
        this.code[pc]!.assertKind = node.type;
        return;
      }
      case 'backref': {
        const pc = this.emit(Op.Backref);
        const ref = typeof node.ref === 'number' ? node.ref : (env.groupNames.get(node.ref) ?? -1);
        this.code[pc]!.a = ref;
        return;
      }
      case 'concat':
        for (const item of node.items) this.compile(item, env);
        return;
      case 'alt':
        this.compileAlt(node.branches, env);
        return;
      case 'group':
        if (node.index !== null) this.emitSave(2 * node.index);
        this.compile(node.body, env);
        if (node.index !== null) this.emitSave(2 * node.index + 1);
        return;
      case 'lookahead': {
        const sub = compileProgram(node.body, env, true);
        const pc = this.emit(Op.Lookahead);
        this.code[pc]!.program = sub;
        this.code[pc]!.a = node.neg ? 1 : 0;
        return;
      }
      case 'repeat':
        this.compileRepeat(node, env);
        return;
    }
  }

  compileAlt(branches: Node[], env: CompileEnv): void {
    const jumpEnds: number[] = [];
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i]!;
      if (i < branches.length - 1) {
        const splitPc = this.emit(Op.Split);
        const firstStart = this.code.length;
        this.compile(branch, env);
        jumpEnds.push(this.emit(Op.Jmp));
        const secondStart = this.code.length;
        this.code[splitPc]!.a = firstStart;
        this.code[splitPc]!.b = secondStart;
      } else {
        this.compile(branch, env);
      }
    }
    const end = this.code.length;
    for (const pc of jumpEnds) this.code[pc]!.a = end;
  }

  compileRepeat(node: { min: number; max: number; greedy: boolean; body: Node }, env: CompileEnv): void {
    if (node.max === 0) return;
    const range = groupSlotRange(node.body);

    for (let i = 0; i < node.min; i++) {
      if (range) this.emitClear(range[0], range[1]);
      this.compile(node.body, env);
    }

    if (node.max === Infinity) {
      this.emitOptionalLoop(node.greedy, node.body, env, range);
    } else {
      for (let i = node.min; i < node.max; i++) {
        this.emitOptionalOnce(node.greedy, node.body, env, range);
      }
    }
  }

  emitClear(from: number, to: number): void {
    const pc = this.emit(Op.Clear);
    this.code[pc]!.clearFrom = from;
    this.code[pc]!.clearTo = to;
  }

  emitOptionalOnce(
    greedy: boolean,
    body: Node,
    env: CompileEnv,
    range: [number, number] | null,
  ): void {
    const loopId = this.loopCounter++;
    const splitPc = this.emit(Op.Split);
    const bodyPc = this.code.length;
    const setRegPc = this.emit(Op.SetReg);
    this.code[setRegPc]!.loopId = loopId;
    if (range) this.emitClear(range[0], range[1]);
    this.compile(body, env);
    const checkPc = this.emit(Op.EmptyCheck);
    this.code[checkPc]!.loopId = loopId;
    const afterPc = this.code.length;
    this.code[splitPc]!.greedy = greedy;
    if (greedy) {
      this.code[splitPc]!.a = bodyPc;
      this.code[splitPc]!.b = afterPc;
    } else {
      this.code[splitPc]!.a = afterPc;
      this.code[splitPc]!.b = bodyPc;
    }
  }

  emitOptionalLoop(
    greedy: boolean,
    body: Node,
    env: CompileEnv,
    range: [number, number] | null,
  ): void {
    const loopId = this.loopCounter++;
    const loopPc = this.emit(Op.Loop);
    const clearFrom = range ? range[0] : -1;
    const clearTo = range ? range[1] : -1;
    this.code[loopPc]!.loopId = loopId;
    this.code[loopPc]!.greedy = greedy;
    this.code[loopPc]!.clearFrom = clearFrom;
    this.code[loopPc]!.clearTo = clearTo;
    const bodyPc = this.code.length;
    this.compile(body, env);
    const backPc = this.emit(Op.LoopBack);
    this.code[backPc]!.loopId = loopId;
    this.code[backPc]!.a = loopPc;
    const exitPc = this.code.length;
    this.code[loopPc]!.a = bodyPc;
    this.code[loopPc]!.b = exitPc;
  }
}

function groupSlotRange(node: Node): [number, number] | null {
  let first = Infinity;
  let last = -1;
  const visit = (n: Node): void => {
    switch (n.kind) {
      case 'group':
        if (n.index !== null) {
          if (n.index < first) first = n.index;
          if (n.index > last) last = n.index;
        }
        visit(n.body);
        break;
      case 'concat':
        for (const item of n.items) visit(item);
        break;
      case 'alt':
        for (const b of n.branches) visit(b);
        break;
      case 'lookahead':
        visit(n.body);
        break;
      case 'repeat':
        visit(n.body);
        break;
      default:
        break;
    }
  };
  visit(node);
  if (last < 0) return null;
  return [2 * first, 2 * last + 2];
}

function hasBackref(node: Node): boolean {
  switch (node.kind) {
    case 'backref':
      return true;
    case 'concat':
      return node.items.some(hasBackref);
    case 'alt':
      return node.branches.some(hasBackref);
    case 'group':
      return hasBackref(node.body);
    case 'lookahead':
      return hasBackref(node.body);
    case 'repeat':
      return hasBackref(node.body);
    default:
      return false;
  }
}

function hasLookaheadNode(node: Node): boolean {
  switch (node.kind) {
    case 'lookahead':
      return true;
    case 'concat':
      return node.items.some(hasLookaheadNode);
    case 'alt':
      return node.branches.some(hasLookaheadNode);
    case 'group':
      return hasLookaheadNode(node.body);
    case 'repeat':
      return hasLookaheadNode(node.body);
    default:
      return false;
  }
}

export function compileProgram(body: Node, env: CompileEnv, subProgram = false): Program {
  const compiler = new Compiler();
  compiler.compile(body, env);
  compiler.emit(Op.Match);
  const instructions = compiler.code;
  return {
    instructions,
    entry: 0,
    numSlots: 2 * (env.groupCount + 1),
    groupCount: env.groupCount,
    groupNames: env.groupNames,
    hasNamedGroups: env.groupNames.size > 0,
    hasBackrefs: hasBackref(body),
    hasLookahead: subProgram || hasLookaheadNode(body),
    memoizable: computeMemoizable(instructions),
    loopCount: compiler.loopCounter,
    unicode: env.unicode,
    ignoreCase: env.ignoreCase,
    multiline: env.multiline,
    dotAll: env.dotAll,
  };
}

export function computeMemoizable(instructions: Instruction[]): boolean[] {
  const n = instructions.length;
  const epsilonSucc = (pc: number): number[] => {
    const ins = instructions[pc]!;
    switch (ins.op) {
      case Op.Split:
        return [ins.a, ins.b];
      case Op.Jmp:
        return [ins.a];
      case Op.Save:
      case Op.Clear:
      case Op.Assert:
      case Op.SetReg:
        return [pc + 1];
      case Op.Loop:
        return [ins.a, ins.b];
      case Op.LoopBack:
        return [ins.a];
      case Op.EmptyCheck:
        return [pc + 1];
      case Op.Lookahead:
        return [pc + 1];
      default:
        return [];
    }
  };
  // A state is register-sensitive when it is reachable from the start of some
  // repetition body through zero-width transitions only: there, the position may
  // still equal the iteration start, so the empty-iteration check depends on
  // hidden per-path register state. Such states are excluded from memoization.
  const sensitive = new Array<boolean>(n).fill(false);
  const queue: number[] = [];
  for (let pc = 0; pc < n; pc++) {
    const ins = instructions[pc]!;
    if (ins.op === Op.Loop) queue.push(ins.a);
    else if (ins.op === Op.SetReg) queue.push(pc + 1);
  }
  while (queue.length > 0) {
    const pc = queue.pop()!;
    if (pc < 0 || pc >= n || sensitive[pc]) continue;
    sensitive[pc] = true;
    for (const succ of epsilonSucc(pc)) {
      if (succ >= 0 && succ < n && !sensitive[succ]) queue.push(succ);
    }
  }
  const memoizable = new Array<boolean>(n).fill(false);
  for (let pc = 0; pc < n; pc++) {
    const op = instructions[pc]!.op;
    if (op === Op.Char || op === Op.Backref || op === Op.Lookahead || op === Op.Match) continue;
    if (op === Op.LoopBack || op === Op.EmptyCheck) continue;
    memoizable[pc] = !sensitive[pc];
  }
  return memoizable;
}

export function buildProgram(parsed: ParsedPattern): Program {
  const env: CompileEnv = {
    unicode: parsed.unicode,
    ignoreCase: parsed.ignoreCase,
    multiline: parsed.multiline,
    dotAll: parsed.dotAll,
    groupNames: parsed.groupNames,
    groupCount: parsed.groupCount,
  };
  const program = compileProgram(parsed.ast, env);
  program.hasBackrefs = parsed.hasBackrefs;
  program.hasLookahead = parsed.hasLookahead;
  return program;
}
