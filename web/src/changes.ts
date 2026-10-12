// Web page (web/src), the «Зміни» (changes) mode; entry points `Changes` and `changeItems`.
// «Зміни» of the diagram page (.scratch/web-git): what the working tree
// changed since a base and the findings of `check --changed` over it —
// `GET /api/git` names HEAD and the base of a feature, `GET /api/changes`
// answers for a base. The base is the feature's by default (the merge-base
// with the main branch); the person may pick a branch or, where the page
// asks live (`keylang web`, app.html), type any ref. A spec opens in «Карта»,
// a module in the explorer. «Список / Діаграма» switches between the files
// and the architecture diff since the same base (`GET /api/graph-diff`),
// drawn on the page's canvas with a legend; app.html, which cannot read the
// history of git, says the diagram is unavailable.

import { ApiError, transport, type Api, type ChangesAnswer, type Diagram, type GitAnswer, type GraphDiffAnswer } from "./api.ts";
import { DIFF_COLOUR, DIFF_GLYPH, VERDICT_GLYPH } from "./canvas.ts";
import { button, codeLink, make } from "./dom.ts";
import type { ListItem } from "./list.ts";

/** What the changes view needs from the page: the repository root, the status line and navigation. */
export interface ChangesHost {
  root(): string | undefined;
  status(text: string): void;
  /** Opens a spec file in «Карта». */
  openDoc(path: string): void;
  explore(id: string): void;
  /** The tab's own fragment: `since` "" is the base of a feature. */
  pick(since: string): void;
  /** Draws the picture of a diff on the canvas beside the panel, or (null) puts the canvas away. */
  showDiff(diagram: Diagram | null): void;
}

// The list group of each changed-file kind; `satisfies` makes a new kind a compile error here.
const KIND_GROUP = { spec: "Змінені специфікації", code: "Змінений код", other: "Інші файли" } satisfies Record<ChangesAnswer["files"][number]["kind"], string>;

/** The list of the «Зміни» mode: the changed files by kind, then the deleted ones. */
export function changeItems(changes: ChangesAnswer, since: string): ListItem[] {
  // Specs first, then code, then other files; the sort is stable, so the server's path order holds within a kind.
  const rank = (kind: string): number => ["spec", "code", "other"].indexOf(kind);

  // A click opens the spec in «Карта», a code file's first module in the explorer, else stays on the changes view.
  const items: ListItem[] = [...changes.files].sort((a, b) => rank(a.kind) - rank(b.kind)).map((file) => ({
    key: `change:${file.path}`,
    label: file.path,
    hint: file.kind,
    group: KIND_GROUP[file.kind] ?? "Інші файли",
    search: [file.path, ...file.modules].join(" ").toLowerCase(),
    title: [file.path, ...file.modules].join("\n"),
    query: file.kind === "spec" ? { view: "docs", path: file.path } : file.modules[0] ? { view: "explore", id: file.modules[0] } : { view: "changes", since },
  }));

  for (const file of changes.deleted) items.push({ key: `deleted:${file.path}`, label: file.path, hint: "deleted", group: "Видалені", search: [file.path, ...file.modules].join(" ").toLowerCase(), title: [file.path, ...file.modules].join("\n"), query: { view: "changes", since } });

  return items;
}

/** The «Зміни» panel: asks git for the base, then the changes since it, and draws the files and findings. */
export class Changes {
  private readonly container: HTMLElement;
  private readonly api: Api;
  private readonly host: ChangesHost;
  private git: GitAnswer | null = null;
  private shown: { since: string; answer: ChangesAnswer } | null = null;
  /** The last request: the answer for an earlier base (picked, then another) is dropped. */
  private request = 0;
  /** «Список» (the files and findings) or «Діаграма» (the architecture diff on the canvas). */
  private view: "list" | "diagram" = "list";
  /** The level of the diagram: modules, or also functions. */
  private level: "module" | "fn" = "module";

