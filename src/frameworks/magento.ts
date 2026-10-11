// The Magento adapter: the config Magento executes, in every module and area.
// A module is a directory whose `registration.php` registers a
// `ComponentRegistrar::MODULE`; its `etc/<file>` applies everywhere
// (`global`), `etc/<area>/<file>` in one area (`frontend`, `adminhtml`,
// `webapi_rest`…). XML is read with a parser (ADR 0002), never with
// patterns, so line numbers are the parser's.
//
// `di.xml` (business-flows 06, 07, 10):
// - `<preference for="I" type="C"/>`: a binding `I → C`.
// - `<type name="X"><arguments><argument name="p" xsi:type="object">Y</argument>`:
//   the constructor parameter `p` of `X` receives a `Y`.
// - `<virtualType name="V" type="C">`: `V` is `C` with arguments of its own.
// - `<type name="X"><plugin name="p" type="P" sortOrder="10" disabled="true"/>`:
//   `P::beforeM`, `aroundM`, `afterM` wrap every public method `m` of `X`.
// - the `commands` items of `Magento\Framework\Console\CommandList`: console commands (`cli`).
//
// Events and entry points (business-flows 08, 10):
// - `events.xml` `<event name><observer name instance method? disabled?>`: observers.
// - `<area>/routes.xml` `<router><route frontName><module name/>`: the controllers of a URL prefix.
// - `webapi.xml` `<route url method><service class method><resources>`: REST routes.
// - `crontab.xml` `<group><job name instance method><schedule>|<config_path>`: cron jobs.
// - `queue_consumer.xml` `<consumer name queue handler="C::m">`: queue consumers.
// - `schema.graphqls` `@resolver(class: "C")` on a field: GraphQL resolvers.
//
// A class name is written with or without the leading `\`; `Foo\Proxy` is the
// proxy Magento generates for `Foo`, which forwards every call to it.
//
// Generated factories (business-flows 40): for a class `X`, the ObjectManager's
// code generator (`Magento\Framework\ObjectManager\Code\Generator\Factory`)
// writes `XFactory` with `create(array $data = []): X` when no file declares
// it. keylang applies the convention only to a factory no file it reads
// declares, beside a class (or interface) `X` it reads: `create()` is then an
// edge `via: generated-factory` to `X` and gives an `X`. A factory of a class
// keylang has not read stays a hole: nothing says what it makes.
//
// The ObjectManager (business-flows 40): `$objectManager->get(X::class)`,
// `->create(X::class)` and `ObjectManager::getInstance()->get('Vendor\X')`
// give an `X` — of the class a preference binds it to, for an interface. The
// call is an edge `via: object-manager` to that class; a class named any other
// way (a variable, a concatenation) stays unknown. Components `outside` the
// architecture give their `di.xml` preferences only (not plugins, observers,
// arguments or entry points): what class a value of their interface is.
//
// Pipeline: config side of the framework adapters (detect → files → parse);
// the facts go to `bindings.ts` and `entries.ts` on the graph. Entry points:
// `magento` and the per-file parsers (`parseDi`, `parseEvents`, `parseRoutes`,
// `parseWebapi`, `parseCrontab`, `parseConsumers`, `parseGraphql`), plus `parseXml`.

import { posix } from "node:path";
import { SaxesParser } from "saxes";
import type { ConfigFacts, FrameworkAdapter, FrameworkContext, FrameworkModule, TypeName } from "./adapter.ts";

