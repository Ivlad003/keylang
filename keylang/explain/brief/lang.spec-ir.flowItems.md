<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=7a7f7a7c708b9d149cd6fa4de737c5a183ad67d36ada4abb53e07c0d3c16ccf8 lang=en detail=brief -->
Converts a list of spec nodes into one flat list of flow items by running each node through `lang.spec-ir.flowNode` and concatenating the results. Used recursively for nested nodes, triggers and whole flows.