  constructor(container: HTMLElement, api: Api, host: ChangesHost) {
    this.container = container;
    this.api = api;
    this.host = host;
  }

  /** The changes of the base asked last, for the list; null before the first answer. */
  current(): { since: string; answer: ChangesAnswer } | null {
    return this.shown;
  }

  /** Loads and draws the changes since `since` ("" is the feature's base); returns the answer, or null when git is missing, it failed, or a newer request superseded it. */
  async show(since: string): Promise<ChangesAnswer | null> {
    const request = ++this.request;
    this.host.status(`changes: reading git${since ? ` since ${since}` : ""}…`);

    if (this.container.childElementCount === 0) this.container.replaceChildren(make("p", { className: "empty", text: "loading…" }));

    try {
      // HEAD and the suggested bases are asked once per page; only the changes depend on the base.
      this.git ??= await this.api.git();

      if (!this.git.available) {
        this.host.showDiff(null);
        this.container.replaceChildren(make("h2", { text: "Зміни" }), make("p", { className: "empty", text: `Git недоступний: ${this.git.reason}` }));
        this.host.status("changes: no git");

        return null;
      }

      const answer = await this.api.changes(since);

      // A newer `show` started meanwhile: its answer wins, this one is dropped.
      if (request !== this.request) return null;
      this.shown = { since, answer };
      this.render(this.git, answer, since, request);
      const counts = answer.check?.counts;
      this.host.status(`changes since ${answer.base.label} · ${answer.files.length} changed · ${answer.deleted.length} deleted${counts ? ` · ✗ ${counts.fail} · ◌ ${counts.unverified}` : ""}`);

      return answer;
    } catch (error) {
      if (request !== this.request) return null;
      this.host.showDiff(null);
      // A static export holds only the precomputed bases, so a 404 there gets an explanation instead of the raw error.
      const text = error instanceof ApiError && error.status === 404 && transport().kind === "static" ? `this export holds the changes since the base of a feature and since HEAD only (${error.message})` : error instanceof Error ? error.message : String(error);
      this.container.replaceChildren(make("h2", { text: "Зміни" }), this.picker(this.git, since), make("p", { className: "error", text }));
      this.host.status(text);

      return null;
    }
  }

