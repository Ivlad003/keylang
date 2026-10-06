<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=5ee1dd6bb12be524a112b7b3c902877b1a94574a326f2ebc3d069adf80a1c086 lang=en detail=brief -->
Resolves the symbol target under an LSP cursor position by converting it to a text offset via `features.lsp-features.toOffset` and querying `features.lsp-features.targetAt`, returning null if the document or text is unavailable.
