// The NestJS adapter (ADR 0022). NestJS keeps its configuration in the code:
// decorators the framework runs when it boots. The TypeScript extractor
// records them (`DeclFact.decorators`), and this adapter reads them per file:
//
// - `@Module({ providers: [...] })`: `{ provide: T, useClass: C }` and a class
//   provider `C` — what the token gives; `useExisting: U` — what `U` gives;
//   `useFactory`, `useValue` — a value keylang cannot name (a hole).
//   `{ provide: AbstractRepo, useClass: SqlRepo }` with a class as the token
//   is also a binding `AbstractRepo → SqlRepo`: a parameter typed by it gets one.
// - `constructor(@Inject(T) private readonly x: I)`: the parameter `x` gets
//   what `T` provides; the graph matches the token to the providers
//   (`src/frameworks/bindings.ts`) and gives `this.x.m()` an edge `via: "argument"`.
// - `@OnEvent('order.created')`: the method runs when the event is emitted;
//   `emit('order.created')` gets an edge `via: "observer"` to it (`src/graph.ts`).
//
// Entry points (controllers, cron, message patterns, GraphQL resolvers,
// listeners) need the graph and the global prefix of `main.ts`: they are
// placed in `src/framework-entries.ts`. Detected from `@nestjs/core` or
// `@nestjs/common` in the root `package.json`, or a `nest-cli.json`. Its
// config files are the analysed sources that import `@nestjs/…`.

import { posix } from "node:path";
import type { CodeDecl, CodeFacts, ConfigFacts, DecoratorArg, FrameworkAdapter, ProviderFact, TokenRef } from "./adapter.ts";

const NEST_PACKAGES = ["@nestjs/core", "@nestjs/common"];
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];
const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export const nestjs: FrameworkAdapter = {
  name: "nestjs",
  version: "1",
  detect(context) {
    if (context.read("nest-cli.json") !== null) return true;
    const manifest = parseJson(context.read("package.json"));
    return DEPENDENCY_FIELDS.some((field) => NEST_PACKAGES.some((pkg) => isRecord(manifest) && isRecord(manifest[field]) && pkg in manifest[field]));
  },
  files(context) {
    const out: { path: string; owner: string | null }[] = [];
    for (const path of context.sources) {
      if (!SOURCE.test(path)) continue;
      // A file that imports the framework is one whose decorators it runs.
      if (context.read(path)?.includes("@nestjs/")) out.push({ path, owner: ownerOf(path) });
    }
    return out;
  },
  parse(path) {
    return emptyFacts(path);
  },
  code: nestFacts,
};

function ownerOf(path: string): string | null {
  const dir = posix.dirname(path);
  return dir === "." ? null : dir;
}

function emptyFacts(path: string): ConfigFacts {
  return { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], providers: [], injections: [], listeners: [], error: null };
}

/** The providers, injections and listeners the decorators of one source file declare. */
export function nestFacts(path: string, file: CodeFacts): ConfigFacts {
  const facts = emptyFacts(path);
  const token = (arg: DecoratorArg): TokenRef | null => (arg.kind === "string" ? { kind: "string", value: arg.value } : arg.kind === "name" ? { kind: "name", name: arg.name, file: path } : null);
  for (const cls of classes(file.decls)) {
    const type = { name: cls.name, file: path };
    for (const decorator of cls.decorators ?? []) {
      if (decorator.name !== "Module") continue;
      const options = decorator.args[0];
      const list = options?.kind === "object" ? options.props.find((p) => p.key === "providers")?.value : undefined;
      for (const item of list?.kind === "array" ? list.items : []) {
        const at = { line: item.line, col: item.col };
        if (item.kind === "name") {
          // `providers: [OrdersService]`: the class is its own token.
          facts.providers!.push({ token: { kind: "name", name: item.name, file: path }, use: { kind: "class", type: { name: item.name, file: path } }, ...at });
          continue;
        }
        if (item.kind !== "object") continue;
        const field = (key: string): DecoratorArg | undefined => item.props.find((p) => p.key === key)?.value;
        const provide = field("provide");
        const provided = provide === undefined ? null : token(provide);
        if (provided === null) continue;
        const useClass = field("useClass");
        const useExisting = field("useExisting");
        let use: ProviderFact["use"] | null = null;
        if (useClass?.kind === "name") use = { kind: "class", type: { name: useClass.name, file: path } };
        else if (useExisting !== undefined) {
          const other = token(useExisting);
          if (other !== null) use = { kind: "existing", token: other };
        } else if (field("useFactory") !== undefined) use = { kind: "factory" };
        else if (field("useValue") !== undefined) use = { kind: "value" };
        if (use === null) continue;
        facts.providers!.push({ token: provided, use, ...at });
        // A class as the token (an abstract class): a value typed by it is the class `useClass` names.
        if (use.kind === "class" && provided.kind === "name") facts.bindings.push({ from: { name: provided.name, file: path }, to: use.type, ...at });
      }
    }
    for (const member of cls.members) {
      for (const decorator of member.decorators ?? []) {
        if (decorator.name === "Inject" && decorator.param !== undefined && decorator.param.name !== null) {
          const injected = decorator.args[0] === undefined ? null : token(decorator.args[0]);
          if (injected !== null) facts.injections!.push({ type, param: decorator.param.name, token: injected, line: decorator.line, col: decorator.col });
        }
        if (decorator.name === "OnEvent" && decorator.param === undefined) {
          const first = decorator.args[0];
          const events = first?.kind === "string" ? [first.value] : first?.kind === "array" ? first.items.flatMap((i) => (i.kind === "string" ? [i.value] : [])) : [];
          for (const event of events) facts.listeners!.push({ event, type, method: member.name, line: decorator.line, col: decorator.col });
        }
      }
    }
  }
  return facts;
}

/** The top-level classes of a file. */
function classes(decls: readonly CodeDecl[]): CodeDecl[] {
  return decls.flatMap((d) => (d.kind === "class" ? [d] : []));
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