  /** The base: the suggestions of `/api/git`, and a free ref where the page asks live. */
  private picker(git: GitAnswer | null, since: string): HTMLElement {
    const box = make("div", { className: "changes-base" });

    // Without git there is no base to choose.
    if (git === null || !git.available) return box;
    const select = make("select");
    select.id = "changes-base";
    select.setAttribute("aria-label", "База");
    // The feature's base comes first as ""; the other suggestions follow, without a duplicate of it.
    const options = [{ ref: "", label: `база фічі: ${git.base.label}` }, ...git.bases.filter((base) => base.ref !== git.base.ref)];

    for (const option of options) {
      const node = make("option", { text: option.label });
      node.value = option.ref;
      node.selected = option.ref === since;
      select.append(node);
    }

    select.addEventListener("change", () => this.host.pick(select.value));
    box.append(make("label", { text: "від " }, select));

    // A free ref is offered only where the server can answer any ref; a static export cannot.
    if (transport().kind !== "static") {
      const input = make("input");
      input.id = "changes-ref";
      input.type = "text";
      input.placeholder = "інший ref: гілка, тег, коміт";
      input.value = options.some((option) => option.ref === since) ? "" : since;
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && input.value.trim() !== "") this.host.pick(input.value.trim());
      });
      box.append(input);
    }

    return box;
  }

  /** «Список / Діаграма»: the pressed one is the view shown; a click redraws the same base in the other. */
  private toggle(git: GitAnswer & { available: true }, answer: ChangesAnswer, since: string): HTMLElement {
    const box = make("div", { className: "changes-toggle" });
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Вигляд змін");

    for (const [view, text] of [["list", "Список"], ["diagram", "Діаграма"]] as const) {
      const node = button(text, () => {
        if (this.view === view) return;
        this.view = view;
        this.render(git, answer, since, ++this.request);
      });

      node.id = `changes-${view}`;
      node.setAttribute("aria-pressed", String(this.view === view));
      box.append(node);
    }

    return box;
  }

  /** Draws the header (HEAD, origin, base), the base picker, the view toggle, then the files and findings, or the architecture diff. */
  private render(git: GitAnswer & { available: true }, answer: ChangesAnswer, since: string, request: number): void {
    const head = git.head.commit === null ? "HEAD без коміту" : `${git.head.branch ?? "detached"} @ ${git.head.short}`;
    const body: Node[] = [make("h2", { text: "Зміни" }), make("p", { className: "note", text: `${head}${git.origin ? ` · ${git.origin}` : ""} · від ${answer.base.label}${answer.unborn ? " (до першого коміту: усі файли нові)" : ""}` }), this.picker(git, since), this.toggle(git, answer, since)];

    // The diagram asks for its own answer; the list below is drawn from this one.
    if (this.view === "diagram") {
      const pane = make("div", { className: "changes-diff" }, make("p", { className: "empty", text: "будую діаграму змін: аналіз бази й робочого дерева…" }));
      this.container.replaceChildren(...body, pane);
      void this.loadDiff(since, request, pane);

      return;
    }

    this.host.showDiff(null);
    const counts = answer.check?.counts;
    body.push(make("p", { className: "changes-summary", text: `${answer.files.length} змінено · ${answer.deleted.length} видалено${counts ? ` · ✗ ${counts.fail} fail · ◌ ${counts.unverified} unverified` : ""}` }));

    // Changed files: a spec opens in «Карта», code links into the editor, and each module it belongs to opens in the explorer.
    const files = make("ul", { className: "changes-files" });

    for (const file of answer.files) {
      const row = make("li", {}, make("span", { className: `kind kind-${file.kind}`, text: file.kind }), " ");

      if (file.kind === "spec") row.append(button(file.path, () => this.host.openDoc(file.path), { className: "link", title: "відкрити в «Карті»" }));
      else row.append(codeLink(this.host.root(), file.path, null));

      for (const id of file.modules) row.append(" ", button(id, () => this.host.explore(id), { className: "link", title: `open ${id} in the explorer` }));
      files.append(row);
    }

    for (const file of answer.deleted) files.append(make("li", { className: "deleted" }, make("span", { className: "kind kind-deleted", text: "deleted" }), ` ${file.path}`, ...file.modules.map((id) => make("code", { text: ` ${id}` }))));
    body.push(make("h3", { text: "Файли" }), answer.files.length + answer.deleted.length > 0 ? files : make("p", { className: "empty", text: "нічого не змінено" }));

    body.push(make("h3", { text: "Знахідки, що зачіпають зміни" }));

    // Findings: only the non-ok results of `check --changed`; the ones outside the change are counted, not listed.
    if (answer.check === null) body.push(make("p", { className: "empty", text: answer.checkReason ?? "перевірки немає" }));
    else {
      const findings = answer.check.results.filter((result) => result.verdict !== "ok");

      if (findings.length === 0) body.push(make("p", { className: "empty", text: "жодної: зміни нічого не ламають" }));
      const list = make("ul", { className: "results" });

      for (const result of findings) {
        list.append(make("li", { className: `v-${result.verdict}` }, make("span", { className: "glyph", text: VERDICT_GLYPH[result.verdict] ?? "·" }), make("b", { text: result.code ?? result.criterion }), ` ${result.evidence} `, codeLink(this.host.root(), result.file, result.line)));
      }

      if (findings.length > 0) body.push(list);
      const hidden = answer.check.changed?.hidden ?? 0;

      if (hidden > 0) body.push(make("p", { className: "note", text: `ще ${hidden} знахідок поза змінами не показано (повна перевірка — «Діаграми» й «Сліпі зони»)` }));
    }

    this.container.replaceChildren(...body);
  }

  /** Asks for the architecture diff since `since` and draws it: the summary and legend here, the picture on the canvas. */
  private async loadDiff(since: string, request: number, pane: HTMLElement): Promise<void> {
    this.host.status(`changes: the architecture diff${since ? ` since ${since}` : ""}…`);
    let answer: GraphDiffAnswer;

    try {
      answer = await this.api.graphDiff(since, this.level);
    } catch (error) {
      if (request !== this.request) return;
      this.host.showDiff(null);
      // A static export holds the diff since the base of a feature at the module level only.
      const text = error instanceof ApiError && error.status === 404 && transport().kind === "static" ? `this export holds the diagram since the base of a feature, modules only (${error.message})` : error instanceof Error ? error.message : String(error);
      pane.replaceChildren(make("p", { className: "error", text }));
      this.host.status(text);

      return;
    }

    // A newer request (another base, the list) took over meanwhile.
    if (request !== this.request) return;

    if (!answer.available) {
      this.host.showDiff(null);
      pane.replaceChildren(make("p", { className: "empty", text: `Діаграма змін недоступна: ${answer.reason}` }));
      this.host.status("changes: no diagram here");

      return;
    }

    const { diff } = answer;
    const count = (items: readonly { status: string }[], status: string): number => items.filter((item) => item.status === status).length;
    const fails = diff.findings.filter((finding) => finding.status === "new" && finding.verdict === "fail").length;
    const summary = `${diff.level === "fn" ? "вузли" : "модулі"} +${count(diff.nodes, "added")} −${count(diff.nodes, "removed")} ~${count(diff.nodes, "changed")} · ребра +${count(diff.edges, "added")} −${count(diff.edges, "removed")} · потоки ~${diff.flows.length} · нові знахідки ${count(diff.findings, "new")} (✗ ${fails}) · виправлено ${count(diff.findings, "fixed")} · K108 ${diff.weakenings.length}`;
    const legend = make("div", { className: "diff-legend" });

    // The colours of the canvas, with the mark each shape's label carries.
    for (const [status, text] of [["added", "додано"], ["removed", "видалено"], ["changed", "змінено"], ["unchanged", "контекст"]] as const) {
      const colour = DIFF_COLOUR[status] ?? { stroke: "#9e9e9e", fill: "#eeeeee" };
      const swatch = make("span", { className: `swatch diff-${status}`, text: DIFF_GLYPH[status] ?? "" });
      swatch.style.borderColor = colour.stroke;
      swatch.style.background = colour.fill;
      legend.append(make("span", {}, swatch, text));
    }

    legend.append(make("span", { text: "ребро: суцільне «+» — нове, пунктир «−» — прибране" }));
    const level = make("select");
    level.id = "changes-level";
    level.setAttribute("aria-label", "Рівень");

    for (const [value, text] of [["module", "модулі"], ["fn", "модулі й функції"]] as const) {
      const option = make("option", { text });
      option.value = value;
      option.selected = value === this.level;
      level.append(option);
    }

    level.addEventListener("change", () => {
      this.level = level.value === "fn" ? "fn" : "module";
      void this.loadDiff(since, ++this.request, pane);
    });
    const rows: Node[] = [make("p", { className: "note", text: `${answer.base.label} → ${answer.head.label}` }), make("p", { className: "changes-summary", text: summary }), make("div", { className: "changes-base" }, make("label", { text: "рівень " }, level)), legend];

    // The new failures name what breaks; the picture shows where.
    for (const finding of diff.findings.filter((item) => item.status === "new" && item.verdict === "fail")) rows.push(make("p", { className: "error", text: `✗ ${finding.code ?? finding.criterion} ${finding.message}` }));
    pane.replaceChildren(...rows);
    this.host.showDiff(answer.diagram);
    this.host.status(`changes since ${answer.base.label} · ${summary}${answer.diagram.reason ? ` · ${answer.diagram.reason}` : ""}`);
  }
}
