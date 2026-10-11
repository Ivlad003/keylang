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
//
// Pipeline: config side of the framework adapters (detect → files → parse);
// the facts become bindings, constructor arguments, route entries and holes
// on the graph. Entry points: `symfony`, `parseSymfonyConfig`.

import { posix } from "node:path";
import { isMap, isNode, isScalar, isSeq, LineCounter, parseDocument, type Node as YamlNode, type Pair, type Scalar, type YAMLMap } from "yaml";
import { isJsonObject, isJsonString, parseJson, type JsonObject, type JsonValue } from "../json.ts";
import type { ConfigAt, ConfigFacts, EntryConfigFact, FrameworkAdapter, TypeName } from "./adapter.ts";

/** `EVERY_CLASS` of `./adapter.ts`, written out: the adapter imports this module, so it imports no value back. */
const EVERY_CLASS = "*";

/** A type reference by class name, the form adapter facts use. */
const type = (name: string): TypeName => ({ name });

/** PHP class names compare without ASCII case. */
const key = (name: string): string => name.replace(/^\\+/, "").replace(/[A-Z]+/g, (letters) => letters.toLowerCase());

/** `config/services.*` or `config/services_<env>.*`; group 1 is the format. */
const SERVICES = /^config\/services(?:_[A-Za-z0-9]+)?\.(yaml|yml|xml|php)$/;

/** `config/routes.*` or one file under `config/routes/`; group 1 is the format. */
const ROUTES = /^config\/routes(?:\/[^/]+)?\.(yaml|yml|xml|php)$/;