/** `ComponentRegistrar::register(ComponentRegistrar::MODULE, …)`, however it is spaced or qualified. */
const MODULE_REGISTRATION = /ComponentRegistrar\s*::\s*register\s*\(\s*\\?(?:[A-Za-z_][A-Za-z0-9_]*\\)*ComponentRegistrar\s*::\s*MODULE\b/;

/** Any component registration: a module, a library, a theme. */
const REGISTRATION = /ComponentRegistrar\s*::\s*register\s*\(/;

/** `'Vendor_Module'` in a module's registration. */
const MODULE_NAME = /ComponentRegistrar\s*::\s*MODULE\s*,\s*(['"])([A-Za-z0-9_]+)\1/;

/** The application's own config, outside any module. */
const APP_DI = "app/etc/di.xml";

/** Config files of a module read in `etc/` and in every area: `etc/<name>`, `etc/<area>/<name>`. */
const AREA_FILES = ["di.xml", "events.xml", "routes.xml"];

/** Config files of a module read only in `etc/` itself. */
const GLOBAL_FILES = ["webapi.xml", "crontab.xml", "queue_consumer.xml", "schema.graphqls"];

/** The class whose `commands` argument lists the console commands. */
const COMMAND_LIST = "Magento\\Framework\\Console\\CommandList";

/** Namespace prefix of Magento's HTTP action interfaces, which give a controller its HTTP method. */
const ACTION = "Magento\\Framework\\App\\Action\\";

export const magento: FrameworkAdapter = {
  name: "magento",
  version: "2",
  detect(context) {
    return context.read(APP_DI) !== null || componentRoots(context, MODULE_REGISTRATION).length > 0;
  },
  files(context) {
    const out: { path: string; owner: string | null; declarations?: true }[] = [];

    const add = (path: string, owner: string | null): void => {
      if (context.analysed(path) && context.read(path) !== null) out.push({ path, owner });
    };

    add(APP_DI, null);

    // Named in `frameworks` or detected: every registered component's config is read.
    // Per component: each config file in `etc/`, then the area-specific files in each `etc/<area>/`.
    for (const root of componentRoots(context, REGISTRATION)) {
      const etc = root === "" ? "etc" : `${root}/etc`;

      for (const file of [...AREA_FILES, ...GLOBAL_FILES]) add(`${etc}/${file}`, root);

      for (const area of context.dirs(etc)) for (const file of AREA_FILES) add(`${etc}/${area}/${file}`, root);
    }

    // A component `outside` the architecture (business-flows 40): only its `di.xml`, of which the graph takes the preferences.
    for (const root of componentRoots(context, REGISTRATION, context.outside)) {
      const etc = root === "" ? "etc" : `${root}/etc`;

      const declare = (path: string): void => {
        if (context.isOutside(path) && context.read(path) !== null) out.push({ path, owner: root, declarations: true });
      };

      declare(`${etc}/di.xml`);

      for (const area of context.dirs(etc)) declare(`${etc}/${area}/di.xml`);
    }

    // Sorted by path (code units) so the config file order is stable.
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  parse(path, text) {
    // Dispatch by file name; any other listed file is a `di.xml`.
    switch (posix.basename(path)) {
      case "events.xml":
        return parseEvents(path, text);
      case "routes.xml":
        return parseRoutes(path, text);
      case "webapi.xml":
        return parseWebapi(path, text);
      case "crontab.xml":
        return parseCrontab(path, text);
      case "queue_consumer.xml":
        return parseConsumers(path, text);
      case "schema.graphqls":
        return parseGraphql(path, text);
      default:
        return parseDi(path, text);
    }
  },
  modules(context) {
    const out: FrameworkModule[] = [];

    for (const path of context.sources) {
      if (posix.basename(path) !== "registration.php") continue;
      const name = MODULE_NAME.exec(context.read(path) ?? "")?.[2];

      if (name !== undefined) out.push({ name, dir: posix.dirname(path) === "." ? "" : posix.dirname(path) });
    }

    // By name, then directory: a module name can appear in more than one place (vendor and app/code).
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
  },
  dispatchers: ["Magento\\Framework\\Event\\ManagerInterface", "Magento\\Framework\\Event\\Manager"],
  generated: [{ suffix: "Factory", method: "create" }],
  locators: [{ types: ["Magento\\Framework\\ObjectManagerInterface", "Magento\\Framework\\ObjectManager\\ObjectManager", "Magento\\Framework\\App\\ObjectManager"], methods: ["get", "create"] }],
  controllers: {
    dir: (area) => (area === "adminhtml" ? "Controller/Adminhtml" : "Controller"),
    prefix: (area) => (area === "adminhtml" ? "/admin" : ""),
    member: "execute",
    methods: {
      [`${ACTION}HttpGetActionInterface`]: "GET",
      [`${ACTION}HttpPostActionInterface`]: "POST",
      [`${ACTION}HttpPutActionInterface`]: "PUT",
      [`${ACTION}HttpDeleteActionInterface`]: "DELETE",
      [`${ACTION}HttpPatchActionInterface`]: "PATCH",
      [`${ACTION}HttpHeadActionInterface`]: "HEAD",
      [`${ACTION}HttpOptionsActionInterface`]: "OPTIONS",
    },
  },
};

/** Directories of the `registration.php` files of `files` (the analysed sources) whose text registers a component as `pattern` says. */
function componentRoots(context: FrameworkContext, pattern: RegExp, files: readonly string[] = context.sources): string[] {
  const roots: string[] = [];

  for (const path of files) {
    if (posix.basename(path) !== "registration.php") continue;
    const text = context.read(path);

    if (text !== null && pattern.test(text)) roots.push(posix.dirname(path) === "." ? "" : posix.dirname(path));
  }

  return roots;
}

/** `etc/di.xml` → `global`; `etc/frontend/di.xml` → `frontend`. */
function scopeOf(path: string): string {
  const parts = path.split("/");
  const etc = parts.lastIndexOf("etc");

  // Only `…/etc/<area>/<file>` (the `etc` is third from the end) is area-scoped.
  return etc !== -1 && etc === parts.length - 3 ? parts[etc + 1]! : "global";
}

/** A class name as Magento resolves it: no leading `\`, no spaces; a generated proxy stands for its class. */
export function className(written: string): string {
  return written.replace(/\s+/g, "").replace(/^\\+/, "").replace(/\\Proxy$/, "");
}

/** The facts of a Magento config file: every kind it may hold is present. */
type MagentoFacts = ConfigFacts & Required<Pick<ConfigFacts, "observers" | "classEntries" | "routes">>;

/** The `ConfigFacts` of a file with no facts, and the reason when it gave none. */
function noFacts(path: string, scope: string, error: ConfigFacts["error"] = null): MagentoFacts {
  return { path, scope, bindings: [], arguments: [], aliases: [], intercepts: [], observers: [], classEntries: [], routes: [], error };
}

/** A `TypeName` from a class name as the config writes it. */
function type(name: string): TypeName {
  return { name: className(name) };
}

/** An element of a config file, with where its start tag is and the text directly in it. */
export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  line: number;
  col: number;
  text: string;
  children: XmlElement[];
}

/** The root element of an XML file, or why it does not parse. */
export function parseXml(path: string, text: string): { root: XmlElement | null; error: { line: number; reason: string } | null } {
  const parser = new SaxesParser({ position: true, xmlns: false });
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let start = { line: 1, col: 1 };
  let error: { line: number; reason: string } | null = null;
  // Remember where each start tag begins: saxes reports the position after the name, so step back over `<name`.
  parser.on("opentagstart", (tag) => {
    start = { line: parser.line, col: Math.max(1, parser.column - tag.name.length - 1) };
  });
  // Build the element tree with a stack: the first top-level element is the root.
  parser.on("opentag", (tag) => {
    const element: XmlElement = { name: tag.name, attributes: tag.attributes, line: start.line, col: start.col, text: "", children: [] };
    const parent = stack.at(-1);

    if (parent) parent.children.push(element);
    else root ??= element;
    stack.push(element);
  });
  parser.on("text", (t) => {
    const top = stack.at(-1);

    if (top) top.text += t;
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  // Keep the first error only; saxes may report several after the first fault.
  parser.on("error", (e) => {
    error ??= { line: parser.line, reason: `\`${path}\` is no well-formed XML: ${e.message.replace(/^\d+:\d+: /, "")}` };
  });

  try {
    parser.write(text).close();
  } catch (e) {
    error ??= { line: parser.line, reason: `\`${path}\` is no well-formed XML: ${e instanceof Error ? e.message : String(e)}` };
  }

  return error ? { root: null, error } : { root, error: null };
}

/** The facts of an XML config file: `read` takes them from the root element. A file that does not parse gives none, only the reason. */
function fromXml(path: string, text: string, read: (root: XmlElement, facts: MagentoFacts) => void): ConfigFacts {
  const facts = noFacts(path, scopeOf(path));
  const { root, error } = parseXml(path, text);

  if (error) return noFacts(path, facts.scope, error);

  if (root) read(root, facts);

  return facts;
}

/** The direct children of an element with a given tag name, in document order. */
function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

/** `true` or `1` in an attribute Magento reads as a boolean. */
function flag(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/** The facts of one `di.xml`. */
export function parseDi(path: string, text: string): ConfigFacts {
  return fromXml(path, text, (root, facts) => {
    // Each top-level `preference`, `virtualType` or `type` of di.xml; a virtualType also carries plugins and arguments.
    for (const top of root.children) {
      const at = { line: top.line, col: top.col };

      if (top.name === "preference" && top.attributes.for && top.attributes.type) {
        facts.bindings.push({ from: type(top.attributes.for), to: type(top.attributes.type), ...at });
        continue;
      }

      if (top.name === "virtualType" && top.attributes.name && top.attributes.type) facts.aliases.push({ name: className(top.attributes.name), type: type(top.attributes.type), ...at });

      if ((top.name !== "type" && top.name !== "virtualType") || !top.attributes.name) continue;
      const holder = top.attributes.name;

      for (const plugin of childrenNamed(top, "plugin")) {
        if (!plugin.attributes.name) continue;
        const order = plugin.attributes.sortOrder === undefined ? null : Number.parseInt(plugin.attributes.sortOrder, 10);
        facts.intercepts.push({
          target: type(holder),
          name: plugin.attributes.name,
          plugin: plugin.attributes.type ? type(plugin.attributes.type) : null,
          sortOrder: order === null || Number.isNaN(order) ? null : order,
          disabled: flag(plugin.attributes.disabled),
          line: plugin.line,
          col: plugin.col,
        });
      }

      // Object arguments are constructor bindings; `CommandList`'s `commands` items are console commands.
      for (const argument of childrenNamed(top, "arguments").flatMap((a) => childrenNamed(a, "argument"))) {
        if (!argument.attributes.name) continue;

        if (argument.attributes["xsi:type"] === "object") {
          const value = argument.text.trim();

          if (value) facts.arguments.push({ type: type(holder), param: argument.attributes.name, value: type(value), line: argument.line, col: argument.col });
        } else if (top.name === "type" && className(holder) === COMMAND_LIST && argument.attributes.name === "commands") {
          for (const item of childrenNamed(argument, "item")) {
            const value = item.text.trim();

            if (item.attributes["xsi:type"] === "object" && value) facts.classEntries.push({ kind: "cli", label: item.attributes.name ?? className(value), target: type(value), method: "execute", line: item.line, col: item.col });
          }
        }
      }
    }
  });
}

/** `etc/events.xml`: `<event name="e"><observer name="o" instance="C" method="m" disabled="true"/>`. */
export function parseEvents(path: string, text: string): ConfigFacts {
  return fromXml(path, text, (root, facts) => {
    for (const event of childrenNamed(root, "event")) {
      const name = event.attributes.name?.trim();

      if (!name) continue;

      for (const observer of childrenNamed(event, "observer")) {
        const id = observer.attributes.name?.trim();

        if (!id) continue;
        const instance = observer.attributes.instance?.trim();
        const method = observer.attributes.method?.trim();
        facts.observers.push({ event: name, name: id, instance: instance ? type(instance) : null, method: method ? method : null, disabled: flag(observer.attributes.disabled), line: observer.line, col: observer.col });
      }
    }
  });
}

/** `etc/<area>/routes.xml`: `<router id="standard"><route id="checkout" frontName="checkout"><module name="Magento_Checkout"/>`. */
export function parseRoutes(path: string, text: string): ConfigFacts {
  return fromXml(path, text, (root, facts) => {
    for (const router of childrenNamed(root, "router")) {
      for (const route of childrenNamed(router, "route")) {
        const id = route.attributes.id?.trim() ?? "";
        // A route without `frontName` is served under its id.
        const frontName = route.attributes.frontName?.trim() || id;

        if (!frontName) continue;
        const modules = childrenNamed(route, "module").flatMap((m) => (m.attributes.name ? [m.attributes.name.trim()] : []));
        facts.routes.push({ router: router.attributes.id ?? "", id, frontName, modules, line: route.line, col: route.col });
      }
    }
  });
}

/** `etc/webapi.xml`: `<route url="/V1/x" method="POST"><service class="I" method="m"/><resources><resource ref="self"/>` → `rest`, labelled `POST /V1/x [self]`. */
export function parseWebapi(path: string, text: string): ConfigFacts {
  return fromXml(path, text, (root, facts) => {
    for (const route of childrenNamed(root, "route")) {
      const service = childrenNamed(route, "service")[0];
      const url = route.attributes.url?.trim();
      const cls = service?.attributes.class?.trim();
      const method = service?.attributes.method?.trim();

      if (!url || !cls || !method) continue;

      const resources = childrenNamed(route, "resources")
        .flatMap((r) => childrenNamed(r, "resource"))
        .flatMap((r) => (r.attributes.ref ? [r.attributes.ref.trim()] : []));

      const label = `${(route.attributes.method ?? "GET").trim().toUpperCase()} ${url}${resources.length > 0 ? ` [${resources.join(", ")}]` : ""}`;
      facts.classEntries.push({ kind: "rest", label, target: type(cls), method, line: route.line, col: route.col });
    }
  });
}

/**
 * `etc/crontab.xml`: `<group id="default"><job name="n" instance="C" method="m"><schedule>0 0 * * *</schedule>`
 * → `cron`, labelled `n 0 0 * * *` (the schedule last, as `every` reads it); a job the admin's
 * config schedules says `(config_path …)` instead.
 */
export function parseCrontab(path: string, text: string): ConfigFacts {
  return fromXml(path, text, (root, facts) => {
    for (const group of childrenNamed(root, "group")) {
      for (const job of childrenNamed(group, "job")) {
        const name = job.attributes.name?.trim();
        const instance = job.attributes.instance?.trim();

        if (!name || !instance) continue;
        const schedule = childrenNamed(job, "schedule")[0]?.text.trim().replace(/\s+/g, " ");
        const configPath = childrenNamed(job, "config_path")[0]?.text.trim();
        const when = schedule ? ` ${schedule}` : configPath ? ` (config_path ${configPath})` : "";
        facts.classEntries.push({ kind: "cron", label: `${name}${when}`, target: type(instance), method: job.attributes.method?.trim() || "execute", line: job.line, col: job.col });
      }
    }
  });
}

/**
 * `etc/queue_consumer.xml`: `<consumer name="n" queue="q" handler="C::m"/>` → `consumer` on `C::m`;
 * without a handler, the `consumerInstance`'s `process`.
 */
export function parseConsumers(path: string, text: string): ConfigFacts {
  return fromXml(path, text, (root, facts) => {
    for (const consumer of childrenNamed(root, "consumer")) {
      const name = consumer.attributes.name?.trim();

      if (!name) continue;
      const queue = consumer.attributes.queue?.trim();
      const label = queue && queue !== name ? `${name} (queue ${queue})` : name;
      const handler = consumer.attributes.handler?.trim();
      // `handler="C::m"` names the method; without it, the consumer instance's `process` runs.
      const [cls, method] = handler ? handler.split("::") : [consumer.attributes.consumerInstance?.trim(), "process"];

      if (!cls) continue;
      facts.classEntries.push({ kind: "consumer", label, target: type(cls), method: method?.trim() || "process", line: consumer.line, col: consumer.col });
    }
  });
}

/** A GraphQL name, matched sticky at `lastIndex`. */
const IDENT = /[_A-Za-z][_0-9A-Za-z]*/y;

/** `@resolver(class: "…")` matched sticky at `lastIndex`; group 1 is the class as an SDL string (backslashes escaped). */
const RESOLVER = /@resolver\s*\(\s*class\s*:\s*"((?:[^"\\]|\\.)*)"/y;

/**
 * `etc/schema.graphqls`: a field with `@resolver(class: "C")` → `graphql` on
 * `C::resolve`, labelled `Type.field`. A small scanner over the SDL (no XML,
 * no parser package for it): comments, strings, braces and parentheses; a
 * field is a name followed by `(` or `:` right inside a type's braces.
 */
export function parseGraphql(path: string, text: string): ConfigFacts {
  const facts = noFacts(path, scopeOf(path));
  let line = 1;
  let col = 1;
  let braces = 0;
  let parens = 0;
  let typeName: string | null = null;
  let expectType = false;
  let field: string | null = null;
  let i = 0;

  // Advance the cursor to `to`, keeping the 1-based line and column of `i` in step.
  const moveTo = (to: number): void => {
    for (; i < to; i++) {
      if (text[i] === "\n") {
        line++;
        col = 1;
      } else col++;
    }
  };

  // One token per iteration. State: brace and paren depth, the current type
  // (after `type`/`interface`/`input` at depth 0) and the latest field name at depth 1.
  while (i < text.length) {
    const ch = text[i]!;

    // A comment runs to the end of the line.
    if (ch === "#") {
      const end = text.indexOf("\n", i);
      moveTo(end === -1 ? text.length : end);
      continue;
    }

    // A string or `"""` block string (descriptions): skip it whole, honouring escapes.
    if (ch === '"') {
      const block = text.startsWith('"""', i);
      let j = i + (block ? 3 : 1);

      while (j < text.length && !(block ? text.startsWith('"""', j) : text[j] === '"' || text[j] === "\n")) j += text[j] === "\\" ? 2 : 1;
      moveTo(Math.min(text.length, j + (block ? 3 : 1)));
      continue;
    }

    // A directive: a resolver on a field directly inside a type's braces (not inside its arguments) is an entry.
    if (ch === "@") {
      RESOLVER.lastIndex = i;
      const found = RESOLVER.exec(text);

      if (found && braces === 1 && parens === 0 && typeName !== null && field !== null) {
        facts.classEntries.push({ kind: "graphql", label: `${typeName}.${field}`, target: type(found[1]!.replace(/\\\\/g, "\\")), method: "resolve", line, col });
      }

      // The directive's own name is no field.
      IDENT.lastIndex = i + 1;
      moveTo(IDENT.exec(text) ? IDENT.lastIndex : i + 1);
      continue;
    }

    // A name: at depth 0 it may introduce or name a type; at depth 1 it is a field when `(` or `:` follows.
    if (/[_A-Za-z]/.test(ch)) {
      IDENT.lastIndex = i;
      const word = IDENT.exec(text)![0];
      const end = IDENT.lastIndex;

      if (braces === 0 && parens === 0) {
        if (expectType) {
          typeName = word;
          expectType = false;
        } else if (word === "type" || word === "interface" || word === "input") expectType = true;
      } else if (braces === 1 && parens === 0) {
        const next = /\S/.exec(text.slice(end, end + 200))?.[0];

        if (next === "(" || next === ":") field = word;
      }

      moveTo(end);
      continue;
    }

    // Punctuation adjusts the depth; leaving a type's braces forgets the type and field.
    if (ch === "{") braces++;
    else if (ch === "}") {
      braces = Math.max(0, braces - 1);

      if (braces === 0) {
        typeName = null;
        field = null;
      }
    } else if (ch === "(") parens++;
    else if (ch === ")") parens = Math.max(0, parens - 1);
    moveTo(i + 1);
  }

  return facts;
}
