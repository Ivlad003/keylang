// The Magento adapter: `etc/di.xml` of every module, in every area. A module
// is a directory whose `registration.php` registers a `ComponentRegistrar::MODULE`;
// its `etc/di.xml` applies everywhere (`global`), `etc/<area>/di.xml` in one
// area (`frontend`, `adminhtml`, `webapi_rest`…). Read with an XML parser
// (ADR 0002), never with patterns, so line numbers are the parser's.
//
// - `<preference for="I" type="C"/>`: a binding `I → C`.
// - `<type name="X"><arguments><argument name="p" xsi:type="object">Y</argument>`:
//   the constructor parameter `p` of `X` receives a `Y`.
// - `<virtualType name="V" type="C">`: `V` is `C` with arguments of its own.
// - `<type name="X"><plugin name="p" type="P" sortOrder="10" disabled="true"/>`:
//   `P::beforeM`, `aroundM`, `afterM` wrap every public method `m` of `X`.
//
// A class name is written with or without the leading `\`; `Foo\Proxy` is the
// proxy Magento generates for `Foo`, which forwards every call to it.

import { posix } from "node:path";
import { SaxesParser } from "saxes";
import type { ConfigFacts, FrameworkAdapter, FrameworkContext, TypeName } from "./adapter.ts";

/** `ComponentRegistrar::register(ComponentRegistrar::MODULE, …)`, however it is spaced or qualified. */
const MODULE_REGISTRATION = /ComponentRegistrar\s*::\s*register\s*\(\s*\\?(?:[A-Za-z_][A-Za-z0-9_]*\\)*ComponentRegistrar\s*::\s*MODULE\b/;
/** Any component registration: a module, a library, a theme. */
const REGISTRATION = /ComponentRegistrar\s*::\s*register\s*\(/;
/** The application's own config, outside any module. */
const APP_DI = "app/etc/di.xml";

export const magento: FrameworkAdapter = {
  name: "magento",
  version: "1",
  detect(context) {
    return context.read(APP_DI) !== null || componentRoots(context, MODULE_REGISTRATION).length > 0;
  },
  files(context) {
    const out: { path: string; owner: string | null }[] = [];
    const add = (path: string, owner: string | null): void => {
      if (context.analysed(path) && context.read(path) !== null) out.push({ path, owner });
    };
    add(APP_DI, null);
    // Named in `frameworks` or detected: every registered component's config is read.
    for (const root of componentRoots(context, REGISTRATION)) {
      const etc = root === "" ? "etc" : `${root}/etc`;
      add(`${etc}/di.xml`, root);
      for (const area of context.dirs(etc)) add(`${etc}/${area}/di.xml`, root);
    }
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  parse: parseDi,
};

/** Directories of the analysed `registration.php` files whose text registers a component as `pattern` says. */
function componentRoots(context: FrameworkContext, pattern: RegExp): string[] {
  const roots: string[] = [];
  for (const path of context.sources) {
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
  return etc !== -1 && etc === parts.length - 3 ? parts[etc + 1]! : "global";
}

/** A class name as Magento resolves it: no leading `\`, no spaces; a generated proxy stands for its class. */
export function className(written: string): string {
  return written.replace(/\s+/g, "").replace(/^\\+/, "").replace(/\\Proxy$/, "");
}

interface Open {
  name: string;
  attributes: Record<string, string>;
  line: number;
  col: number;
  text: string;
}

/** The facts of one `di.xml`. A file that does not parse gives none, only the reason. */
export function parseDi(path: string, text: string): ConfigFacts {
  const facts: ConfigFacts = { path, scope: scopeOf(path), bindings: [], arguments: [], aliases: [], intercepts: [], error: null };
  const parser = new SaxesParser({ position: true });
  const stack: Open[] = [];
  let start = { line: 1, col: 1 };
  let error: { line: number; reason: string } | null = null;
  const type = (name: string): TypeName => ({ name: className(name) });
  parser.on("opentagstart", (tag) => {
    start = { line: parser.line, col: Math.max(1, parser.column - tag.name.length - 1) };
  });
  parser.on("opentag", (tag) => {
    const attributes = tag.attributes as Record<string, string>;
    const open: Open = { name: tag.name, attributes, line: start.line, col: start.col, text: "" };
    const owner = stack.at(-1);
    if (stack.length === 1 && tag.name === "preference" && attributes.for && attributes.type) {
      facts.bindings.push({ from: type(attributes.for), to: type(attributes.type), line: open.line, col: open.col });
    } else if (stack.length === 1 && tag.name === "virtualType" && attributes.name && attributes.type) {
      facts.aliases.push({ name: className(attributes.name), type: type(attributes.type), line: open.line, col: open.col });
    } else if (stack.length === 2 && tag.name === "plugin" && owner && (owner.name === "type" || owner.name === "virtualType") && owner.attributes.name && attributes.name) {
      const order = attributes.sortOrder === undefined ? null : Number.parseInt(attributes.sortOrder, 10);
      facts.intercepts.push({
        target: type(owner.attributes.name),
        name: attributes.name,
        plugin: attributes.type ? type(attributes.type) : null,
        sortOrder: order === null || Number.isNaN(order) ? null : order,
        disabled: attributes.disabled === "true" || attributes.disabled === "1",
        line: open.line,
        col: open.col,
      });
    }
    stack.push(open);
  });
  parser.on("text", (t) => {
    const top = stack.at(-1);
    if (top) top.text += t;
  });
  parser.on("closetag", () => {
    const open = stack.pop();
    if (!open) return;
    // `<config><type|virtualType name="X"><arguments><argument name="p" xsi:type="object">Y</argument>`.
    const typed = stack[1];
    if (open.name === "argument" && stack.length === 3 && stack[2]?.name === "arguments" && typed && (typed.name === "type" || typed.name === "virtualType") && typed.attributes.name && open.attributes.name && open.attributes["xsi:type"] === "object") {
      const value = open.text.trim();
      if (value) facts.arguments.push({ type: type(typed.attributes.name), param: open.attributes.name, value: type(value), line: open.line, col: open.col });
    }
  });
  parser.on("error", (e) => {
    error ??= { line: parser.line, reason: `\`${path}\` is no well-formed XML: ${e.message.replace(/^\d+:\d+: /, "")}` };
  });
  try {
    parser.write(text).close();
  } catch (e) {
    error ??= { line: parser.line, reason: `\`${path}\` is no well-formed XML: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (error) return { path, scope: facts.scope, bindings: [], arguments: [], aliases: [], intercepts: [], error };
  return facts;
}
