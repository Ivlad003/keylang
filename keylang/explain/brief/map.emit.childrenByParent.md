<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=01f6e7b94d06629f647720fda555a9668526fc8051bc498a479b39b50e7b9dc9 lang=en detail=brief -->
Groups node IDs from `snapshot.nodes` under their parent by splitting each dotted ID at its last dot, skipping IDs without a dot. Used by `map.emit.renderMap` and `map.emit.renderExplainedMap` to build the tree.
