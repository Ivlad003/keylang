<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=dc4c6f410dd3bb4a4ed2f6ad8cf0f17ba762aa1eb98a2d097dbbcfef9e8f0e51 lang=en detail=brief -->
Union type for a "then" step in the spec IR: it carries a source location, a list of nested `FlowItem` children, and either a `Ref` target or free-form prose text, discriminated by the `form` field.
