// The Symfony adapter (ADR 0022; business-flows 36). The container is written
// in `config/services.yaml` (and `services_<env>.yaml`): an alias
// `I: '@C'` or `I: { alias: C }` binds an interface, `arguments: { $p: '@C' }`
// sets a constructor argument of one service, `bind: { $p: '@C' }` (under
// `_defaults` for every service) a named argument. Routes, listeners,
// Messenger handlers, commands and scheduled tasks are PHP attributes the
// extractor records (`#[Route]`, `#[AsEventListener]`, `#[AsMessageHandler]`,
// `#[AsCommand]`, `#[AsCronTask]`, `#[AsPeriodicTask]`, `#[AsAlias]`) or an
// `EventSubscriberInterface::getSubscribedEvents()` returning a literal
// array; `config/routes.yaml` adds routes and a prefix for the attribute
// routes of a directory. YAML is read with a parser (`yaml`), positions are
// its. XML and PHP service or route configs are listed and left unread: a
// hole with the reason, never a guess.
//
// Detected from `symfony/framework-bundle` in the root `composer.json`, or a
// `config/bundles.php`.

import { posix } from "node:path";
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node as YamlNode, type Pair } from "yaml";
import type { FileFacts, LiteralFact } from "../extract/facts.ts";
import type { ConfigFacts, ConfigHole, FrameworkAdapter, FrameworkConfig, RoutePrefixFact } from "./adapter.ts";
import { arg, cls, codeFacts, dispatchesIn, eventName, hasFacts, key, PhpCode, str, strings, type, type PhpClass } from "./php-code.ts";

/** `EVERY_CLASS` of `./adapter.ts`, written out: the adapter imports this module, so it imports no value back. */
const EVERY_CLASS = "*";
const SERVICES = /^config\/services(?:_[A-Za-z0-9]+)?\.(yaml|yml|xml|php)$/;
const ROUTES = /^config\/routes(?:\/[^/]+)?\.(yaml|yml|xml|php)$/;

const ROUTE = ["Symfony\\Component\\Routing\\Attribute\\Route", "Symfony\\Component\\Routing\\Annotation\\Route"];
const AS_EVENT_LISTENER = "Symfony\\Component\\EventDispatcher\\Attribute\\AsEventListener";
const EVENT_SUBSCRIBER = "Symfony\\Component\\EventDispatcher\\EventSubscriberInterface";
const AS_MESSAGE_HANDLER = "Symfony\\Component\\Messenger\\Attribute\\AsMessageHandler";
const AS_COMMAND = "Symfony\\Component\\Console\\Attribute\\AsCommand";
const COMMAND = "Symfony\\Component\\Console\\Command\\Command";
const AS_CRON_TASK = "Symfony\\Component\\Scheduler\\Attribute\\AsCronTask";
const AS_PERIODIC_TASK = "Symfony\\Component\\Scheduler\\Attribute\\AsPeriodicTask";
const AS_ALIAS = "Symfony\\Component\\DependencyInjection\\Attribute\\AsAlias";

