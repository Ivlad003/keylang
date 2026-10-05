// The forms of the operations that read the repository as it is saved:
// feature readiness, baseline, agents, init, fmt, parse, wire, check, an
// explained edge and a trace plan. Each shows what it would run on and what
// it would write before anything runs; Enter starts the session's
// operation, through the save step when it reads dirty buffers.

import { existsSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { within } from "../../analyze.ts";
import { baselinePath } from "../../baseline.ts";
import { CONFIG_FILE, guessLayout, loadConfig, resolveStatic, STATIC_MODES, toPosix, type StaticMode } from "../../config.ts";
import { edgeIdKnown } from "../../explain-edge.ts";
import { collectMdFiles } from "../../files.ts";
import { harnessChoice, planAgents, type HarnessChoice } from "../../harness.ts";
import { FEATURE_SLUG, initSources, wireOutProblem, WIRE_OUT } from "../../operations.ts";
import { PARSE_FORMATS, type ParseFormat } from "../../parse-format.ts";
import { compareText } from "../../span.ts";
import { WIRE_MARKER } from "../../wire-gen.ts";
import { isDirty } from "../buffer.ts";
import { readText } from "../disk.ts";
import { errorText } from "../merge-session.ts";
import { caretAt, cycle, fieldOf, noteOfSelection, promptText, selectedRow, type PromptKeys } from "../prompt-keys.ts";
import type { Prompt, State } from "../state.ts";
import type { FormHost } from "./host.ts";

export class RunForms {
  private readonly host: FormHost;

  constructor(host: FormHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  /** The keys of these forms. */
  keys(prompt: Prompt): PromptKeys | null {
    switch (prompt.kind) {
      case "feature":
        return { typed: () => this.refreshFeaturePrompt(), moved: () => this.featureNote(), submit: () => this.submitFeature() };
      case "baseline":
        // A choice, not a query: nothing is typed.
        return { field: () => null, moved: () => noteOfSelection(prompt), submit: () => this.submitBaseline() };
      case "agents":
        return { typed: () => this.refreshAgentsPrompt(), submit: () => this.submitAgents() };
      case "init":
        return { typed: () => this.refreshInitPrompt(), moved: () => noteOfSelection(prompt), submit: () => this.submitInit() };
      case "fmt":
        return { typed: () => this.refreshFmtPrompt(), submit: () => this.submitFmt() };
      case "parse":
        return { typed: () => this.refreshParsePrompt(), submit: () => this.submitParse() };
      case "wire":
        return { typed: () => this.refreshWirePrompt(), submit: () => this.submitWire() };
      case "trace-plan":
        return { typed: () => this.refreshTracePlanPrompt(), moved: () => this.tracePlanNote(), submit: () => this.submitTracePlan() };
      case "full-check":
        // The since row takes the git ref; every other row types the paths.
        return {
          field: () => (prompt.checkOptions && selectedRow(prompt, "") === "since" ? fieldOf(prompt.checkOptions, "since") : promptText(prompt)),
          typed: () => this.refreshCheckPrompt(),
          moved: () => this.refreshCheckPrompt(),
          change: (delta) => this.changeCheckOption(delta),
          submit: () => this.submitCheck(),
        };
      case "explain-edge":
        return {
          field: () => {
            const row = selectedRow(prompt, "");
            return prompt.edge && (row === "from" || row === "to") ? fieldOf(prompt.edge, row) : null;
          },
          typed: () => this.refreshEdgePrompt(),
          moved: () => this.refreshEdgePrompt(),
          submit: () => this.submitEdge(),
        };
      default:
        return null;
    }
  }

  /** The feature form: the slug of the current feature file, else typed or chosen from the feature files. */
  openFeaturePrompt(): void {
    const prefix = `${this.host.specDir()}/features/`;
    const current = this.state.current;
    const initial = current !== null && current.startsWith(prefix) && current.endsWith(".md") && !current.slice(prefix.length).includes("/") ? current.slice(prefix.length, -3) : "";
    this.state.prompt = { kind: "feature", text: initial, items: [], ids: [], index: 0 };
    this.refreshFeaturePrompt();
  }

  /** The feature files matching the typed slug, and the target the form would check. */
  private refreshFeaturePrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "feature") return;
    const prefix = `${this.host.specDir()}/features/`;
    const slugs = this.state.files.filter((path) => path.startsWith(prefix) && path.endsWith(".md") && !path.slice(prefix.length).includes("/")).map((path) => path.slice(prefix.length, -3));
    const query = prompt.text.toLowerCase();
    // The exact slug first, then the other matches in file order.
    const matches = slugs.filter((slug) => slug.toLowerCase().includes(query)).sort((a, b) => Number(b === prompt.text) - Number(a === prompt.text));
    prompt.ids = matches;
    prompt.items = matches.map((slug) => `${slug}  ${prefix}${slug}.md`);
    prompt.index = 0;
    this.featureNote();
  }

  /** The slug Enter would check: the selected feature file, else the typed text. */
  private featureSlug(): string {
    const prompt = this.state.prompt!;
    return prompt.ids?.[prompt.index] ?? prompt.text.trim();
  }

  private featureNote(): void {
    const prompt = this.state.prompt!;
    const slug = this.featureSlug();
    prompt.note =
      slug === ""
        ? "type a slug: <dir>/features/<slug>.md"
        : FEATURE_SLUG.test(slug)
          ? `checks ${this.state.root}/${this.host.specDir()}/features/${slug}.md on disk`
          : `invalid slug \`${slug}\`: letters, digits, . _ - (not first)`;
  }

  /** Enter in the feature form: the same slug rule as the CLI; an invalid one keeps the form and the text. */
  private submitFeature(): void {
    const slug = this.featureSlug();
    if (!FEATURE_SLUG.test(slug)) {
      this.state.message = slug === "" ? "feature: a slug is required" : `feature: invalid slug \`${slug}\``;
      return;
    }
    this.state.prompt = null;
    this.host.requestOperation("feature", { kind: "feature", root: this.state.root, slug });
  }

  /** The baseline form: the mode (write or check) and the target from the saved config's spec directory. */
  openBaselinePrompt(): void {
    const target = baselinePath({ dir: this.host.specDir() });
    this.state.prompt = {
      kind: "baseline",
      text: "",
      items: [`Write ${target}`, `Check ${target} (writes nothing)`],
      ids: ["write", "check"],
      notes: [
        "the dependencies the code has now become the allowed ones: a new edge between layers or a new package is K102",
        "compares the file with the current layer graph; code 1 when it is stale",
      ],
      index: 0,
    };
    this.state.prompt.note = this.state.prompt.notes![0]!;
  }

  /** Enter in the baseline form: the chosen mode runs as the session's operation. */
  private submitBaseline(): void {
    const prompt = this.state.prompt!;
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.host.requestOperation("baseline", { kind: "baseline", root: this.state.root, check });
  }

  /**
   * The agents form: the typed selection (empty is auto, `none`, or names as
   * in `--agents`) and the mode. It shows what the selection resolves to and
   * which files it would change, read from the disk; nothing runs a harness.
   */
  openAgentsPrompt(): void {
    this.state.prompt = { kind: "agents", text: "", items: [], ids: ["write", "check"], index: 0 };
    this.refreshAgentsPrompt();
  }

  /** What a selection would do now: the read-only plan of the shared operation, or why it cannot be planned. */
  private agentsPreview(choice: HarnessChoice): { changed: string[]; note: string } {
    try {
      const plan = planAgents(this.state.root, choice);
      if (plan.error !== null) return { changed: [], note: `${plan.error.file}: ${plan.error.message}: nothing can be written until it is fixed` };
      const harnesses = plan.selection.harnesses.join(", ");
      const who =
        choice === "auto" ? `auto: ${harnesses === "" ? "no harness detected, the AGENTS.md block only" : `detected ${harnesses}`}` : choice === "none" ? "none: keylang's harness files are stripped" : harnesses;
      const changed = plan.targets.filter((target) => target.action !== "keep");
      const counts = new Map<string, number>();
      for (const target of changed) counts.set(target.category, (counts.get(target.category) ?? 0) + 1);
      const what = changed.length === 0 ? "every file is current" : `changes ${[...counts].map(([category, n]) => `${category} ${n}`).join(", ")}`;
      const mcp = plan.selection.harnesses.length > 0 ? ` · MCP npx -y keylang@${plan.version} mcp` : "";
      return { changed: changed.map((target) => target.path), note: `${who} · ${what}${mcp} · sets up files only; it does not test the clients` };
    } catch (error) {
      return { changed: [], note: errorText(error) };
    }
  }

  /** The typed selection as a choice, or why it is not one (the CLI's message for `--agents`). */
  private agentsChoice(): HarnessChoice | { error: string } {
    const text = this.state.prompt?.text.trim() ?? "";
    try {
      return text === "" || text === "auto" ? "auto" : harnessChoice(text);
    } catch (error) {
      return { error: errorText(error) };
    }
  }

  private refreshAgentsPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "agents") return;
    const choice = this.agentsChoice();
    if (typeof choice === "object" && "error" in choice) {
      prompt.items = ["Write the harness files", "Check the harness files (writes nothing)"];
      prompt.note = `${choice.error} · type auto (empty), none, or claude,codex,opencode,cursor`;
      return;
    }
    const preview = this.agentsPreview(choice);
    const shown = preview.changed.length > 3 ? `${preview.changed.slice(0, 3).join(", ")}, …` : preview.changed.join(", ");
    prompt.items = [preview.changed.length === 0 ? "Write: nothing to change" : `Write ${preview.changed.length} file(s): ${shown}`, "Check the harness files (writes nothing)"];
    prompt.note = preview.note;
  }

  /** Enter in the agents form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form. */
  private submitAgents(): void {
    const prompt = this.state.prompt!;
    const choice = this.agentsChoice();
    if (typeof choice === "object" && "error" in choice) {
      this.state.message = `agents: ${choice.error}`;
      return;
    }
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.host.requestOperation("agents", { kind: "agents", root: this.state.root, harnesses: choice, check });
  }

  /**
   * The init form: the harness selection as in the agents form (empty is
   * auto), then write or check. Its notes name the root, the languages and
   * layers it describes (the saved keylang.json when there is one: it is
   * kept), what the selection resolves to, and which classes of files each
   * mode touches; nothing runs until Enter.
   */
  openInitPrompt(): void {
    this.state.prompt = { kind: "init", text: "", items: [], ids: ["write", "check"], notes: [], index: 0 };
    this.refreshInitPrompt();
  }

  private refreshInitPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "init") return;
    const root = this.state.root;
    const sources = initSources(root);
    const existed = existsSync(join(root, CONFIG_FILE));
    let found: string;
    if ("error" in sources) found = `${sources.error}: init stops with code 2 and writes nothing`;
    else {
      const layers = existed ? [...sources.config.layers.keys()] : [...guessLayout(root, sources.config.exclude).layers.keys()];
      found = `${sources.config.languages.join(", ")} · layers: ${layers.length > 0 ? layers.join(", ") : "none"}`;
    }
    const choice = this.agentsChoice();
    const harness = typeof choice === "object" && "error" in choice ? `${choice.error} · type auto (empty), none, or claude,codex,opencode,cursor` : this.agentsPreview(choice).note;
    const baseline = baselinePath({ dir: this.host.specDir() });
    prompt.details = [
      `Root: ${root}`,
      `Found: ${found}`,
      existed ? "keylang.json: exists, kept byte for byte (no new guess replaces it)" : "keylang.json: none yet, written from this guess",
      `Harnesses: ${harness}`,
      `Write, in order: ${existed ? "" : "keylang.json, "}.keylang/ into .gitignore (unless a line lists it), the map (${this.host.specDir()}/map/, .keylang/), ${baseline}, the harness files — each file on its own, no overall rollback`,
      "Check: as `keylang init --check` — the harness files, the baseline and whether .gitignore lists .keylang/; the map is not compared (Map: check does)",
    ];
    prompt.items = [`Initialize: ${existed ? "keep" : "write"} keylang.json, map, baseline, harness files`, "Check as `keylang init --check` (writes nothing)"];
    prompt.notes = ["writes the files listed above, in order", "writes nothing; code 1 when a harness file or the baseline is stale, or .gitignore does not list .keylang/"];
    prompt.note = prompt.notes[prompt.index] ?? "";
  }

  /** Enter in the init form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form. */
  private submitInit(): void {
    const prompt = this.state.prompt!;
    const choice = this.agentsChoice();
    if (typeof choice === "object" && "error" in choice) {
      this.state.message = `init: ${choice.error}`;
      return;
    }
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.host.requestOperation("init", { kind: "init", root: this.state.root, harnesses: choice, check });
  }

  /** The fmt form: the current spec file by default — a directory only when typed — then the mode. */
  openFmtPrompt(): void {
    const current = this.state.current;
    const initial = current !== null && extname(current) === ".md" ? current : "";
    this.state.prompt = { kind: "fmt", text: initial, items: [], ids: ["write", "check"], index: 0 };
    this.refreshFmtPrompt();
  }

  /** The typed paths of the fmt or parse form, relative to the root, or why they cannot be used. */
  private promptPaths(): string[] | { error: string } {
    const paths = (this.state.prompt?.text ?? "").trim().split(/\s+/).filter((path) => path !== "");
    if (paths.length === 0) return { error: "type a spec file or a directory, relative to the root" };
    const outside = paths.find((path) => !within(resolve(this.state.root, path), this.state.root));
    return outside === undefined ? paths : { error: `${outside}: outside the repository` };
  }

  /** The form shows the real set the paths expand to, from the disk, and both modes. */
  private refreshFmtPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "fmt") return;
    const paths = this.promptPaths();
    if (!Array.isArray(paths)) {
      prompt.items = ["Write: format the files", "Check the files (writes nothing)"];
      prompt.note = paths.error;
      return;
    }
    const selection = this.markdownSelection(paths);
    if ("error" in selection) {
      prompt.items = ["Write: format the files", "Check the files (writes nothing)"];
      prompt.note = selection.error;
      return;
    }
    prompt.items = [`Write: format ${selection.files.length} file(s)`, `Check ${selection.files.length} file(s) (writes nothing)`];
    prompt.note = `${selection.note} · saved explanations are skipped, as are generated files`;
  }

  /** The Markdown files the paths expand to on disk, and a note naming them and how many are unsaved (saved first). */
  private markdownSelection(paths: readonly string[]): { files: string[]; note: string } | { error: string } {
    let files: string[];
    try {
      files = collectMdFiles(paths, this.state.root).map((file) => toPosix(relative(this.state.root, resolve(this.state.root, file))));
    } catch (error) {
      return { error: `${errorText(error)} · a new spec is saved first` };
    }
    const shown = files.length > 3 ? `${files.slice(0, 3).join(", ")}, …` : files.join(", ");
    const dirty = files.filter((file) => {
      const buffer = this.state.buffers.get(file);
      return buffer !== undefined && isDirty(buffer);
    }).length;
    return { files, note: `${files.length === 0 ? "no Markdown files" : shown}${dirty > 0 ? ` · ${dirty} unsaved, saved first` : ""}` };
  }

  /** Enter in the fmt form: the typed paths with the chosen mode run as the session's operation. */
  private submitFmt(): void {
    const prompt = this.state.prompt!;
    const paths = this.promptPaths();
    if (!Array.isArray(paths)) {
      this.state.message = `fmt: ${paths.error}`;
      return;
    }
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.host.requestOperation("fmt", { kind: "fmt", root: this.state.root, paths, check });
  }

  /** The parse form: the current spec file by default — a directory only when typed — then the view. */
  openParsePrompt(): void {
    const current = this.state.current;
    const initial = current !== null && extname(current) === ".md" ? current : "";
    this.state.prompt = { kind: "parse", text: initial, items: [], ids: [...PARSE_FORMATS], index: 0 };
    this.refreshParsePrompt();
  }

  /** The form shows the real set the paths expand to and both views; parsing needs no snapshot and writes nothing. */
  private refreshParsePrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "parse") return;
    const paths = this.promptPaths();
    const selection = Array.isArray(paths) ? this.markdownSelection(paths) : paths;
    const count = "files" in selection ? ` of ${selection.files.length} file(s)` : "";
    prompt.items = [`Tree${count}: as keylang parse prints it`, `JSON${count}: as keylang parse --json prints it`];
    prompt.note = "error" in selection ? selection.error : `${selection.note} · saved explanations are skipped · no code snapshot needed · writes nothing`;
  }

  /** Enter in the parse form: the typed paths in the chosen view run as the session's operation. */
  private submitParse(): void {
    const prompt = this.state.prompt!;
    const paths = this.promptPaths();
    if (!Array.isArray(paths)) {
      this.state.message = `parse: ${paths.error}`;
      return;
    }
    const format: ParseFormat = prompt.ids?.[prompt.index] === "json" ? "json" : "tree";
    this.state.prompt = null;
    this.host.requestOperation("parse", { kind: "parse", root: this.state.root, paths, format });
  }

  /** The wire form: the generated file (the CLI's default), then the mode. */
  openWirePrompt(): void {
    this.state.prompt = { kind: "wire", text: WIRE_OUT, items: [], ids: ["write", "check"], index: 0 };
    this.refreshWirePrompt();
  }

  /** The typed output path (POSIX, relative to the root), or why it cannot be the generated file. */
  private wireOut(): string | { error: string } {
    const out = (this.state.prompt?.text ?? "").trim();
    if (out === "") return { error: "type the generated file, relative to the root (keylang.gen.ts)" };
    const problem = wireOutProblem(this.state.root, out);
    return problem === null ? out : { error: problem.replace(/^wire: /, "") };
  }

  /** The form shows the path problem as it is typed, and the state of the file on disk. Reading only. */
  private refreshWirePrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "wire") return;
    const out = this.wireOut();
    if (typeof out !== "string") {
      prompt.items = ["Write: generate the container", "Check the container (writes nothing)"];
      prompt.note = out.error;
      return;
    }
    const current = readText(resolve(this.state.root, out));
    const onDisk = current === null ? "not on disk yet" : current.startsWith(WIRE_MARKER) ? "generated file on disk" : "a manual file on disk: never written over";
    const dirty = this.host.dirtyInputs().length;
    prompt.items = [`Write ${out}`, `Check ${out} (writes nothing)`];
    prompt.note = `from the saved # wiring and the code · ${onDisk}${dirty > 0 ? ` · ${dirty} unsaved, saved first` : ""} · never compiled or run`;
  }

  /** Enter in the wire form: the typed file with the chosen mode runs as the session's operation; an invalid path keeps the form. */
  private submitWire(): void {
    const prompt = this.state.prompt!;
    const out = this.wireOut();
    if (typeof out !== "string") {
      this.state.message = `wire: ${out.error}`;
      return;
    }
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.host.requestOperation("wire", { kind: "wire", root: this.state.root, out, check });
  }

  /** The check form: the spec directory by default, not strict, the static mode of keylang.json. */
  openCheckPrompt(): void {
    this.state.prompt = { kind: "full-check", text: this.host.specDir(), items: [], ids: ["strict", "static", "changed", "since", "run"], index: 4, checkOptions: { strict: false, static: null, changed: false, since: "HEAD" } };
    this.refreshCheckPrompt();
  }

  /** The typed paths, relative to the root (none: the spec directory), or why they cannot be checked here. */
  private checkPaths(): string[] | { error: string } {
    const paths = (this.state.prompt?.text ?? "").trim().split(/\s+/).filter((path) => path !== "");
    const outside = paths.find((path) => !within(resolve(this.state.root, path), this.state.root));
    return outside === undefined ? paths : { error: `${outside}: outside the repository` };
  }

  /** The options as items, and the real set of spec files the paths expand to. Reading only. */
  private refreshCheckPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "full-check" || !prompt.checkOptions) return;
    const options = prompt.checkOptions;
    let configured: StaticMode | undefined;
    try {
      configured = loadConfig(this.state.root).check.static;
    } catch {
      configured = undefined;
    }
    const effective = resolveStatic(options.static ?? undefined, configured).mode;
    prompt.items = [
      options.strict ? "strict: on · an unverified verdict fails (code 1)" : "strict: off · unverified stays visible; code 0 unless something fails",
      options.static === null ? `static: ${effective}, ${configured === undefined ? "the default" : "from keylang.json check.static"}` : `static: ${options.static}, override of keylang.json`,
      options.changed ? "changed: on · the full analysis, then only findings touching files git reports changed" : "changed: off · every finding of the paths; git is not read",
      `since: ${options.since}${caretAt(selectedRow(prompt, ""))("since")}${options.changed ? " · the git ref the working tree is compared with" : " · used with changed on"}`,
      "Run the check (writes only the local fact cache, .keylang/cache/facts.json)",
    ];
    const paths = this.checkPaths();
    if (!Array.isArray(paths)) {
      prompt.note = paths.error;
      return;
    }
    let files: string[];
    try {
      files = collectMdFiles(paths.length > 0 ? paths : [this.host.specDir()], this.state.root).map((file) => toPosix(relative(this.state.root, resolve(this.state.root, file))));
    } catch (error) {
      prompt.note = `${errorText(error)} · ←→ change the selected option`;
      return;
    }
    const dirty = new Set(this.host.dirtyInputs());
    const unsaved = files.filter((file) => dirty.has(file)).length + (dirty.has(CONFIG_FILE) ? 1 : 0);
    prompt.note = `${files.length} spec file(s)${unsaved > 0 ? ` · ${unsaved} unsaved, saved first` : ""} · ${prompt.ids?.[prompt.index] === "since" ? "type the git ref" : "←→ change the selected option"}`;
  }

  /** ←→ on an option of the check form: strict flips; the static mode cycles config → behavior → shape. */
  private changeCheckOption(delta: 1 | -1): void {
    const prompt = this.state.prompt;
    const options = prompt?.checkOptions;
    if (!prompt || !options) return;
    if (prompt.ids?.[prompt.index] === "strict") options.strict = !options.strict;
    if (prompt.ids?.[prompt.index] === "changed") options.changed = !options.changed;
    if (prompt.ids?.[prompt.index] === "static") {
      const modes: (StaticMode | null)[] = [null, ...STATIC_MODES];
      options.static = cycle(modes, options.static, delta);
    }
    this.refreshCheckPrompt();
  }

  /** Enter in the check form, on any row: the typed paths with the chosen options run as the session's operation. */
  private submitCheck(): void {
    const options = this.state.prompt?.checkOptions ?? { strict: false, static: null, changed: false, since: "HEAD" };
    const paths = this.checkPaths();
    if (!Array.isArray(paths)) {
      this.state.message = `check: ${paths.error}`;
      return;
    }
    const since = options.since.trim();
    if (options.changed && since === "") {
      this.state.message = "check: changed needs a git ref (HEAD by default)";
      return;
    }
    this.state.prompt = null;
    // The ref goes with changed only, as `--since` needs `--changed`; HEAD is the default and is not repeated.
    const slice = options.changed ? { changed: true, ...(since !== "HEAD" ? { since } : {}) } : {};
    this.host.requestOperation("full-check", { kind: "check", root: this.state.root, paths, strict: options.strict, ...(options.static !== null ? { static: options.static } : {}), ...slice });
  }

  /** The edge form: the id under the cursor fills only the first field; the second is typed. */
  openEdgePrompt(): void {
    const from = this.state.mode === "merge" || this.state.start !== null ? null : this.host.idAtCursor();
    this.state.prompt = { kind: "explain-edge", text: "", items: [], ids: ["from", "to", "run"], index: from === null ? 0 : 1, edge: { from: from ?? "", to: "" } };
    this.refreshEdgePrompt();
  }

  /** The rows, and a note on the selected id against the session's current snapshot (the operation reads the saved code again). */
  private refreshEdgePrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "explain-edge" || !prompt.edge) return;
    const { from, to } = prompt.edge;
    const field = prompt.ids?.[prompt.index];
    const caret = caretAt(field ?? "");
    prompt.items = [`from: ${from}${caret("from")}`, `to: ${to}${caret("to")}`, "Explain the edge (reads the saved code, writes nothing)"];
    const id = field === "from" ? from.trim() : field === "to" ? to.trim() : "";
    const snapshot = this.state.analysis?.snapshot ?? null;
    if (field === "run") prompt.note = from.trim() === "" || to.trim() === "" ? "two ids are needed: ↑ to the empty one" : "Enter explains both directions";
    else if (id === "") prompt.note = `type the ${field === "from" ? "first" : "second"} id · ↑↓ the other field`;
    else if (snapshot === null) prompt.note = "no current snapshot to look the id up; the operation reads the saved code";
    else if (edgeIdKnown(snapshot, id)) prompt.note = `${id}: in the current snapshot`;
    else {
      const near = this.state.analysis?.index.suggest(id);
      prompt.note = `${id}: not in the current snapshot${near === undefined ? "" : ` · did you mean ${near}?`}`;
    }
  }

  /** Enter in the edge form, on any row: both ids run as the session's operation; an empty one keeps the form. */
  private submitEdge(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "explain-edge" || !prompt.edge) return;
    const from = prompt.edge.from.trim();
    const to = prompt.edge.to.trim();
    if (from === "" || to === "") {
      prompt.index = from === "" ? 0 : 1;
      this.refreshEdgePrompt();
      this.state.message = "explain edge: two ids are needed: <from> <to>";
      return;
    }
    this.state.prompt = null;
    this.host.requestOperation("explain-edge", { kind: "explain-edge", root: this.state.root, from, to });
  }

  /** The trace-plan form: the flow under the cursor is the visible default; the list is the flows of the current documents. */
  openTracePlanPrompt(): void {
    const initial = this.state.mode === "merge" ? null : this.host.flowAtCursor();
    this.state.prompt = { kind: "trace-plan", text: initial ?? "", items: [], ids: [], index: 0 };
    this.refreshTracePlanPrompt();
  }

  /** The declared flows matching the typed name (the exact one first), each with the file that declares it. */
  private refreshTracePlanPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "trace-plan") return;
    // The flows of the current documents (dirty buffers included), not the file names; the operation reads them saved.
    const declared = new Map<string, string>();
    for (const flow of this.state.analysis?.spec.flows ?? []) if (!declared.has(flow.name)) declared.set(flow.name, flow.file);
    const typed = prompt.text.trim();
    const query = typed.toLowerCase();
    const names = [...declared.keys()].filter((name) => name.toLowerCase().includes(query)).sort((a, b) => Number(b === typed) - Number(a === typed) || compareText(a, b));
    prompt.ids = names;
    prompt.items = names.map((name) => `${name}  ${declared.get(name)}`);
    prompt.index = 0;
    this.tracePlanNote();
  }

  /** The flow Enter plans: the selected one of the list, else the typed name. */
  private tracePlanFlow(): string {
    const prompt = this.state.prompt!;
    return prompt.ids?.[prompt.index] ?? prompt.text.trim();
  }

  private tracePlanNote(): void {
    const prompt = this.state.prompt!;
    const flow = this.tracePlanFlow();
    const known = this.state.analysis?.spec.flows.some((item) => item.name === flow) ?? false;
    prompt.note =
      flow === ""
        ? "type a flow name: # flow <name>"
        : `${flow}${known ? "" : ": not in the current documents"} · a fresh snapshot of the saved code · writes nothing, runs nothing`;
  }

  /** Enter in the trace-plan form: the flow runs as the session's operation; an empty name keeps the form. */
  private submitTracePlan(): void {
    const flow = this.tracePlanFlow();
    if (flow === "") {
      this.state.message = "trace-plan: a flow name is required";
      return;
    }
    this.state.prompt = null;
    this.host.requestOperation("trace-plan", { kind: "trace-plan", root: this.state.root, flow });
  }
}
