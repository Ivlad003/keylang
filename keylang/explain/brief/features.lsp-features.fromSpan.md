<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=af2c05d6b92fc7d4972f85b5b848a1cee0dd8f2fd934dc9df26559f7f3013b8a lang=en detail=brief -->
Converts a source span into an LSP range by mapping its start and end offsets through `features.lsp-features.fromPos`, using the document text for line/column resolution. Shared by diagnostics, symbols, hover, and references.
