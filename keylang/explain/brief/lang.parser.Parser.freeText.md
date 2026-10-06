<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=70174e074b3f6d5973d44a5c76839b39d3f7c8ad55d1bad5aef3cd02d05900ec lang=en detail=brief -->
Stores a node's trailing tokens as canonical description text via `lang.parser.renderTokens`, spanning first to last token so reformatting won't change it. If none remain, reports K005 that the node kind needs a description.
