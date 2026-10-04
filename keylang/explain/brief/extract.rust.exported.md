<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=ff36b032caca6fc892b07eeca3c9a57f2799e024d78cfc45f9fd046caffe4b18 lang=en detail=brief -->
Returns true when a Rust syntax node has a direct `visibility_modifier` child (e.g. `pub`), marking it as exported. Used by `extract.rust.extractTree` to decide which items count as public.