export const symfony: FrameworkAdapter = {
  name: "symfony",
  version: "1",
  detect(context) {
    const composer = parseJson(context.read("composer.json"));
    for (const field of ["require", "require-dev"]) {
      const deps = composer !== null && typeof composer === "object" ? (composer as Record<string, unknown>)[field] : null;
      if (deps !== null && typeof deps === "object" && ("symfony/framework-bundle" in deps || "symfony/symfony" in deps)) return true;
    }
    return context.read("config/bundles.php") !== null;
  },
  files(context) {
    // A config directory is not listed by the analysis: the names Symfony and its recipes use.
    const names = [...["services", "services_dev", "services_test", "services_prod", "routes", "routes/attributes", "routes/annotations"].flatMap((n) => ["yaml", "yml", "xml", "php"].map((ext) => `config/${n}.${ext}`))];
    const out: { path: string; owner: string | null }[] = [];
    for (const path of new Set([...names, ...context.sources.filter((p) => SERVICES.test(p) || ROUTES.test(p))])) if (context.analysed(path) && context.read(path) !== null) out.push({ path, owner: null });
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  parse: parseSymfonyConfig,
  code(facts, configs) {
    return symfonyFacts(facts, configs);
  },
};

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

/** A class name as a Symfony config writes it: no leading `\`, single separators. */
function className(written: string): string {
  return written.trim().replace(/\\+/g, "\\").replace(/^\\/, "");
}

const CLASS_NAME = /^\\?[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*(\\+[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*)+$/;

/**
 * The facts of one Symfony config file. `services*.yaml`: aliases (bindings),
 * `arguments` and `bind` (constructor arguments; under `_defaults` for every
 * class); `routes*.yaml`: routes with `path` and `controller`, and the
 * `prefix` of an attribute import of a directory. XML and PHP configs are
 * not read: the reason is the file's error, a hole of the snapshot.
 */
export function parseSymfonyConfig(path: string, text: string): ConfigFacts {
  const facts: ConfigFacts = { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], entries: [], holes: [], routePrefixes: [], error: null };
  if (!/\.ya?ml$/.test(path)) return { ...facts, error: { line: 1, reason: `\`${path}\` is Symfony config keylang does not read (only YAML is): what it wires is unknown` } };
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, uniqueKeys: false });
  if (doc.errors.length > 0) {
    const first = doc.errors[0]!;
    return { ...facts, error: { line: first.linePos?.[0]?.line ?? 1, reason: `\`${path}\` is no YAML: ${first.message.split("\n")[0]}` } };
  }
  const at = (node: YamlNode | Pair | null | undefined): { line: number; col: number } => {
    const range = node && "range" in node ? node.range : node && "key" in node && node.key && typeof node.key === "object" && "range" in node.key ? (node.key as YamlNode).range : null;
    const pos = range ? counter.linePos(range[0]) : { line: 1, col: 1 };
    return { line: pos.line, col: pos.col };
  };
  const hole = (node: YamlNode | Pair | null | undefined, text: string, reason: string): void => {
    facts.holes!.push({ ...at(node), text, reason });
  };
  const root = doc.contents;
  if (!isMap(root)) return facts;
  if (SERVICES.test(path)) {
    const services = root.items.find((p) => isScalar(p.key) && p.key.value === "services")?.value;
    if (!isMap(services)) return facts;
    for (const pair of services.items) {
      const id = isScalar(pair.key) ? String(pair.key.value) : null;
      if (id === null) continue;
      const value = pair.value as YamlNode | null;
      const keyNode = pair.key as YamlNode;
      if (id === "_defaults") {
        const bind = isMap(value) ? value.items.find((p) => isScalar(p.key) && p.key.value === "bind")?.value : null;
        if (isMap(bind)) for (const b of bind.items) argument(facts, EVERY_CLASS, b, at, hole);
        continue;
      }
      if (id.startsWith("_") || id.endsWith("\\")) continue;
      // `I: '@C'`: an alias.
      if (isScalar(value) && typeof value.value === "string") {
        const target = serviceRef(value.value);
        if (target !== null && CLASS_NAME.test(id)) facts.bindings.push({ from: type(className(id)), to: type(target), ...at(keyNode) });
        continue;
      }
      if (!isMap(value)) continue;
      const field = (name: string): YamlNode | null => (value.items.find((p) => isScalar(p.key) && p.key.value === name)?.value as YamlNode | null) ?? null;
      const alias = field("alias");
      const klass = field("class");
      if (isScalar(alias) && typeof alias.value === "string" && CLASS_NAME.test(id)) facts.bindings.push({ from: type(className(id)), to: type(className(alias.value.replace(/^@/, ""))), ...at(keyNode) });
      else if (isScalar(klass) && typeof klass.value === "string" && CLASS_NAME.test(id) && key(className(klass.value)) !== key(className(id))) facts.bindings.push({ from: type(className(id)), to: type(className(klass.value)), ...at(keyNode) });
      const owner = isScalar(klass) && typeof klass.value === "string" ? className(klass.value) : CLASS_NAME.test(id) ? className(id) : null;
      if (owner === null) continue;
      const args = field("arguments");
      if (isMap(args)) for (const a of args.items) argument(facts, owner, a, at, hole);
      else if (isSeq(args)) hole(args, `${id}: arguments`, `positional \`arguments\` of \`${id}\`: keylang reads only arguments named by their parameter`);
      const bind = field("bind");
      if (isMap(bind)) for (const b of bind.items) argument(facts, owner, b, at, hole);
      if (field("factory") !== null) hole(keyNode, id, `the service \`${id}\` is built by a factory keylang does not read`);
    }
    return facts;
  }
  // routes.yaml: `name: { path, controller, methods }`; `name: { resource, type: attribute, prefix }`.
  for (const pair of root.items) {
    const name = isScalar(pair.key) ? String(pair.key.value) : null;
    if (name === null || !isMap(pair.value)) continue;
    const route = pair.value.toJSON() as Record<string, unknown>;
    const position = at(pair.key as YamlNode);
    if (typeof route.path === "string" || (route.path !== null && typeof route.path === "object" && !("resource" in route))) {
      const routePath = typeof route.path === "string" ? route.path : null;
      const controller = typeof route.controller === "string" ? route.controller : typeof (route.defaults as Record<string, unknown> | undefined)?._controller === "string" ? ((route.defaults as Record<string, unknown>)._controller as string) : null;
      if (routePath === null || controller === null) {
        hole(pair, name, `route \`${name}\`: its path or controller is written in a form keylang does not read`);
        continue;
      }
      const [klass, method] = controller.split("::");
      const methods = Array.isArray(route.methods) ? route.methods.filter((m): m is string => typeof m === "string") : typeof route.methods === "string" ? route.methods.split("|") : [];
      for (const m of methods.length > 0 ? methods.map((x) => x.toUpperCase()) : [null]) {
        facts.entries!.push({ kind: "route", label: m === null ? routePath : `${m} ${routePath}`, files: [], fn: method || "__invoke", type: type(className(klass!)), ...(m !== null ? { method: m } : {}), ...position });
      }
      continue;
    }
    const resource = route.resource;
    const dir = typeof resource === "string" ? resource : resource !== null && typeof resource === "object" && typeof (resource as Record<string, unknown>).path === "string" ? ((resource as Record<string, unknown>).path as string) : null;
    if (dir === null) continue;
    const prefix = typeof route.prefix === "string" ? route.prefix : "";
    if (route.type === "attribute" || route.type === "annotation") {
      if (dir.endsWith(".php") || dir.startsWith("@")) continue;
      facts.routePrefixes!.push({ dir: posix.normalize(posix.join(posix.dirname(path), dir)).replace(/\/$/, ""), prefix, ...position });
    } else if (route.prefix !== null && typeof route.prefix === "object") hole(pair, name, `route import \`${name}\`: a prefix per locale is not read`);
  }
  return facts;
}