export const symfony: FrameworkAdapter = {
  name: "symfony",
  version: "1",
  detect(context) {
    const composer = readJson(context.read("composer.json"));

    for (const field of ["require", "require-dev"]) {
      const deps = isJsonObject(composer) ? composer[field] : undefined;

      if (isJsonObject(deps) && ("symfony/framework-bundle" in deps || "symfony/symfony" in deps)) return true;
    }

    return context.read("config/bundles.php") !== null;
  },
  files(context) {
    // A config directory is not listed by the analysis: the names Symfony and its recipes use.
    const names = ["services", "services_dev", "services_test", "services_prod", "routes", "routes/attributes", "routes/annotations"].flatMap((n) => ["yaml", "yml", "xml", "php"].map((ext) => `config/${n}.${ext}`));
    const out: { path: string; owner: string | null }[] = [];

    // The well-known names plus any matching source path, deduplicated; only files that exist and are analysed.
    for (const path of new Set([...names, ...context.sources.filter((p) => SERVICES.test(p) || ROUTES.test(p))])) if (context.analysed(path) && context.read(path) !== null) out.push({ path, owner: null });

    // Sorted by path (code units) so the config file order is stable.
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  parse: parseSymfonyConfig,
};

/** Parse a JSON file, tolerating a BOM; missing or malformed JSON is `null`. */
function readJson(text: string | null): JsonValue {
  if (text === null) return null;

  try {
    return parseJson(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

/** A class name as a Symfony config writes it: no leading `\`, single separators. */
function className(written: string): string {
  return written.trim().replace(/\\+/g, "\\").replace(/^\\/, "");
}

/** A namespaced PHP class name (at least one `\`), optionally fully qualified; a bare service id does not match. */
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

  // Only YAML is read; XML and PHP configs become an error, i.e. a hole of the snapshot.
  if (!/\.ya?ml$/.test(path)) return { ...facts, error: { line: 1, reason: `\`${path}\` is Symfony config keylang does not read (only YAML is): what it wires is unknown` } };
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, uniqueKeys: false });

  if (doc.errors.length > 0) {
    const first = doc.errors[0]!;

    return { ...facts, error: { line: first.linePos?.[0]?.line ?? 1, reason: `\`${path}\` is no YAML: ${first.message.split("\n")[0]}` } };
  }

  // Source position of a YAML node or pair (its key when a pair), 1-based, for diagnostics.
  const at = (node: YamlNode | Pair | null | undefined): ConfigAt => {
    const range = node && "range" in node ? node.range : node && "key" in node && isNode(node.key) ? node.key.range : null;
    const pos = range ? counter.linePos(range[0]) : { line: 1, col: 1 };

    return { line: pos.line, col: pos.col };
  };

  const hole = (node: YamlNode | Pair | null | undefined, text: string, reason: string): void => {
    facts.holes!.push({ ...at(node), text, reason });
  };

  const root = doc.contents;

  if (!isMap(root)) return facts;

  // services.yaml: walk each service definition under `services:`.
  if (SERVICES.test(path)) {
    const services = root.items.find((p) => isScalar(p.key) && p.key.value === "services")?.value;

    if (!isMap(services)) return facts;

    for (const pair of services.items) {
      const keyNode = isScalar(pair.key) ? pair.key : null;

      if (keyNode === null) continue;
      const id = String(keyNode.value);
      const value = isNode(pair.value) ? pair.value : null;

      // `_defaults.bind` applies to every class.
      if (id === "_defaults") {
        const bind = isMap(value) ? value.items.find((p) => isScalar(p.key) && p.key.value === "bind")?.value : null;

        if (isMap(bind)) for (const b of bind.items) argument(facts, EVERY_CLASS, b, at, hole);
        continue;
      }

      // Other `_…` keys (`_instanceof`) and resource prefixes (`App\:`) define no single service.
      if (id.startsWith("_") || id.endsWith("\\")) continue;

      // `I: '@C'`: an alias.
      if (isTextScalar(value)) {
        const target = serviceRef(value.value);

        if (target !== null && CLASS_NAME.test(id)) facts.bindings.push({ from: type(className(id)), to: type(target), ...at(keyNode) });
        continue;
      }

      if (!isMap(value)) continue;

      const field = (name: string): YamlNode | null => {
        const found = value.items.find((p) => isScalar(p.key) && p.key.value === name)?.value;

        return isNode(found) ? found : null;
      };

      // `alias:` binds the id to another class; a `class:` different from the id binds the id (an interface) to it.
      const alias = field("alias");
      const klass = field("class");

      if (isTextScalar(alias) && CLASS_NAME.test(id)) facts.bindings.push({ from: type(className(id)), to: type(className(alias.value.replace(/^@/, ""))), ...at(keyNode) });
      else if (isTextScalar(klass) && CLASS_NAME.test(id) && key(className(klass.value)) !== key(className(id))) facts.bindings.push({ from: type(className(id)), to: type(className(klass.value)), ...at(keyNode) });
      // Constructor arguments belong to the service's class: `class:` if written, else the id when it is a class name.
      const owner = isTextScalar(klass) ? className(klass.value) : CLASS_NAME.test(id) ? className(id) : null;

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
    const keyNode = isScalar(pair.key) ? pair.key : null;

    if (keyNode === null || !isMap(pair.value)) continue;
    const name = String(keyNode.value);
    const route = mapJson(pair.value);
    const position = at(keyNode);

    // A route definition (it has a path and no `resource`): one entry per HTTP method, or one for any method.
    if (isJsonString(route.path) || (isStructured(route.path) && !("resource" in route))) {
      const routePath = isJsonString(route.path) ? route.path : null;
      const controller = isJsonString(route.controller) ? route.controller : isJsonObject(route.defaults) && isJsonString(route.defaults._controller) ? route.defaults._controller : null;

      if (routePath === null || controller === null) {
        hole(pair, name, `route \`${name}\`: its path or controller is written in a form keylang does not read`);
        continue;
      }

      const [klass, method] = controller.split("::");
      const methods = Array.isArray(route.methods) ? route.methods.filter(isJsonString) : isJsonString(route.methods) ? route.methods.split("|") : [];

      for (const m of methods.length > 0 ? methods.map((x) => x.toUpperCase()) : [null]) {
        const entry: Omit<EntryConfigFact, keyof ConfigAt> = { kind: "route", label: m === null ? routePath : `${m} ${routePath}`, files: [], fn: method || "__invoke", type: type(className(klass!)) };

        if (m !== null) entry.method = m;
        facts.entries!.push({ ...entry, ...position });
      }

      continue;
    }

    // Otherwise a route import: an attribute import of a directory gives a prefix for the routes found in it.
    const resource = route.resource;
    const dir = isJsonString(resource) ? resource : isJsonObject(resource) && isJsonString(resource.path) ? resource.path : null;

    if (dir === null) continue;
    const prefix = isJsonString(route.prefix) ? route.prefix : "";

    if (route.type === "attribute" || route.type === "annotation") {
      // A single file or a bundle path (`@…Bundle`) is no directory of this project.
      if (dir.endsWith(".php") || dir.startsWith("@")) continue;
      facts.routePrefixes!.push({ dir: posix.normalize(posix.join(posix.dirname(path), dir)).replace(/\/$/, ""), prefix, ...position });
    } else if (isStructured(route.prefix)) hole(pair, name, `route import \`${name}\`: a prefix per locale is not read`);
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
  const keyNode = isScalar(pair.key) ? pair.key : null;
  const name = keyNode === null ? null : String(keyNode.value);
  // The key ends with `$param`, optionally after a type (`Psr\Log\LoggerInterface $logger`).
  const param = name === null ? null : /(?:^|\s)\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(name)?.[1] ?? null;

  if (param === null) return;
  const value = isNode(pair.value) ? pair.value : null;

  // Only service references (`@…`) are bindings; scalars and parameters are values keylang ignores.
  if (!isTextScalar(value) || !value.value.startsWith("@")) return;
  const target = serviceRef(value.value);

  if (target === null) {
    hole(pair, `${name}: ${value.value}`, `the argument \`$${param}\` is \`${value.value}\`, a service keylang does not resolve to a class`);

    return;
  }

  facts.arguments.push({ type: type(owner), param, value: type(target), ...at(keyNode) });
}

/** A YAML scalar whose value is a string: a class name, a service reference. */
function isTextScalar(node: YamlNode | null): node is Scalar<string> {
  return isScalar(node) && typeof node.value === "string";
}

/** A route field written as a map or a list: a form keylang does not read where it expects a string. */
function isStructured(value: JsonValue | undefined): boolean {
  return isJsonObject(value) || Array.isArray(value);
}

/** A route of `routes.yaml` as plain data. */
function mapJson(map: YAMLMap): JsonObject {
  // SAFETY: `toJSON` of a YAML map under the default core schema yields a plain object of strings, numbers, booleans, nulls, lists and objects.
  return map.toJSON() as JsonObject;
}
