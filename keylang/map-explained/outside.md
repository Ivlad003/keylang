<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [bench](#outside.bench) · [bench.clone](#outside.bench.clone) · [bench.inject](#outside.bench.inject) · [bench.lib](#outside.bench.lib) · [bench.lib.metrics](#outside.bench.lib.metrics) · [bench.magento](#outside.bench.magento) · [bench.magento.run](#outside.bench.magento.run) · [bench.run](#outside.bench.run) · [design](#outside.design) · [design.scripts](#outside.design.scripts) · [design.scripts._60_archive](#outside.design.scripts._60_archive) · [design.scripts._61_tui](#outside.design.scripts._61_tui) · [design.scripts._62_flow](#outside.design.scripts._62_flow) · [design.scripts._63_merge](#outside.design.scripts._63_merge) · [design.scripts._64_explain](#outside.design.scripts._64_explain) · [design.scripts._65_windows](#outside.design.scripts._65_windows) · [design.scripts._66_export](#outside.design.scripts._66_export) · [design.scripts._70_cleanup](#outside.design.scripts._70_cleanup) · [design.scripts._71_editor](#outside.design.scripts._71_editor) · [design.scripts._72_fix](#outside.design.scripts._72_fix) · [design.scripts._73_fix](#outside.design.scripts._73_fix) · [design.scripts._74_agent](#outside.design.scripts._74_agent) · [design.scripts._75_read_s2c](#outside.design.scripts._75_read_s2c) · [design.scripts._76_fix_export](#outside.design.scripts._76_fix_export) · [design.scripts._77_tbl](#outside.design.scripts._77_tbl) · [design.scripts.lib](#outside.design.scripts.lib) · [editors](#outside.editors) · [editors.vscode](#outside.editors.vscode) · [editors.vscode.extension](#outside.editors.vscode.extension) · [examples](#outside.examples) · [examples.wiring-lifecycle](#outside.examples.wiring-lifecycle) · [examples.wiring-lifecycle.demo](#outside.examples.wiring-lifecycle.demo) · [examples.wiring-lifecycle.plan](#outside.examples.wiring-lifecycle.plan) · [scripts](#outside.scripts) · [scripts.build-web](#outside.scripts.build-web) · [scripts.copy-wasm](#outside.scripts.copy-wasm) · [scripts.copy-web](#outside.scripts.copy-web) · [scripts.pack-entry](#outside.scripts.pack-entry) · [web](#outside.web) · [web.src](#outside.web.src) · [web.src.api](#outside.web.src.api) · [web.src.blind](#outside.web.src.blind) · [web.src.canvas](#outside.web.src.canvas) · [web.src.diagrams](#outside.web.src.diagrams) · [web.src.dom](#outside.web.src.dom) · [web.src.explorer](#outside.web.src.explorer) · [web.src.list](#outside.web.src.list) · [web.src.tour](#outside.web.src.tour)

# map

- outside
  <a id="outside"></a><br>Collects the repository code that sits beyond the analyzed source layers: benchmark scripts in [`outside.bench`](outside.md#outside.bench), browser prototype assets in [`outside.design`](outside.md#outside.design), the VS Code integration in [`outside.editors`](outside.md#outside.editors), samples in [`outside.examples`](outside.md#outside.examples), and build helpers in [`outside.scripts`](outside.md#outside.scripts). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module bench
    <a id="outside.bench"></a><br>Groups benchmark scripts kept outside the analyzed source tree: [`outside.bench.clone`](outside.md#outside.bench.clone), [`outside.bench.inject`](outside.md#outside.bench.inject), and the entry script [`outside.bench.run`](outside.md#outside.bench.run). Each depends on one unresolved external file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [clone](../../bench/clone.ts#L1) <!-- outside -->
      <a id="outside.bench.clone"></a><br>A benchmark script living outside the analyzed source tree; its current contents could not be read, so it is only known to depend on one external file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [inject](../../bench/inject.ts#L1) <!-- outside -->
      <a id="outside.bench.inject"></a><br>A benchmark-side module living outside the analyzed layers, with one unresolved dependency on another outside file. Its contents were not captured because the file changed after it was read. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module lib
      <a id="outside.bench.lib"></a>
      - module [metrics](../../bench/lib/metrics.mjs#L1) <!-- outside -->
        <a id="outside.bench.lib.metrics"></a>
    - module magento
      <a id="outside.bench.magento"></a>
      - module [run](../../bench/magento/run.mjs#L1) <!-- outside -->
        <a id="outside.bench.magento.run"></a>
    - module [run](../../bench/run.ts#L1) <!-- outside -->
      <a id="outside.bench.run"></a><br>A benchmark entry script in [`outside.bench.run`](outside.md#outside.bench.run) that sits outside the analysed layers and depends on one file the analysis could not resolve. Its contents were not captured because the file changed after the last read. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module design
    <a id="outside.design"></a><br>Holds the browser-side design prototype assets, which sit outside the analyzed source graph. Its sole member [`outside.design.scripts`](outside.md#outside.design.scripts) groups the numbered prototype scripts with a shared helper library. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module scripts
      <a id="outside.design.scripts"></a><br>Groups the numbered design-prototype scripts ([`outside.design.scripts._60_archive`](outside.md#outside.design.scripts._60_archive) through [`outside.design.scripts._77_tbl`](outside.md#outside.design.scripts._77_tbl)) plus a shared [`outside.design.scripts.lib`](outside.md#outside.design.scripts.lib), all browser-side page assets outside the analyzed source graph. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_60_archive](../../design/scripts/60_archive.js#L1) <!-- outside -->
        <a id="outside.design.scripts._60_archive"></a><br>An unresolved outside-layer script file under the design scripts directory; its contents were not available to the analysis, so its behavior is unknown beyond being referenced as an external file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_61_tui](../../design/scripts/61_tui.js#L1) <!-- outside -->
        <a id="outside.design.scripts._61_tui"></a><br>An external design script that sits outside the analyzed source tree, so its behavior is not part of the mapped codebase. Its current contents were modified after the last analysis read and are not reflected here. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_62_flow](../../design/scripts/62_flow.js#L1) <!-- outside -->
        <a id="outside.design.scripts._62_flow"></a><br>A design-side script file in [`outside.design.scripts._62_flow`](outside.md#outside.design.scripts._62_flow) that sits outside the analyzed codebase; its current contents could not be read, so its behavior is unknown beyond being an unresolved external file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_63_merge](../../design/scripts/63_merge.js#L1) <!-- outside -->
        <a id="outside.design.scripts._63_merge"></a><br>A script in the design folder, outside the keylang source tree; its contents were not available for analysis because the file changed after it was read, so its behavior is unknown beyond its placement among the design scripts. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_64_explain](../../design/scripts/64_explain.js#L1) <!-- outside -->
        <a id="outside.design.scripts._64_explain"></a><br>A placeholder for an external script file under the design folder that the analysis could not resolve or read, so no behavior is recorded for it; it sits outside the analyzed layers of the codebase. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_65_windows](../../design/scripts/65_windows.js#L1) <!-- outside -->
        <a id="outside.design.scripts._65_windows"></a><br>A design-layer script sitting outside the analyzed graph, with one unresolved outside-file dependency; its contents were not captured, so only its position as a standalone frontend asset is known. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_66_export](../../design/scripts/66_export.js#L1) <!-- outside -->
        <a id="outside.design.scripts._66_export"></a><br>An external design-script file that lives outside the analysed layers and whose contents were not available for reading, so its behaviour is not described here beyond being referenced by the repository map. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_70_cleanup](../../design/scripts/70_cleanup.js#L1) <!-- outside -->
        <a id="outside.design.scripts._70_cleanup"></a><br>An unresolved external script module at [`outside.design.scripts._70_cleanup`](outside.md#outside.design.scripts._70_cleanup), grouped in the outside layer with no analyzed contents. Its source was not read, so nothing is recorded about its behavior or dependencies. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_71_editor](../../design/scripts/71_editor.js#L1) <!-- outside -->
        <a id="outside.design.scripts._71_editor"></a><br>A standalone browser script in the design prototype layer, loaded as a numbered page asset alongside the other `design/scripts` files; it sits outside the analyzed source graph and resolves no imports from it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_72_fix](../../design/scripts/72_fix.js#L1) <!-- outside -->
        <a id="outside.design.scripts._72_fix"></a><br>A standalone design-time script living outside the analyzed source tree, so its behavior is not captured in the architecture description. It has no resolved dependencies on other nodes in the map. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_73_fix](../../design/scripts/73_fix.js#L1) <!-- outside -->
        <a id="outside.design.scripts._73_fix"></a><br>A script file under `design/scripts` that sits outside the analysed source tree, so its contents and behaviour are not captured; its single unresolved dependency is another file outside the analysis scope. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_74_agent](../../design/scripts/74_agent.js#L1) <!-- outside -->
        <a id="outside.design.scripts._74_agent"></a><br>A design-side browser script that lives outside the analyzed source tree and depends on one further outside file; its contents were modified after the analysis snapshot, so no behavior beyond that is recorded. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_75_read_s2c](../../design/scripts/75_read_s2c.js#L1) <!-- outside -->
        <a id="outside.design.scripts._75_read_s2c"></a><br>A standalone script under the design folder, placed in the `outside` layer with no resolved links to other analyzed modules. Its current behavior cannot be stated because the file changed after the analysis snapshot was taken. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_76_fix_export](../../design/scripts/76_fix_export.js#L1) <!-- outside -->
        <a id="outside.design.scripts._76_fix_export"></a><br>A standalone script under the design folder, outside the analyzed layers, with one unresolved outside-file dependency; its contents are unavailable because the file changed after it was read. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [_77_tbl](../../design/scripts/77_tbl.js#L1) <!-- outside -->
        <a id="outside.design.scripts._77_tbl"></a><br>A design-side script that lives outside the analyzed codebase and whose contents were not captured, so its runtime behavior is unknown; it depends on one unresolved outside file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [lib](../../design/scripts/lib.js#L1) <!-- outside -->
        <a id="outside.design.scripts.lib"></a><br>A JavaScript module under `design/scripts` that sits outside the analyzed layers; its contents were not captured, so only its position as an unresolved external file is known. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module editors
    <a id="outside.editors"></a><br>Groups the editor integrations that ship with the repository but sit outside its core layers, currently holding only [`outside.editors.vscode`](outside.md#outside.editors.vscode), whose [`outside.editors.vscode.extension`](outside.md#outside.editors.vscode.extension) entry point is loaded by the VS Code extension host. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module vscode
      <a id="outside.editors.vscode"></a><br>Houses the VS Code editor integration, with [`outside.editors.vscode.extension`](outside.md#outside.editors.vscode.extension) as its entry point loaded by the extension host. It lives outside keylang's core layers and is not wired through the repository's own modules. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [extension](../../editors/vscode/extension.js#L1) <!-- outside -->
        <a id="outside.editors.vscode.extension"></a><br>Entry module of the VS Code editor integration, sitting outside the core layers of the repository and wired through the extension host rather than through keylang's own modules. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module examples
    <a id="outside.examples"></a><br>Holds sample code that lives outside the analyzed package, currently grouping [`outside.examples.wiring-lifecycle`](outside.md#outside.examples.wiring-lifecycle) as a wiring-lifecycle demonstration built from [`outside.examples.wiring-lifecycle.demo`](outside.md#outside.examples.wiring-lifecycle.demo) and [`outside.examples.wiring-lifecycle.plan`](outside.md#outside.examples.wiring-lifecycle.plan). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module wiring-lifecycle
      <a id="outside.examples.wiring-lifecycle"></a><br>An example directory outside the analyzed package, grouping [`outside.examples.wiring-lifecycle.demo`](outside.md#outside.examples.wiring-lifecycle.demo) and [`outside.examples.wiring-lifecycle.plan`](outside.md#outside.examples.wiring-lifecycle.plan) as a wiring-lifecycle sample. Its sources changed after analysis, so the exact behavior of the example is not captured. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [demo](../../examples/wiring-lifecycle/demo.ts#L1) <!-- outside -->
        <a id="outside.examples.wiring-lifecycle.demo"></a><br>An example script under `examples/wiring-lifecycle` that lives outside the analyzed package boundary; its source was modified after analysis, so only its placement as an external example file is known. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - module [plan](../../examples/wiring-lifecycle/plan.ts#L1) <!-- outside -->
        <a id="outside.examples.wiring-lifecycle.plan"></a><br>An example module in the wiring-lifecycle sample that sits outside the analyzed graph, with one unresolved dependency on another outside file. Its current source was not captured, so its exact behavior is unknown. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module scripts
    <a id="outside.scripts"></a><br>Groups the build-time helper scripts that live beyond the analyzed layers: [`outside.scripts.copy-wasm`](outside.md#outside.scripts.copy-wasm) copies compiled WebAssembly output into place, [`outside.scripts.copy-web`](outside.md#outside.scripts.copy-web) and [`outside.scripts.pack-entry`](outside.md#outside.scripts.pack-entry) support web asset copying and entry-point packaging. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [build-web](../../scripts/build-web.mjs#L1) <!-- outside -->
      <a id="outside.scripts.build-web"></a>
    - module [copy-wasm](../../scripts/copy-wasm.mjs#L1) <!-- outside -->
      <a id="outside.scripts.copy-wasm"></a><br>A standalone build helper script in the outside layer that copies compiled WebAssembly artifacts into their target location during the build; its one import is an unresolved file outside the analyzed graph. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [copy-web](../../scripts/copy-web.mjs#L1) <!-- outside -->
      <a id="outside.scripts.copy-web"></a><br>A build-support script that sits outside the analyzed layers and depends on one unresolved external file. Its current contents could not be read, so its concrete behavior is not described here. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [pack-entry](../../scripts/pack-entry.mjs#L1) <!-- outside -->
      <a id="outside.scripts.pack-entry"></a><br>A build-side script that lives outside the analyzed source tree and packs an entry point into a distributable form. Its current contents weren't captured, so its exact packing steps are unknown. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module web
    <a id="outside.web"></a>
    - module src
      <a id="outside.web.src"></a>
      - module [api](../../web/src/api.ts#L1) <!-- outside -->
        <a id="outside.web.src.api"></a>
      - module [blind](../../web/src/blind.ts#L1) <!-- outside -->
        <a id="outside.web.src.blind"></a>
      - module [canvas](../../web/src/canvas.ts#L1) <!-- outside -->
        <a id="outside.web.src.canvas"></a>
      - module [diagrams](../../web/src/diagrams.ts#L1) <!-- outside -->
        <a id="outside.web.src.diagrams"></a>
      - module [dom](../../web/src/dom.ts#L1) <!-- outside -->
        <a id="outside.web.src.dom"></a>
      - module [explorer](../../web/src/explorer.ts#L1) <!-- outside -->
        <a id="outside.web.src.explorer"></a>
      - module [list](../../web/src/list.ts#L1) <!-- outside -->
        <a id="outside.web.src.list"></a>
      - module [tour](../../web/src/tour.ts#L1) <!-- outside -->
        <a id="outside.web.src.tour"></a>
