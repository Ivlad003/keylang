// What the PHP framework adapters (Laravel, Symfony) read from the code the
// PHP extractor recorded: classes by their qualified names with their bases
// and interfaces, the names a file's `use` statements bind, and the literals
// of attributes, properties and call arguments (`LiteralFact`). Everything is
// a fact of the syntax; a name keylang cannot qualify is no class.

import type { ArgFact, CallFact, DeclFact, FileFacts, LiteralFact } from "../extract/facts.ts";
import type { ConfigFacts, TypeName } from "./adapter.ts";

/** A class (or interface) of the repository by its qualified name. */
export interface PhpClass {
  file: string;
  decl: DeclFact;
  /** The name the file declares: `OrderController`. */
  name: string;
  qualified: string;
  /** The `extends` of a class, qualified; null without one. */
  base: string | null;
  /** `implements` of a class, `extends` of an interface, qualified. */
  implements: string[];
}

/** The repository's PHP classes, interfaces and traits by their qualified names in ASCII lower case. */
export class PhpCode {
  readonly files: readonly FileFacts[];
  readonly classes = new Map<string, PhpClass>();
  private readonly locals = new Map<string, Map<string, string>>();

  constructor(files: readonly FileFacts[]) {
    this.files = files.filter((f) => f.path.endsWith(".php"));
    for (const file of this.files) {
      const locals = localNames(file);
      this.locals.set(file.path, locals);
      for (const decl of file.decls) {
        if (decl.kind === "fn") continue;
        const symbol = file.symbols?.find((s) => s.table === "class" && s.name === decl.name);
        if (!symbol) continue;
        const qualify = (written: string): string => this.qualified(file.path, written);
        const cls: PhpClass = { file: file.path, decl, name: decl.name, qualified: symbol.qualified, base: decl.base ? qualify(decl.base) : null, implements: (decl.implements ?? []).map(qualify) };
        if (!this.classes.has(key(symbol.qualified))) this.classes.set(key(symbol.qualified), cls);
      }
    }
  }

  /** The qualified name a class name written in `file` stands for (its `use`, else its namespace as the extractor recorded it). */
  qualified(file: string, written: string): string {
    const local = this.locals.get(file)?.get(key(written));
    return local ?? written.replace(/^\\+/, "");
  }

  get(qualified: string): PhpClass | undefined {
    return this.classes.get(key(qualified));
  }

  /** The class and its bases keylang has read, the class first. */
  lineage(qualified: string): PhpClass[] {
    const out: PhpClass[] = [];
    let at = this.get(qualified);
    while (at && !out.includes(at)) {
      out.push(at);
      at = at.base ? this.get(at.base) : undefined;
    }
    return out;
  }

  /** The class extends `base` (qualified), directly or through bases keylang has read. */
  extends(cls: PhpClass, base: string): boolean {
    return this.lineage(cls.qualified).some((c) => c.base !== null && key(c.base) === key(base));
  }

  /** The class or a base implements `iface` (qualified), directly or through interfaces keylang has read. */
  implements(cls: PhpClass, iface: string): boolean {
    const seen = new Set<string>();
    const stack = this.lineage(cls.qualified).flatMap((c) => c.implements);
    while (stack.length > 0) {
      const at = stack.pop()!;
      if (seen.has(key(at))) continue;
      seen.add(key(at));
      if (key(at) === key(iface)) return true;
      stack.push(...(this.get(at)?.implements ?? []));
    }
    return false;
  }

  /** A public method of the class or a base keylang has read; null when none declares it. */
  method(qualified: string, name: string): { cls: PhpClass; decl: DeclFact } | null {
    for (const cls of this.lineage(qualified)) {
      const decl = cls.decl.members.find((m) => m.kind === "fn" && key(m.name) === key(name));
      if (decl) return { cls, decl };
    }
    return null;
  }

  /** The qualified class the head of a callee written in `file` names (`Route.get` → `Illuminate\Support\Facades\Route`). */
  calleeClass(file: string, callee: string): string | null {
    const parts = callee.split(".");
    if (parts.length !== 2 || parts[0] === "this" || parts[0] === "super") return null;
    return this.qualified(file, parts[0]!);
  }
}

/** Local class names of a file's imports (in ASCII lower case) → the qualified names they bind. */
function localNames(file: FileFacts): Map<string, string> {
  const out = new Map<string, string>();
  for (const imp of file.imports) {
    if (/^(function|const|include) /.test(imp.source) || imp.source.includes(" ?? ")) continue;
    for (const binding of imp.bindings) if (!out.has(key(binding.local))) out.set(key(binding.local), imp.source.replace(/^\\+/, ""));
  }
  return out;
}

/** PHP class names compare without ASCII case. */
export function key(name: string): string {
  return name.replace(/^\\+/, "").replace(/[A-Z]+/g, (s) => s.toLowerCase());
}

export function sameClass(a: string, b: string): boolean {
  return key(a) === key(b);
}

