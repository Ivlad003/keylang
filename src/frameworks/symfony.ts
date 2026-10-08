// The Symfony adapter (ADR 0022; business-flows 36). The container is written
// in `config/services.yaml` (and `services_<env>.yaml`): an alias
// `I: '@C'` or `I: { alias: C }` binds an interface, `arguments: { $p: '@C' }`
// sets a constructor argument of one service, `bind: { $p: '@C' }` (under
// `_defaults` for every service) a named argument. Routes, listeners,
// Messenger handlers, commands and scheduled tasks are PHP attributes the
// extractor records (`#[Route]`, `#[AsEventListener]`, `#[AsMessageHandler]`,
// `#[AsCommand]`, `#[AsCronTask]`, `#[AsPeriodicTask]`, `#[AsAlias]`) or an
// `EventSubscriberInterface::getSubscribedEvents()` returning a literal
// array, read from the extractor's facts by `src/framework-code/symfony.ts`;
// `config/routes.yaml` adds routes and a prefix for the attribute routes of
// a directory. YAML is read with a parser (`yaml`), positions are
// its. XML and PHP service or route configs are listed and left unread: a
// hole with the reason, never a guess.
//
// Detected from `symfony/framework-bundle` in the root `composer.json`, or a
// `config/bundles.php`.

import { posix } from "node:path";
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node as YamlNode, type Pair } from "yaml";
import type { ConfigFacts, FrameworkAdapter, TypeName } from "./adapter.ts";

/** `EVERY_CLASS` of `./adapter.ts`, written out: the adapter imports this module, so it imports no value back. */
const EVERY_CLASS = "*";

const type = (name: string): TypeName => ({ name });
/** PHP class names compare without ASCII case. */
const key = (name: string): string => name.replace(/^\\+/, "").replace(/[A-Z]+/g, (letters) => letters.toLowerCase());

const SERVICES = /^config\/services(?:_[A-Za-z0-9]+)?\.(yaml|yml|xml|php)$/;
const ROUTES = /^config\/routes(?:\/[^/]+)?\.(yaml|yml|xml|php)$/;

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
