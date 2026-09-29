# 4. The map

[Course](README.md) · **English** · [Українською](uk/04-map.md)

The map is generated. You edit `keylang.json` and the source. `keylang map` writes one Markdown file per layer under `keylang/map/`, and a fact cache at `.keylang/index.json`. The cache is gitignored. The Markdown is what you commit. `map --check` tells CI when it has drifted.

A generated file starts with the marker. The UI opens it read-only:

![Generated map of the lang layer](images/tui-map.png)

The first line is the marker. In this repository it is Ukrainian (`не редагувати` — do not edit). The heading is `# map`. Each layer is a bullet. Each module is nested under it. Each function or type is nested under the module. A name in brackets is a link to a source line. The signature after the link comes from the declaration. `<!-- internal -->` means the function is not in the public export list.

A line without a keyword under a module is a nickname for a dependency:

```markdown
- node external.node
- ir lang.ir
```

`node` is the local name inside `files`. `external.node` is a Node built-in. Under a function, `calls` lists resolved calls. The order is not the order the program runs. Each target is listed once.

## Layers

`keylang.json` assigns files to layers with globs. In this repository `lang` is the parser, the formatter and the IR. `extract` is the tree-sitter frontends. The order of keys is the order of colors and of the navigation tree.

Two layers always exist, even if you did not write them:

| Layer | What lands there |
|---|---|
| `external` | Packages and built-ins the resolver recognized |
| `unassigned` | Files that match no configured layer |

A configured layer with no files yet is still a known id, so a rule can name it. The map prints a layer only when it has a module.

`init` guesses a layer per directory. A name that collides with a reserved word is rewritten (`src/external/` becomes `external_`) and printed on stderr. After that, the layout changes only when you edit `keylang.json`. `keylang draft map` prints the guess again and writes nothing.

`exclude` keeps a file as an opaque module, marked `<!-- excluded -->`. A reference to one of its members is `unverified`, not K001. A directory that cannot be read does not abort the run. You get a warning, and rules over that area stay `unverified`.

## What a module contains

`module` in `keylang.json` is `file` or `dir`. The default is `file` when the selected languages disagree. An index file stands for its directory: `index.*` for JS and TS, `mod.rs` for Rust, `__init__.py` for Python.

- **complete**, even if empty: the file was read and these are all the members. A missing member is K001.
- **opaque**: the contents are unknown. A parse error, an excluded file, an external package. A member reference is `unverified`. keylang will not confirm that an arbitrary name exists inside it.

A class is a module whose members are nested ids. The constructor is `<class>.constructor`. A static method that would share an id with an instance method gets `-static`. A private method gets `-private`. You write those suffixes in a flow.

## What each language sees

The rules and the flows are the same for every language. The frontend decides what becomes a node or an edge. What it does not look for is missing. Missing is not "proved absent."

**TypeScript and JavaScript.** Imports, functions, classes, types, exports, and calls. Relative paths, `tsconfig` `paths` and `baseUrl`, and `package.json` `imports` are resolved. A bare name is a package only when that package is declared or installed where Node would look. Otherwise it is an unresolved import. Type mentions in signatures become `type` edges, and the rules see them.

A call through a local, or an expression the frontend cannot name (`f()()`, `obj[k]()`), is a hole. Hooks are the exception that is modeled. `const g = options.g ?? f` and a later `g()` record a call to `f` with `via: "default"`. A caller that passes a function in that argument records `via: "injected"`. `--static=behavior` (the default) follows both. `--static=shape` follows only calls written at the site. `check.static` in `keylang.json` is the same choice when you do not pass the flag.

**Python.** Modules, `def`, `class`, `__all__` or a leading `_` for privacy, and `from` imports. `X()` calls `X.__init__`. `self.m()` resolves. `x.m()` through a variable is a hole. A decorator outside a known keeping set (`staticmethod`, `property`, `dataclass`, `lru_cache`, …) is a hole on that function: it might replace it. There are no `type` edges.

**Rust.** One crate per `Cargo.toml` with `[package]`. Each target (`src/lib.rs`, `src/main.rs`, `src/bin`) is its own module tree, and `crate::` starts from that target. `pub` is an export. Tests under `#[cfg(test)]` and `#[test]` are not indexed. `order.total()` is a hole. An attribute macro that may replace the body is a hole on that function. There are no `type` edges, and there is no call of a type.

TypeScript tests in this repository are indexed, because they are ordinary `.ts` files. The rules name the test reporter and the trace hooks as entries so they stay reachable on purpose.

## Holes are part of the answer

Every call the frontend saw becomes an edge or a coverage note. The note names the construct: unresolved import, dynamic call, syntax error, skipped file, `eval`. A `deny` with a hole in its area is `unverified`, not `ok`, even when every resolved edge is legal. `check --format json` includes the list. The UI does not draw a separate browser. The verdict text names the hole.

`.keylang/index.json` is schema 7. `snapshotId` hashes the schema, the extractor, the config, and the bytes of every indexed file. The `generated` time is not in the hash. Two runs on the same bytes produce the same id. That is how a trace file proves it belongs to this tree. You do not edit the index.

`keylang map` checks every target before it writes or deletes. A map file without the marker is a conflict: exit 1, nothing written. The same sources produce the same Markdown.

## The map with the words

`"explain": {"map": true}` asks `keylang map` for a second directory, `keylang/map-explained/`. Same tree. Under each node, one line: the doc comment, or a saved brief from `explain --llm`. A model line ends with `_(llm · model · date)_`, and with `stale` when the code has moved. A doc comment is the author's text and is never marked stale.

`check` does not read that directory. It is a reading aid. `map --check` compares both directories. `keylang map` does not call a model.

In the UI, `t` on a layer file switches between the two maps and stays on the same node. `s` finds a node by id or by words in its explanation.

Next: [rules](05-rules.md).
