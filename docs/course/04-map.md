# 4. The map

[Course](README.md) · **English** · [Українською](uk/04-map.md)

You never write the map by hand. You write `keylang.json`, the agent writes the source code, and `keylang map` turns those two inputs into one Markdown file per layer under `keylang/map/`. It also writes a fact cache to `.keylang/index.json`. The cache is gitignored; you commit the Markdown. Once the code moves on and the committed map falls behind, `map --check` reports it, so CI catches the drift.

Every generated file starts with a marker, and the UI opens such a file read-only:

![Generated map of the lang layer](images/tui-map.png)

The first line is the marker. This repository writes it in Ukrainian: `не редагувати` means "do not edit". Then comes the `# map` heading and a nested list: layers at the top, modules under their layer, functions and types under their module. Each name in brackets links to a line in the source, and the signature after it comes from the declaration. `<!-- internal -->` marks a function the module does not export publicly.

A line under a module with no keyword is a nickname for a dependency:

```markdown
- node external.node
- ir lang.ir
```

These two lines belong to the module `files` (`src/files.ts`) in this repository's `keylang/map/lang.md`. `node` is the name the module uses locally; `external.node` is the Node built-in behind it. Under a function, `calls` lists its resolved calls. Each target appears once, and the list does not follow the order in which the program runs them.

## Layers

The map is organized by layers, so start with where they come from. `keylang.json` assigns files to layers with globs. In this repository, `lang` holds the parser, the formatter and the IR, and `extract` holds the tree-sitter frontends. The order of the keys sets the order of colors and of the navigation tree.

Two layers exist even if you never configured them, and two more appear when something lands in them:

| Layer | What lands there |
|---|---|
| `external` | Packages and built-ins the resolver recognized |
| `unassigned` | Files that match no configured layer |
| `outside` | Files that `outside` in `keylang.json` puts outside the architecture, such as vendored code; a dependency into them from a layer is K107 |
| `events` | Events the code dispatches or the framework config observes, written to `keylang/map/events.md` |

A configured layer with no files yet is still a known id, so a rule can name it before any code exists. The map prints the layer only once it has a module.

`init` guesses one layer per directory. When a guessed name collides with a reserved word, `init` renames it (`src/external/` becomes `external_`) and says so on stderr. After that, the layout changes only when you edit `keylang.json`. To see the guess again, run `keylang draft map`: it prints the guess and writes nothing.

`exclude` keeps a file in the map as an opaque module marked `<!-- excluded -->`. A reference to one of its members is then `unverified` rather than K001. An unreadable directory is handled in the same spirit: the run goes on with a warning, and the rules covering that area stay `unverified`.

## What a module contains

Inside a layer, the unit is the module. `module` in `keylang.json` is either `file` or `dir`; when the selected languages disagree, the default is `file`. An index file stands for its whole directory: `index.*` for JS and TS, `mod.rs` for Rust, `__init__.py` for Python. PHP has no index file, because `index.php` is an entry script, not a module.

A module is in one of two states:

- **complete**, even if empty: keylang read the file, and the listed members are all there is. A reference to a missing member is K001.
- **opaque**: keylang does not know the contents, for example after a parse error, for an excluded file or for an external package. A reference to a member is `unverified`, because keylang will not confirm that an arbitrary name exists inside.

A class is a module whose members have nested ids, and its constructor is `<class>.constructor`. If a static method would share an id with an instance method, it gets the suffix `-static`; a private method gets `-private`. You use those suffixes when you refer to such methods in a flow.

## What each language sees

Rules and flows work the same way in every language. What differs is the frontend: it decides what becomes a node or an edge. Anything a frontend does not look for is simply missing from the graph, and missing does not mean "proved absent."

**TypeScript and JavaScript.** The frontend reads imports, functions, classes, types, exports and calls. It resolves relative paths, `paths` and `baseUrl` from `tsconfig`, and `imports` from `package.json`. A bare name counts as a package only when that package is declared or installed where Node would look for it; otherwise it is an unresolved import. Types mentioned in signatures become `type` edges, and the rules see them.

A call through an expression the frontend cannot name (`f()()`, `obj[k]()`) is a hole. So is `x.m()` when nothing in the syntax names the class of `x`. A parameter `x: X`, `const x: X` or `new X()` does name it, and the call resolves to `X.m`; a type that only TypeScript infers (`const x = open()`) does not. Hooks are the one dynamic pattern keylang models. Given `const g = options.g ?? f` and a later `g()`, the frontend records a call to `f` with `via: "default"`; a caller that passes its own function in that argument records `via: "injected"`. `--static=behavior`, the default, follows both kinds of call, while `--static=shape` follows only calls written directly at the call site. Without the flag, `check.static` in `keylang.json` makes the choice.

