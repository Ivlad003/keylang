<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=f0baa2b9b94c469b8b2cff567f575e4069f2296130fd37408978db2b488bc7e8 lang=en detail=brief -->
Renders a module as an indented markdown bullet with its linked name, comment, description and dependency edges, then recurses into nested modules or emits child declarations via `map.emit.renderDecl` in sorted order.