/** An argument by its name, else by its position. */
export function arg(args: readonly ArgFact[] | undefined, name: string | null, position: number | null): LiteralFact | null {
  if (!args) return null;
  if (name !== null) {
    const named = args.find((a) => a.name === name);
    if (named) return named.value;
  }
  if (position === null) return null;
  const positional = args.filter((a) => a.name === undefined);
  return positional[position]?.value ?? null;
}

export function str(value: LiteralFact | null | undefined): string | null {
  return value?.kind === "string" ? value.value : null;
}

export function cls(value: LiteralFact | null | undefined): string | null {
  return value?.kind === "class" ? value.name : null;
}

/** The strings of a string or an array of strings. */
export function strings(value: LiteralFact | null | undefined): string[] {
  if (!value) return [];
  if (value.kind === "string") return [value.value];
  if (value.kind === "array") return value.items.flatMap((i) => (i.value.kind === "string" ? [i.value.value] : []));
  return [];
}

/** An event a listener or a dispatch names: a class by its qualified name, a string as written, a class constant as `X::NAME`. */
export function eventName(value: LiteralFact | null | undefined): string | null {
  if (!value) return null;
  if (value.kind === "class" || value.kind === "new") return value.name;
  if (value.kind === "string") return value.value;
  if (value.kind === "const") return `${value.class}::${value.name}`;
  return null;
}

export function type(name: string): TypeName {
  return { name };
}

/** Every call of a file with the declaration it sits in (`Class.method`, a function's name) or null at the module level. */
export function* callsOf(file: FileFacts): Generator<{ call: CallFact; symbol: string | null; decl: DeclFact | null; cls: DeclFact | null }> {
  for (const call of file.moduleCalls) yield { call, symbol: null, decl: null, cls: null };
  for (const decl of file.decls) {
    if (decl.kind === "fn") for (const call of decl.calls) yield { call, symbol: decl.name, decl, cls: null };
    for (const member of decl.members) for (const call of member.calls) yield { call, symbol: `${decl.name}.${member.name}`, decl: member, cls: decl };
  }
}

/** Facts of one source file a framework reads, empty to start with. */
export function codeFacts(path: string): ConfigFacts {
  return { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], entries: [], listens: [], handlers: [], dispatches: [], holes: [], error: null };
}

/** Whether a code configuration says anything. */
export function hasFacts(facts: ConfigFacts): boolean {
  return facts.bindings.length + facts.arguments.length + (facts.entries?.length ?? 0) + (facts.listens?.length ?? 0) + (facts.handlers?.length ?? 0) + (facts.dispatches?.length ?? 0) + (facts.holes?.length ?? 0) > 0;
}

/** Global helpers that dispatch the object they get: Laravel's `event()`, `dispatch()`, `dispatch_sync()`. */
const DISPATCH_FUNCTIONS = new Set(["event", "dispatch", "dispatch_sync", "dispatch_now"]);
/** Static methods that dispatch the object they get on a facade (`Event::dispatch(new X)`, `Bus::dispatch(new J)`, `Queue::push(new J)`). */
const DISPATCH_STATICS = new Set(["dispatch", "dispatchsync", "dispatchnow", "push", "pushon", "later", "until"]);

/**
 * Calls that dispatch an event or a message object, in a declaration of the
 * file: `event(new X)`, `dispatch(new J)`, `Event::dispatch(new X)`,
 * `Bus::dispatch(new J)`, `$dispatcher->dispatch(new X)` (a string second
 * argument names the event: Symfony `dispatch($e, 'order.placed')`), and
 * `X::dispatch(…)` on the event or job class itself. The event is the class
 * the call names; the adapter's listeners and handlers decide whether it is
 * one. A `dispatch` of an object whose class the repository declares is that
 * class's own method, not the framework's.
 */
export function dispatchesIn(code: PhpCode, file: FileFacts): { symbol: string; call: CallFact; event: string }[] {
  const out: { symbol: string; call: CallFact; event: string }[] = [];
  for (const { call, symbol } of callsOf(file)) {
    if (symbol === null || call.opaque) continue;
    const parts = call.callee.split(".");
    const method = parts.at(-1)!;
    const first = arg(call.args, null, 0);
    if (parts.length === 1) {
      const name = method.slice(method.lastIndexOf("\\") + 1).toLowerCase();
      if (DISPATCH_FUNCTIONS.has(name) && first?.kind === "new") out.push({ symbol, call, event: first.name });
      continue;
    }
    if (parts.length === 2 && parts[0] !== "this" && parts[0] !== "super" && !call.bound) {
      const target = code.get(code.qualified(file.path, parts[0]!));
      if (target && /^dispatch/i.test(method)) out.push({ symbol, call, event: target.qualified });
      else if (!target && DISPATCH_STATICS.has(method.toLowerCase()) && first?.kind === "new") out.push({ symbol, call, event: first.name });
      continue;
    }
    if (method !== "dispatch" || first?.kind !== "new") continue;
    if (call.receiver && code.get(code.qualified(file.path, call.receiver))) continue;
    out.push({ symbol, call, event: str(arg(call.args, null, 1)) ?? first.name });
  }
  return out;
}
