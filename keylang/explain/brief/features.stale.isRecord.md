<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=11b796b708e9e8d3d10ef4618fa181dd6bf653bf9c6d0ef3bc1325e913758ab5 lang=en detail=brief -->
Type guard that narrows an unknown value to a plain object by checking it is a non-null `object` and not an array. Used by `features.stale.parseBaseline` to validate the shape of parsed baseline JSON before reading its fields.