/** `'@App\Infra\Mailer'` → the class; `@?x`, `@=expr`, a service id that is no class → null. */
function serviceRef(value: string): string | null {
  if (!value.startsWith("@") || value.startsWith("@?") || value.startsWith("@=") || value.startsWith("@@")) return null;
  const name = value.slice(1);
  return CLASS_NAME.test(name) ? className(name) : null;
}

/** `$param: '@C'` (or `I $param: '@C'`) of `arguments` or `bind`: the constructor argument `param` of `owner` is a `C`. */
function argument(facts: ConfigFacts, owner: string, pair: Pair, at: (node: YamlNode | Pair | null | undefined) => { line: number; col: number }, hole: (node: YamlNode | Pair | null | undefined, text: string, reason: string) => void): void {
  const name = isScalar(pair.key) ? String(pair.key.value) : null;
  const param = name === null ? null : /(?:^|\s)\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(name)?.[1] ?? null;
  if (param === null) return;
  const value = pair.value as YamlNode | null;
  if (!isScalar(value) || typeof value.value !== "string" || !value.value.startsWith("@")) return;
  const target = serviceRef(value.value);
  if (target === null) {
    hole(pair, `${name}: ${value.value}`, `the argument \`$${param}\` is \`${value.value}\`, a service keylang does not resolve to a class`);
    return;
  }
  facts.arguments.push({ type: type(owner), param, value: type(target), ...at(pair.key as YamlNode) });
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
