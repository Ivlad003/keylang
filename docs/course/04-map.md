# 4. The map

[Course](README.md) · **English** · [Українською](uk/04-map.md)

You never write the map by hand: it is generated. Your part is `keylang.json`, the agent's part is the source code, and the functions are not yours to write either. From those two inputs, `keylang map` writes one Markdown file per layer under `keylang/map/`, plus a fact cache at `.keylang/index.json`. The cache is gitignored; the Markdown is what you commit. When the committed map no longer matches the code, `map --check` reports it so CI can catch the drift.

Every generated file starts with a marker, and the UI opens such a file read-only:

![Generated map of the lang layer](images/tui-map.png)

That first line is the marker; in this repository it is written in Ukrainian (`не редагувати` means "do not edit"). Below it comes the `# map` heading. Each layer is a bullet, each module is nested under its layer, and each function or type is nested under its module. A name in brackets links to a line in the source, and the signature after the link is taken from the declaration. `<!-- internal -->` marks a function that is not in the module's public export list.

A line under a module that has no keyword is a nickname for a dependency:

```markdown
- node external.node
- ir lang.ir
```

These lines come from the module `files` (`src/files.ts`) in this repository's `keylang/map/lang.md`. `node` is the name that module uses locally, and `external.node` is a Node built-in. Under a function, `calls` lists the calls that were resolved. They are not in the order the program runs them, and each target appears only once.

## Layers

`keylang.json` assigns files to layers using globs. In this repository, for example, `lang` holds the parser, the formatter and the IR, while `extract` holds the tree-sitter frontends. The order of the keys sets both the order of colors and the order of the navigation tree.

Two layers always exist, even if you never wrote them:

| Layer | What lands there |
|---|---|
| `external` | Packages and built-ins the resolver recognized |
| `unassigned` | Files that match no configured layer |

A configured layer that has no files yet is still a known id, so a rule can already name it. The map, however, only prints a layer once it has a module.

`init` guesses one layer per directory. If a guessed name collides with a reserved word, it is rewritten (`src/external/` becomes `external_`) and the change is printed on stderr. From then on the layout changes only when you edit `keylang.json`. To see the guess again, run `keylang draft map`: it prints it and writes nothing.

`exclude` keeps a file in the map as an opaque module marked `<!-- excluded -->`. A reference to one of its members is then `unverified` rather than K001. Likewise, a directory that cannot be read does not abort the run: you get a warning, and the rules that cover that area stay `unverified`.

## What a module contains

`module` in `keylang.json` is either `file` or `dir`. When the selected languages disagree on it, the default is `file`. An index file stands for its whole directory: `index.*` for JS and TS, `mod.rs` for Rust, `__init__.py` for Python. PHP has no index file, because `index.php` is an entry script rather than a module.

Every module is in one of two states:

- **complete**, even if empty: the file was read, and the listed members are all there is. A reference to a missing member is K001.
- **opaque**: the contents are unknown, for example because of a parse error, an excluded file or an external package. A reference to a member is `unverified`, because keylang will not confirm that an arbitrary name exists inside.

A class is a module whose members are nested ids, and its constructor is `<class>.constructor`. A static method that would otherwise share an id with an instance method gets the suffix `-static`, and a private method gets `-private`. You write those suffixes when you refer to such methods in a flow.

## What each language sees

The rules and the flows work the same way for every language; what differs is the frontend, which decides what becomes a node or an edge. Whatever a frontend does not look for is simply missing from the graph, and missing does not mean "proved absent."

**TypeScript and JavaScript.** The frontend reads imports, functions, classes, types, exports and calls. It resolves relative paths, `paths` and `baseUrl` from `tsconfig`, and `imports` from `package.json`. A bare name counts as a package only when that package is declared or installed where Node would look for it; otherwise it is an unresolved import. Types mentioned in signatures become `type` edges, and the rules see them.

