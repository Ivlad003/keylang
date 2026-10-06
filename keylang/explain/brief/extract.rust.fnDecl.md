<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=bec6db429c2774678adef8870e513041eff5f98a47b03acd6f5e523fdc425d90 lang=en detail=brief -->
Builds a function DeclFact from a Rust tree-sitter node: position, flattened signature, doc, `extract.treesitter.fingerprint`, and body calls from `extract.rust.bodyCalls`; owned fns lacking self are marked static.
