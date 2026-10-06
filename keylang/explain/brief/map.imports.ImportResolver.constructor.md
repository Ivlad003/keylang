<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=23206ef687fb9e34f69ac7abb46a6555a0bc2354209e705b99f184827af73ef1 lang=en detail=brief -->
Sets up a cached reader so each file is read once via `map.imports.readText` and `map.imports.parseJsonc`, then loads baseUrl/paths through `map.imports.loadTsconfig`. Also collects package.json dependency names and workspaces.
