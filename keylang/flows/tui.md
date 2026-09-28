# flow tui

Typing in the TUI (`keylang` in a terminal, `keylang web` in a browser): the
transport hands raw bytes to `App.input`, the decoder turns them into key,
mouse and paste events, and `F5` (like a save) reanalyses. The analysis is
the same `analyze()` as `keylang check`; the TUI injects
`SnapshotWorker.generate`, so the snapshot is built off the UI thread. The
static path to it is the injected value of the hook `generate`
(`keylang check --static=shape` does not follow it). The `@flow tui` test in
`tests/cli.test.ts` records the trace of one `F5`; like the `check` flow,
its `trace` lines (trigger and five steps) and the `tests` lines of its three
invariants stay `unverified` until `npm test` has run on the current code.

- trigger tui.app.App.input
  - step tui.input.InputDecoder.feed
    - invariant keys, the mouse and paste are decoded even when a sequence is split across chunks
      - test tests/tui.test.ts "input: keys, modifiers, SGR mouse, paste, and sequences split across chunks"
  - step tui.app.App.handle
    - step tui.app.App.reanalyze
      - step map.analyze.analyze
        - step tui.background.SnapshotWorker.generate
      - invariant F5 reindexes in the background and the keys keep working
        - test tests/tui.test.ts "tui: F5 reindexes in the background; old marks are dimmed and keys still work"
      - invariant the result of a superseded analysis is dropped
        - test tests/tui.test.ts "tui: a superseded analysis is dropped"
