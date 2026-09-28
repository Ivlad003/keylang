# 4. The map

[Course](README.md) · **English** · [Українською](uk/04-map.md)

The map is generated. You edit `keylang.json` and the source code. `keylang map` renders one Markdown file per layer under `keylang/map/` and writes the fact cache to `.keylang/index.json`. The cache is gitignored. The Markdown is what you commit, and `map --check` tells CI when it has drifted.

A generated file starts with the marker. The terminal UI opens it read-only:

![Generated map of the lang layer](images/tui-map.png)

The first line is the marker, in Ukrainian in this repository (`не редагувати` — do not edit). The heading is `# map`. Each layer is a bullet, each module is nested under it, and each function or type is nested under the module. A name in brackets is a link to a source line, relative to the map file. The signature after the link is text from the declaration. `<!-- internal -->` means the function is not in the module's public export list.

A line without a keyword under a module is a dependency alias:

```markdown
- node external.node
- ir lang.ir
```

`node` is the local name inside `files`. `external.node` is the id of a Node built-in. `ir` points at the module `lang.ir` in another layer file. Under a function, `calls` is the projection of resolved call edges. The order is not an execution order. The same target is listed once.

## Layers

`keylang.json` assigns files to layers with globs. This repository's `lang` layer is the parser, the formatter, the file loader and the IR. `extract` is the tree-sitter frontends. The order of keys in `layers` is the order you see in the navigation panel and the order of the colors on ids.

Two synthetic layers always exist:

| Layer | What lands there |
|---|---|
| `external` | Packages and language built-ins the resolver recognized |
| `unassigned` | Files that belong to no configured layer |

A configured layer with no modules yet is still a known id, so a rule can name it before any file matches. The map prints a layer only when it has a module.

`init` guesses a layer per directory. Guessed names that collide with a reserved word are rewritten (`src/external/` becomes the layer `external_`) and the rewrite is printed on stderr. After that, the layout changes only when you edit `keylang.json`. `keylang draft map` prints the guess again and writes nothing. An LLM mode can propose a layout; it is printed, validated, and not saved.

`exclude` keeps a file in the snapshot as an opaque module with an `<!-- excluded -->` comment. A reference to one of its members is `unverified`, not K001. A directory that cannot be read does not abort the run: you get a warning and a coverage hole, and rules over that area stay `unverified`.

## What a module contains

`module` in `keylang.json` is `file` or `dir`. The default is `file` when the selected languages do not agree. An index file stands for its directory: `index.*` for JS/TS, `mod.rs` for Rust, `__init__.py` for Python.

Every indexed module is either `complete` or `opaque`.

- `complete` and empty means the frontend read the file and found no members. A reference to a member that is not there is K001.
- `opaque` means the contents are unknown: a parse error, an excluded file, a module-id collision, an external package. A reference to a member is `unverified`. keylang will not confirm that an arbitrary name exists inside it.

A class is a module (`class: true`) whose members are nested ids. The constructor is `<class>.constructor`. A static method that would otherwise share an id with an instance method gets the suffix `-static`; a private method gets `-private`. Those suffixes are part of the id you write in a flow.

## What each language contributes

The graph, the rules and the flows are the same for every language. The frontend decides what becomes a node or an edge. Anything the frontend does not look for is missing from the snapshot. It is not "proved absent".

**TypeScript and JavaScript.** Imports (`import`, `require`, `import x = require`, `export … from`), declarations (functions, classes and methods, types), exports (including `default`, `export =`, CommonJS `module.exports`, `export *`), and calls. Relative specifiers, `tsconfig` `paths` and `baseUrl` (including `extends` and project references), and `package.json` `imports` are resolved. A bare specifier is a package only when that package is declared or installed where Node would look; otherwise it is an unresolved import, not a silent non-edge. Type mentions in signatures become `type` edges, and `allow` / `deny` / `layers` see them.

A call through a local value, a shadowed name, `this` outside a class method, or an expression the frontend cannot name (`f()()`, `obj[k]()`) is a hole: `dynamic-call` or `unresolved-call`. Hooks are the exception that is modeled. `const g = options.g ?? f` and a later `g()` record a call edge to `f` with `via: "default"`. A caller that passes a function in that argument records `via: "injected"`. `--static=behavior` (the default) follows both. `--static=shape` follows only calls written at the site.

**Python.** Modules and packages, `def` and `class`, `__all__` or a leading underscore for privacy, `from` imports including relative ones. `X()` is a call of `X.__init__`. `self.m()` resolves; `x.m()` through a variable is a dynamic call. Decorators outside a known keeping set (`staticmethod`, `property`, `dataclass`, `lru_cache`, …) are a hole on that function: the decorator might replace it. There are no `type` edges.

**Rust.** One crate per `Cargo.toml` with `[package]`. Each target (`src/lib.rs`, `src/main.rs`, `src/bin`, `[[bin]]`) is its own module tree, and `crate::` resolves from that target. `use` leaves are imports. `pub` and `pub use` are exports. `fn`, `struct`, `enum`, `union`, `trait` and `type` are members. Tests under `#[cfg(test)]` and `#[test]` are not indexed. A method call on a value (`order.total()`) is a dynamic call. An attribute macro the frontend does not treat as keeping the body is a hole on that function. Unknown macros of the crate are unsupported. There are no `type` edges. There is no call of a type, unlike JS `new` and Python `X()`.

Test files follow each language's defaults (`test_*.py`, `*_test.py`, `conftest.py`, Rust's test attributes). TypeScript tests in this repository are indexed, because they are ordinary `.ts` files inside a layer; the rules name the test reporter and the trace hooks as entries so they are reachable on purpose.

## Coverage is part of the result

Every call the frontend saw becomes an edge or a coverage record. The record names the construct and the position: unresolved import, dynamic call, syntax error, skipped file, unsupported construct (namespace, `eval`, computed class member, a module-id collision). Rules consult these records. A `deny` with a hole in its area is `unverified`, not `ok`, even when every resolved edge is legal. `check --format json` includes the coverage list. The terminal UI does not draw a separate coverage browser; the verdict text names the hole.

`.keylang/index.json` is schema 6 of the snapshot. `snapshotId` is a hash of the schema, the extractor and grammar versions, the config, and the contents of every indexed file. The `generated` timestamp is not in the hash. Two runs on the same bytes produce the same id, which is how a trace file proves it belongs to this tree. You do not edit the index. A broken file is replaced on the next `map`.

`keylang map` checks every target file before it writes or deletes anything. A map file without the marker is a conflict: exit 1, nothing written, nothing deleted. An extra file is removed only when it carries the marker. The render is stable: the same sources and config produce the same Markdown.

Next: [rules](05-rules.md), which are the part you write by hand on top of this map.
