<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=f3e1902e0d91dfc61610f295ff8283987e6aaf39bb3266ed86d6c004d9532e00 lang=en detail=brief -->
Walks up the parent links from `features.lsp-features.nodesOf` to return the given node followed by each enclosing node out to the root. Each step is a linear scan of the flattened node list, so the chain costs O(depth × nodes).