A call through a local variable, or through an expression the frontend cannot name (`f()()`, `obj[k]()`), is a hole. Hooks are the one exception that is modeled. Given `const g = options.g ?? f` and a later `g()`, the frontend records a call to `f` with `via: "default"`, and a caller that passes its own function in that argument records `via: "injected"`. `--static=behavior`, the default, follows both kinds of call, while `--static=shape` follows only calls written directly at the call site. If you do not pass the flag, `check.static` in `keylang.json` makes the same choice.

**Python.** The frontend reads modules, `def`, `class`, privacy through `__all__` or a leading `_`, and `from` imports. `X()` counts as a call to `X.__init__`, and `self.m()` is resolved, but `x.m()` through a variable is a hole. A decorator outside a known set of decorators that keep the function (`staticmethod`, `property`, `dataclass`, `lru_cache`, …) makes a hole on that function, because it might replace the function. Python produces no `type` edges.

**Rust.** There is one crate per `Cargo.toml` with a `[package]` section. Each target (`src/lib.rs`, `src/main.rs`, `src/bin`) has its own module tree, and `crate::` starts from that target. `pub` marks an export. Tests under `#[cfg(test)]` and `#[test]` are not indexed. A method call such as `order.total()` is a hole, and so is an attribute macro that may replace a function's body. Rust produces no `type` edges, and calling a type is not recorded as a call.

**PHP.** A module is a file, as in TypeScript: with a layer `Domain` = `src/Domain/**`, the file `src/Domain/Order.php` is the module `Domain.Order`, its class `Order` is `Domain.Order.Order`, and a method is `Domain.Order.Order.place`. PHP names a class by its full name rather than by its file, so `use App\Domain\Order` resolves to whichever analyzed file declares `Order` in `App\Domain`. A name no file declares belongs to a composer package when that package's `autoload` claims its namespace (`use Monolog\Logger` becomes a dependency on `external.monolog-monolog`), and PHP's own functions and classes, such as `strlen`, make neither a node nor an edge. `$this->m()`, `self::m()`, `parent::m()`, `new X()` and `$x->m()` through a parameter typed with a class are resolved; `$f()`, `$obj->$m()` and `new $class()` are holes, and so is a trait's method called through `$this`. Type hints, `extends`, `implements` and `catch` become `type` edges, so the rules see them. The full list is in [`docs/format.md`](../format.md).

TypeScript tests in this repository are indexed, because they are ordinary `.ts` files. The rules list the test reporter and the trace hooks as entries, so that they stay reachable on purpose rather than by accident.

## Holes are part of the answer

Every call the frontend saw ends up either as an edge or as a coverage note. The note names the construct that stopped the analysis: an unresolved import, a dynamic call, a syntax error, a skipped file, or `eval`. A `deny` whose area contains a hole is `unverified`, not `ok`, even when every resolved edge in it is legal. `check --format json` includes the list of holes. The UI does not have a separate browser for them; instead, the verdict text names the hole.

`.keylang/index.json` uses schema 7. Its `snapshotId` is a hash of the schema, the extractor, the config and the bytes of every indexed file, while the `generated` time is left out of it. As a result, two runs over the same bytes produce the same id, and that is how a trace file proves it belongs to this tree. The index is not meant to be edited.

Before `keylang map` writes or deletes anything, it checks every target. A map file without the marker counts as a conflict: the command exits with 1 and writes nothing. The same sources always produce the same Markdown.

## The map with the words

Setting `"explain": {"map": true}` asks `keylang map` to write a second directory, `keylang/map-explained/`. It holds the same tree, but each node gets one line of explanation underneath: either the doc comment from the code or a saved brief from `explain --llm`. A line from a model ends with `_(llm · model · date)_`, followed by `stale` once the code has moved on. A doc comment is the author's own text, so it is never marked stale.

`check` does not read that directory, since it is only a reading aid. `map --check` compares both directories. `keylang map` itself never calls a model.

In the UI, pressing `t` on a layer file switches between the two maps while staying on the same node, and `s` finds a node by its id or by words in its explanation.

Next: [rules](05-rules.md).
