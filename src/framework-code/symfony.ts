// What Symfony wires in code (ADR 0022; business-flows 36), for the adapter
// `src/frameworks/symfony.ts`: the PHP attributes the extractor records
// (`#[Route]`, `#[AsEventListener]`, `#[AsMessageHandler]`, `#[AsCommand]`,
// `#[AsCronTask]`, `#[AsPeriodicTask]`, `#[AsAlias]`), a literal
// `getSubscribedEvents()` and the calls that dispatch an event or a message.
// The prefixes of `config/routes.yaml` apply to the attribute routes.

import type { FileFacts, LiteralFact } from "../extract/facts.ts";
import type { ConfigFacts, ConfigHole, FrameworkConfig, RoutePrefixFact } from "../frameworks/adapter.ts";
import { arg, cls, codeFacts, dispatchesIn, eventName, hasFacts, key, PhpCode, str, strings, type, type PhpClass } from "./php.ts";

const ROUTE = ["Symfony\\Component\\Routing\\Attribute\\Route", "Symfony\\Component\\Routing\\Annotation\\Route"];
const AS_EVENT_LISTENER = "Symfony\\Component\\EventDispatcher\\Attribute\\AsEventListener";
const EVENT_SUBSCRIBER = "Symfony\\Component\\EventDispatcher\\EventSubscriberInterface";
const AS_MESSAGE_HANDLER = "Symfony\\Component\\Messenger\\Attribute\\AsMessageHandler";
const AS_COMMAND = "Symfony\\Component\\Console\\Attribute\\AsCommand";
const COMMAND = "Symfony\\Component\\Console\\Command\\Command";
const AS_CRON_TASK = "Symfony\\Component\\Scheduler\\Attribute\\AsCronTask";
const AS_PERIODIC_TASK = "Symfony\\Component\\Scheduler\\Attribute\\AsPeriodicTask";
const AS_ALIAS = "Symfony\\Component\\DependencyInjection\\Attribute\\AsAlias";
/** A class name as Symfony writes it in a string: no leading `\`, single separators. */
const CLASS_NAME = /^\\?[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*(\\+[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*)+$/;

function className(written: string): string {
  return written.trim().replace(/\\+/g, "\\").replace(/^\\/, "");
}

/** What a Symfony repository's code wires: attributes, subscribers, dispatches; the route prefixes of `configs` apply to attribute routes. */
export function symfonyFacts(files: readonly FileFacts[], configs: readonly ConfigFacts[]): FrameworkConfig[] {
  const code = new PhpCode(files);
  const out = new Map<string, ConfigFacts>();
  const at = (path: string): ConfigFacts => {
    let facts = out.get(path);
    if (!facts) out.set(path, (facts = codeFacts(path)));
    return facts;
  };
  const prefixes: RoutePrefixFact[] = configs.flatMap((c) => c.routePrefixes ?? []);
  const classes = [...code.classes.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.decl.line - b.decl.line));
  for (const c of classes) {
    const facts = at(c.file);
    routes(c, facts, prefixes);
    listeners(code, c, facts);
    handlers(c, facts);
    commands(code, c, facts);
    tasks(c, facts);
    aliases(c, facts);
  }
  for (const file of code.files) {
    for (const d of dispatchesIn(code, file)) at(file.path).dispatches!.push({ symbol: d.symbol, event: d.event, text: d.call.callee, line: d.call.line, col: d.call.col, endLine: d.call.endLine, endCol: d.call.endCol });
  }
  return [...out.values()].filter(hasFacts).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((facts) => ({ facts, owner: null }));
}

function attributes(decl: { attributes?: { name: string; args: { name?: string; value: LiteralFact }[]; line: number; col: number }[] }, names: readonly string[]) {
  return (decl.attributes ?? []).filter((a) => names.some((n) => key(n) === key(a.name)));
}

/** `#[Route]` on the class (a prefix) and on its public methods; `__invoke` for one on an invokable class. */
function routes(c: PhpClass, facts: ConfigFacts, prefixes: readonly RoutePrefixFact[]): void {
  const prefix = prefixes.filter((p) => c.file === p.dir || c.file.startsWith(`${p.dir}/`)).map((p) => p.prefix).at(-1) ?? "";
  const own = attributes(c.decl, ROUTE);
  const base = str(arg(own[0]?.args, "path", 0)) ?? "";
  const add = (attribute: (typeof own)[number], method: string): void => {
    const path = str(arg(attribute.args, "path", 0));
    if (path === null) {
      const localized = arg(attribute.args, "path", 0);
      if (localized?.kind === "array") facts.holes!.push({ line: attribute.line, col: attribute.col, text: `${c.name}::${method}`, reason: "a route with a path per locale is not read" });
      return;
    }
    const full = joinPath([prefix, base, path]);
    const methods = strings(arg(attribute.args, "methods", null)).map((m) => m.toUpperCase());
    for (const m of methods.length > 0 ? methods : [null]) facts.entries!.push({ kind: "route", label: m === null ? full : `${m} ${full}`, files: [], fn: method, type: type(c.qualified), ...(m !== null ? { method: m } : {}), line: attribute.line, col: attribute.col });
  };
  for (const member of c.decl.members) for (const attribute of attributes(member, ROUTE)) add(attribute, member.name);
  // A route on the class of an invokable controller is its own route, not a prefix.
  if (own.length > 0 && c.decl.members.some((m) => m.name === "__invoke") && !c.decl.members.some((m) => attributes(m, ROUTE).length > 0)) {
    for (const attribute of own) add({ ...attribute, args: attribute.args }, "__invoke");
  }
}

function joinPath(parts: readonly string[]): string {
  const segments = parts.flatMap((p) => p.split("/")).filter((s) => s !== "");
  return `/${segments.join("/")}`;
}

/** `#[AsEventListener]` on the class or a method, and `getSubscribedEvents()` of an `EventSubscriberInterface`: observers. */
function listeners(code: PhpCode, c: PhpClass, facts: ConfigFacts): void {
  const add = (event: string, method: string, at: { line: number; col: number }): void => {
    facts.listens!.push({ event, listener: type(c.qualified), method, ...at });
    facts.entries!.push({ kind: "observer", label: event, files: [], fn: method, type: type(c.qualified), ...at });
  };
  const firstParam = (method: string): string | null => c.decl.members.find((m) => m.name === method)?.params?.[0]?.type ?? null;
  for (const attribute of attributes(c.decl, [AS_EVENT_LISTENER])) {
    const method = str(arg(attribute.args, "method", 2)) ?? "__invoke";
    const event = eventName(arg(attribute.args, "event", 0)) ?? firstParam(method);
    if (event !== null) add(event, method, attribute);
    else facts.holes!.push({ line: attribute.line, col: attribute.col, text: c.name, reason: `the listener \`${c.qualified}::${method}\` names no event keylang reads` });
  }
  for (const member of c.decl.members) {
    for (const attribute of attributes(member, [AS_EVENT_LISTENER])) {
      const event = eventName(arg(attribute.args, "event", 0)) ?? member.params?.[0]?.type ?? null;
      if (event !== null) add(event, member.name, attribute);
      else facts.holes!.push({ line: attribute.line, col: attribute.col, text: `${c.name}::${member.name}`, reason: `the listener \`${c.qualified}::${member.name}\` names no event keylang reads` });
    }
  }
  if (!code.implements(c, EVENT_SUBSCRIBER)) return;
  const subscribed = c.decl.members.find((m) => m.name.toLowerCase() === "getsubscribedevents");
  if (!subscribed) return;
  const returned = subscribed.returns;
  if (returned?.kind !== "array") {
    facts.holes!.push({ line: subscribed.line, col: subscribed.col, text: `${c.name}::getSubscribedEvents`, reason: `the subscriber \`${c.qualified}\` computes its events: keylang reads only a literal array` });
    return;
  }
  // `[E::class => 'on']`, `[E::class => ['on', 10]]`, `[E::class => [['on', 10], ['other']]]`.
  for (const item of returned.items) {
    const event = eventName(item.key);
    if (event === null) continue;
    const value = item.value;
    const methods = value.kind === "string" ? [value.value] : value.kind === "array" && value.items[0]?.value.kind === "string" ? [value.items[0].value.value] : value.kind === "array" ? value.items.flatMap((i) => (i.value.kind === "array" && i.value.items[0]?.value.kind === "string" ? [i.value.items[0].value.value] : [])) : [];
    for (const method of methods) add(event, method, { line: subscribed.line, col: subscribed.col });
  }
}

/** `#[AsMessageHandler]` on the class (`__invoke`, or `method:`) or a method: a consumer of the message its `handles:` or first parameter names. */
function handlers(c: PhpClass, facts: ConfigFacts): void {
  const add = (method: string, handles: LiteralFact | null, at: { line: number; col: number }): void => {
    const message = cls(handles) ?? c.decl.members.find((m) => m.name === method)?.params?.[0]?.type ?? null;
    facts.entries!.push({ kind: "consumer", label: message ?? c.qualified, files: [], fn: method, type: type(c.qualified), ...at });
    if (message !== null) facts.handlers!.push({ kind: "message", message, handler: type(c.qualified), method, ...at });
  };
  for (const attribute of attributes(c.decl, [AS_MESSAGE_HANDLER])) add(str(arg(attribute.args, "method", null)) ?? "__invoke", arg(attribute.args, "handles", null), attribute);
  for (const member of c.decl.members) for (const attribute of attributes(member, [AS_MESSAGE_HANDLER])) add(member.name, arg(attribute.args, "handles", null), attribute);
}

/** `#[AsCommand('app:x')]` (or `$defaultName`) on a command: `execute`, or `__invoke` of an invokable command. */
function commands(code: PhpCode, c: PhpClass, facts: ConfigFacts): void {
  const attribute = attributes(c.decl, [AS_COMMAND])[0];
  const name = str(arg(attribute?.args, "name", 0)) ?? (code.extends(c, COMMAND) ? str((c.decl.properties ?? []).find((p) => p.name === "defaultName")?.value) : null);
  if (name === null) return;
  const method = code.method(c.qualified, "execute") ?? code.method(c.qualified, "__invoke");
  const at = attribute ?? c.decl;
  if (!method) {
    facts.holes!.push({ line: at.line, col: at.col, text: c.name, reason: `the command \`${name}\` declares no \`execute\` or \`__invoke\` keylang has read` });
    return;
  }
  facts.entries!.push({ kind: "cli", label: name.split("|")[0]!, files: [], fn: method.decl.name, type: type(method.cls.qualified), line: at.line, col: at.col });
}

/** `#[AsCronTask('0 3 * * *')]`, `#[AsPeriodicTask('1 hour')]` on the class (`__invoke`, or `method:`) or a method: cron. */
function tasks(c: PhpClass, facts: ConfigFacts): void {
  const add = (attribute: { args: { name?: string; value: LiteralFact }[]; line: number; col: number; name: string }, method: string): void => {
    const when = str(arg(attribute.args, key(attribute.name) === key(AS_CRON_TASK) ? "expression" : "frequency", 0));
    facts.entries!.push({ kind: "cron", label: `${c.qualified}::${method}${when ? ` (${when})` : ""}`, files: [], fn: method, type: type(c.qualified), line: attribute.line, col: attribute.col });
  };
  for (const attribute of attributes(c.decl, [AS_CRON_TASK, AS_PERIODIC_TASK])) add(attribute, str(arg(attribute.args, "method", null)) ?? "__invoke");
  for (const member of c.decl.members) for (const attribute of attributes(member, [AS_CRON_TASK, AS_PERIODIC_TASK])) add(attribute, member.name);
}

/** `#[AsAlias(I::class)]` on a class: a binding `I → class`; without an id, the one interface the class implements. */
function aliases(c: PhpClass, facts: ConfigFacts): void {
  for (const attribute of attributes(c.decl, [AS_ALIAS])) {
    const id = cls(arg(attribute.args, "id", 0)) ?? (str(arg(attribute.args, "id", 0)) !== null && CLASS_NAME.test(str(arg(attribute.args, "id", 0))!) ? className(str(arg(attribute.args, "id", 0))!) : null);
    const from = id ?? (c.implements.length === 1 ? c.implements[0]! : null);
    if (from !== null) facts.bindings.push({ from: type(from), to: type(c.qualified), line: attribute.line, col: attribute.col });
    else {
      const hole: ConfigHole = { line: attribute.line, col: attribute.col, text: c.name, reason: `\`#[AsAlias]\` on \`${c.qualified}\` names no id and the class implements ${c.implements.length} interfaces` };
      facts.holes!.push(hole);
    }
  }
}
