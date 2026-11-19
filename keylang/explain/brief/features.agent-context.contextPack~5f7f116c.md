<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=bda4025d06ddf00edf97b1df09bede6172bc1a8daccadf56fcf0cdf34c0217db lang=en detail=brief -->
Builds an agent context pack from the buffer plus IDs referenced on the cursor line (via `lang.parser.parse`, `addIdItems`), with token estimates, cached per analysis in a bounded LRU keyed by a content hash.
