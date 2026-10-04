<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=7f1445b7571ba79c690d05114aa573e003a2dcafc05c693a9f658abce7e24029 lang=en detail=brief -->
Stores the project root and known source files, derives their containing directories via `map.python-imports.directoriesOf`, and keeps only the candidate root dirs that exist on disk per `map.python-imports.PythonResolver.isDir`.