**Python.** The frontend reads modules, `def`, `class`, privacy through `__all__` or a leading `_`, and `from` imports. `X()` counts as a call to `X.__init__`. `self.m()` resolves, and so does `x.m()` when `x` is a parameter annotated with a class or is assigned once as `x = X()`; through any other variable the call is a hole. Some decorators are known to keep the function (`staticmethod`, `property`, `dataclass`, `lru_cache`, …). Any other decorator might replace the function, so it makes a hole on it. Python produces no `type` edges.

**Rust.** There is one crate per `Cargo.toml` with a `[package]` section. Each target (`src/lib.rs`, `src/main.rs`, `src/bin`) has its own module tree, and `crate::` starts from that target. `pub` marks an export. Tests under `#[cfg(test)]` and `#[test]` are not indexed. A method call such as `order.total()` is a hole, and so is an attribute macro that may replace a function's body. Rust produces no `type` edges, and calling a type is not recorded as a call.

**PHP.** A module is a file, as in TypeScript. With a layer `Domain` = `src/Domain/**`, the file `src/Domain/Order.php` is the module `Domain.Order`, its class `Order` is `Domain.Order.Order`, and a method is `Domain.Order.Order.place`. PHP names a class by its full name, not by its file, so `use App\Domain\Order` resolves to whichever analyzed file declares `Order` in `App\Domain`. If no file declares a name, it belongs to the composer package whose `autoload` claims its namespace: `use Monolog\Logger` becomes a dependency on `external.monolog-monolog`. PHP's own functions and classes, such as `strlen`, make neither a node nor an edge. `$this->m()`, `self::m()`, `parent::m()`, `new X()` and `$x->m()` through a parameter typed with a class resolve. `$f()`, `$obj->$m()` and `new $class()` are holes, and so is a trait's method called through `$this`. Type hints, `extends`, `implements` and `catch` become `type` edges, so the rules see them. The full list is in [`docs/snapshot.md`](../snapshot.md).

**Frameworks.** A framework keeps much of its wiring in configuration rather than in calls: Magento `di.xml` preferences, plugins and observers, a NestJS controller decorator, a Django URL list. Framework adapters read that configuration and add the calls and entry points it implies, and each one carries the config line it came from. keylang has adapters for Magento, SFCC, Laravel, Symfony, NestJS, PWA Kit, Django, FastAPI, Flask, Celery, Express, Fastify and Next.js. Each turns on when keylang detects its framework; `frameworks` in `keylang.json` overrides the detection. `keylang entries` lists the entry points found in the code and by the adapters: routes, CLI commands, cron jobs, consumers, observers, webhooks. A framework without an adapter stays a hole; keylang does not guess.

This repository's TypeScript tests are ordinary `.ts` files, so they are indexed too. The rules list the test reporter and the trace hooks as entries, which keeps them reachable on purpose rather than by accident.

## Holes are part of the answer

The previous section kept mentioning holes. Here is what keylang does with them. Every call a frontend saw ends up as either an edge or a coverage note, and the note names the construct that stopped the analysis: an unresolved import, a dynamic call, a syntax error, a skipped file, or `eval`. A `deny` whose area contains a hole is `unverified`, not `ok`, even when every resolved edge in it is legal. `check --format json` includes the list of holes. The UI has no separate browser for them; the verdict text names the hole instead.

`.keylang/index.json` uses schema 9. Its `snapshotId` hashes the schema, the extractor, the config and the bytes of every indexed file, and leaves out the `generated` time. Two runs over the same bytes therefore produce the same id, which is how a trace file proves it belongs to this tree. Don't edit the index.

Before `keylang map` writes or deletes anything, it checks every target. A map file without the marker is a conflict: the command exits with 1 and writes nothing. The same sources always produce the same Markdown.

## The map with the words

The map shows names and signatures, but not what they are for. Set `"explain": {"map": true}` and `keylang map` also writes `keylang/map-explained/`. It holds the same tree with one line of explanation under each node: the doc comment from the code, or a saved brief from `explain --llm`. A line from a model ends with `_(llm · model · date)_`, and gains `stale` once the code moves on. A doc comment is the author's own text, so it is never marked stale.

This directory is only a reading aid, so `check` ignores it. `map --check` compares both directories. `keylang map` itself never calls a model.

In the UI, pressing `t` on a layer file switches between the two maps while staying on the same node, and `s` finds a node by its id or by words in its explanation.

Next: [rules](05-rules.md).
