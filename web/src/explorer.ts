// The entry explorer of the diagram page (business-flows/22): the call tree
// of an entry point (or any fn, or an event) for reading old code before a
// flow is written. Down — what it calls; up — who calls it, as far as the
// entry points. Each row opens on a click with one `GET /api/calls` (lazily,
// cached per ID); a row carries a badge for the edge's `via` (a callable or a
// closure passed as an argument, a hook's default or injected value, and the
// framework adapters' preference, plugin, observer), and a call keylang did
// not resolve is a row of its own: «тут keylang сліпий — <reason>». Ticked
// rows of the downward tree become a flow: «Зберегти як флоу» posts them to
// `/api/flow-proposal`, which writes one proposal (merge it in the TUI or
// with `keylang proposals accept`).

import { ApiError, type Api, type CallHole, type CallRef, type Calls, type FlowStep } from "./api.ts";
import { button, codeLink, make } from "./dom.ts";

/** The badge of an edge's `via`: short text and what it means. */
export const VIA_BADGE: Record<string, { text: string; title: string }> = {
  "callable-arg": { text: "callable", title: "a callable reference passed as an argument ([$this, 'm'], this.m.bind(this), self.m)" },
  "closure-arg": { text: "closure", title: "a call inside a closure passed as an argument" },
  injected: { text: "injected hook", title: "the value a caller passes for a hook (request.generate)" },
  default: { text: "default hook", title: "the default of a hook (request.generate ?? generateMap)" },
  preference: { text: "preference", title: "an interface bound to an implementation by the framework's config (Magento di.xml preference)" },
  plugin: { text: "plugin", title: "an interceptor around the call (Magento plugin: before/around/after)" },
  observer: { text: "observer", title: "a subscriber of the event (events.xml)" },
  dispatch: { text: "dispatch", title: "publishes the event" },
};

type Direction = "down" | "up";

interface TreeNode {
  id: string;
  /** The edge into this row; null for the root. */
  ref: CallRef | null;
  direction: Direction;
  parent: TreeNode | null;
  open: boolean;
  loading: boolean;
  checked: boolean;
  calls: Calls | null;
  children: TreeNode[];
  error: string | null;
}

export interface ExplorerHost {
  /** The repository root for `vscode://` links. */
  root(): string | undefined;
  /** Re-roots the explorer at an ID (and the page's fragment with it). */
  explore(id: string): void;
  status(text: string): void;
}

function node(id: string, ref: CallRef | null, direction: Direction, parent: TreeNode | null): TreeNode {
  return { id, ref, direction, parent, open: false, loading: false, checked: false, calls: null, children: [], error: null };
}

function explain(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "No access: open the URL printed by `keylang web` (it carries the access token).";
  return error instanceof Error ? error.message : String(error);
}

const byPosition = (a: { at: { file: string | null; line: number; col: number } }, b: { at: { file: string | null; line: number; col: number } }): number =>
  (a.at.file ?? "").localeCompare(b.at.file ?? "") || a.at.line - b.at.line || a.at.col - b.at.col;

export class Explorer {
  private readonly container: HTMLElement;
  private readonly api: Api;
  private readonly host: ExplorerHost;
  private readonly cache = new Map<string, Promise<Calls>>();
  private id = "";
  private down: TreeNode | null = null;
  private up: TreeNode | null = null;
  private eventsReason: string | undefined;
  private name: HTMLInputElement | null = null;
  private result: HTMLElement | null = null;
  private trees: HTMLElement | null = null;

  constructor(container: HTMLElement, api: Api, host: ExplorerHost) {
    this.container = container;
    this.api = api;
    this.host = host;
  }

  /** Why the list has no events, shown while nothing is picked. */
  setEventsReason(reason: string | undefined): void {
    this.eventsReason = reason;
    if (this.id === "") this.renderEmpty();
  }

  current(): string {
    return this.id;
  }

  /** Opens the explorer at `id` (`""`: the prompt to pick one). */
  async show(id: string): Promise<void> {
    this.id = id;
    if (id === "") {
      this.renderEmpty();
      this.host.status("explorer: pick an entry point on the left");
      return;
    }
    this.host.status(`loading the calls of ${id}…`);
    try {
      const calls = await this.load(id);
      if (this.id !== id) return;
      this.down = this.rootOf(calls, "down");
      this.up = this.rootOf(calls, "up");
      this.renderRoot(calls);
      this.host.status(calls.reason ?? `explore:${id} · ${calls.callees.length} callees · ? ${calls.holes.length} · ${calls.callers.length} callers`);
    } catch (error) {
      if (this.id === id) this.host.status(explain(error));
    }
  }

  /** Forgets every answer: the code may have changed. */
  refresh(): void {
    this.cache.clear();
    void this.show(this.id);
  }

  private load(id: string): Promise<Calls> {
    let found = this.cache.get(id);
    if (!found) {
      found = this.api.calls(id);
      this.cache.set(id, found);
      found.catch(() => this.cache.delete(id));
    }
    return found;
  }

  private rootOf(calls: Calls, direction: Direction): TreeNode {
    const root = node(calls.id, null, direction, null);
    root.calls = calls;
    root.open = true;
    root.checked = direction === "down";
    root.children = this.childrenOf(root);
    return root;
  }

  private childrenOf(parent: TreeNode): TreeNode[] {
    const refs = parent.direction === "down" ? (parent.calls?.callees ?? []) : (parent.calls?.callers ?? []);
    return refs.map((ref) => node(ref.id, ref, parent.direction, parent));
  }

  /** A row whose ID is already above it: the tree would go round. */
  private cycles(row: TreeNode): boolean {
    for (let at = row.parent; at; at = at.parent) if (at.id === row.id) return true;
    return false;
  }

  private canOpen(row: TreeNode): boolean {
    const ref = row.ref;
    if (!ref || ref.external || this.cycles(row)) return false;
    return row.direction === "down" ? ref.calls + ref.holes > 0 : ref.callers > 0;
  }

  private async toggle(row: TreeNode): Promise<void> {
    if (!this.canOpen(row)) return;
    if (row.open) {
      row.open = false;
      this.renderTrees();
      return;
    }
    row.open = true;
    if (!row.calls) {
      row.loading = true;
      this.renderTrees();
      try {
        row.calls = await this.load(row.id);
        row.children = this.childrenOf(row);
        row.error = null;
      } catch (error) {
        row.error = explain(error);
      }
      row.loading = false;
    }
    this.renderTrees();
  }

  /** Ticking a row ticks the rows above it (a step needs its caller); unticking unticks the rows under it. */
  private tick(row: TreeNode, on: boolean): void {
    if (on) for (let at: TreeNode | null = row; at; at = at.parent) at.checked = true;
    else {
      const clear = (at: TreeNode): void => {
        at.checked = false;
        at.children.forEach(clear);
      };
      clear(row);
    }
    this.renderTrees();
  }

  /** The ticked branches under a row, in tree order, nested. */
  private ticked(row: TreeNode): FlowStep[] {
    return row.children
      .filter((child) => child.checked)
      .map((child) => {
        const steps = this.ticked(child);
        return steps.length > 0 ? { id: child.id, steps } : { id: child.id };
      });
  }

  private async save(): Promise<void> {
    const root = this.down;
    if (!root || !this.name || !this.result) return;
    const name = this.name.value.trim();
    const steps = this.ticked(root);
    this.result.className = "save-result";
    this.result.textContent = "saving…";
    try {
      const made = await this.api.flowProposal({ name, trigger: root.id, steps });
      this.result.className = "save-result ok";
      this.result.replaceChildren(make("b", { text: "Пропозицію записано: " }), make("code", { text: made.proposal }), ` → ${made.target}. `, make("span", { text: made.merge }));
      this.host.status(`proposed flow ${made.name}: ${made.steps.length} step(s)`);
    } catch (error) {
      this.result.className = "save-result error";
      this.result.textContent = explain(error);
    }
  }

  private renderEmpty(): void {
    const body: Node[] = [make("h2", { text: "Дослідник точок входу" }), make("p", { className: "empty", text: "Оберіть точку входу (чи подію) ліворуч: дерево викликів розгортається по кліку — вниз (що вона викликає) і вгору (хто викликає, аж до точок входу). Позначені гілки «Зберегти як флоу» пише однією пропозицією." })];
    if (this.eventsReason) body.push(make("p", { className: "events-reason" }, make("b", { text: "Події: " }), this.eventsReason));
    this.down = null;
    this.up = null;
    this.trees = null;
    this.container.replaceChildren(...body);
  }

  private renderRoot(calls: Calls): void {
    const isEvent = calls.node?.kind === "event";
    const head = make("header", { className: "explore-head" });
    const title = calls.entries.length > 0 ? calls.entries.map((e) => `${e.kind} ${e.label}`).join(" · ") : calls.id;
    head.append(make("h2", { text: title }));
    const facts = make("dl");
    const row = (name: string, value: Node | string): void => {
      facts.append(make("dt", { text: name }), make("dd", {}, value));
    };
    row("ID", make("code", { text: calls.id }));
    row("kind", calls.node?.kind ?? "—");
    if (calls.node?.layer) row("layer", calls.node.layer);
    if (calls.node?.file) row("code", codeLink(this.host.root(), calls.node.file, calls.node.line));
    if (calls.node?.doc) row("doc", calls.node.doc);
    head.append(facts);
    if (calls.reason) head.append(make("p", { className: "reason", text: calls.reason }));
    const reached = make("div", { className: "reached" });
    reached.id = "reached-from";
    const own = calls.reachedFrom.filter((entry) => entry.id !== calls.id);
    if (calls.entries.length > 0) reached.append(make("span", { className: "badge entry", text: "точка входу" }));
    if (own.length > 0) {
      reached.append(make("span", { text: "досяжна з точок входу: " }));
      for (const entry of own) reached.append(button(`${entry.kind} ${entry.label} (${entry.steps})`, () => this.host.explore(entry.id), { className: "link", title: `${entry.id}: ${entry.steps} call(s) above` }));
    } else if (calls.entries.length === 0 && calls.node) reached.append(make("span", { className: "orphan", text: "жодна точка входу її не досягає по розв'язаних викликах (сирота чи невідомий вхід)" }));
    head.append(reached);

    // «Зберегти як флоу»: the root is the trigger, the ticked rows of the downward tree its steps.
    const save = make("div", { className: "save" });
    save.id = "save-flow-box";
    const name = make("input");
    name.id = "flow-name";
    name.type = "text";
    name.value = calls.id.slice(calls.id.lastIndexOf(".") + 1).replace(/[^A-Za-z0-9_-]/g, "_");
    name.setAttribute("aria-label", "Назва флоу");
    const saveButton = button("Зберегти як флоу", () => void this.save(), { title: "a proposal for <dir>/flows/<name>.md: the root as the trigger, the ticked rows as steps" });
    saveButton.id = "save-flow";
    const canSave = calls.node?.kind === "fn";
    saveButton.disabled = !canSave;
    const result = make("div", { className: "save-result", text: canSave ? "Позначте гілки дерева «Викликає»: вони стануть кроками." : "Флоу починається з fn: оберіть fn, щоб зберегти." });
    result.id = "save-result";
    save.append(make("label", { text: "флоу " }, name), saveButton, result);
    this.name = name;
    this.result = result;

    const trees = make("div", { className: "trees" });
    this.trees = trees;
    const refresh = button("оновити", () => this.refresh(), { className: "refresh", title: "ask the server again: the code may have changed" });
    this.container.replaceChildren(head, save, refresh, trees);
    this.renderTrees(isEvent);
  }

  private renderTrees(isEvent = this.down?.calls?.node?.kind === "event"): void {
    if (!this.trees || !this.down || !this.up) return;
    const down = make("ul", { className: "tree down" });
    down.id = "tree-down";
    down.append(this.rowOf(this.down));
    const up = make("ul", { className: "tree up" });
    up.id = "tree-up";
    up.append(this.rowOf(this.up));
    this.trees.replaceChildren(
      make("h3", { text: isEvent ? "Підписники (observer) ↓" : "Викликає ↓" }),
      down,
      make("h3", { text: isEvent ? "Видавці (dispatch) ↑" : "Хто викликає ↑ (до точок входу)" }),
      up,
    );
  }

  private rowOf(row: TreeNode): HTMLLIElement {
    const li = make("li", { className: `call${row.ref?.external ? " external" : ""}` });
    li.dataset["id"] = row.id;
    li.dataset["dir"] = row.direction;
    const line = make("div", { className: "row" });
    const cycle = row.ref !== null && this.cycles(row);
    const openable = row.ref === null ? false : this.canOpen(row);
    const glyph = row.ref === null ? "●" : cycle ? "↻" : !openable ? "·" : row.loading ? "…" : row.open ? "▾" : "▸";
    const toggle = button(glyph, () => void this.toggle(row), { className: "toggle", title: cycle ? "already above: a cycle" : openable ? (row.open ? "close" : "open") : "nothing to open" });
    toggle.disabled = !openable;
    line.append(toggle);
    const ref = row.ref;
    if (row.direction === "down") {
      const pick = make("input", { className: "pick" });
      pick.type = "checkbox";
      pick.checked = row.checked;
      const fn = ref === null || (ref.kind === "fn" && !ref.external);
      pick.disabled = ref === null || !fn;
      pick.title = ref === null ? "the trigger" : fn ? "a step of the flow" : "not a fn of the repository: no step";
      pick.addEventListener("change", () => this.tick(row, pick.checked));
      line.append(pick);
    }
    const name = make("span", { className: "name", text: row.id, title: ref ? `${ref.text} at ${ref.at.file}:${ref.at.line}:${ref.at.col}${ref.site ? `; site ${ref.site}` : ""}` : row.id });
    name.addEventListener("click", () => void this.toggle(row));
    line.append(name);
    if (ref) {
      if (ref.via) {
        const badge = VIA_BADGE[ref.via] ?? { text: ref.via, title: `via ${ref.via}` };
        line.append(make("span", { className: `badge via via-${ref.via}`, text: badge.text, title: `${badge.title}${ref.site ? ` — ${ref.site}` : ""}${ref.hook ? ` (hook ${ref.hook})` : ""}` }));
      } else if (ref.closure) line.append(make("span", { className: "badge via via-closure", text: "in closure", title: "the call sits in a closure of the caller" }));
      if (ref.external) line.append(make("span", { className: "badge external", text: "пакет" }));
      if (ref.kind === "event") line.append(make("span", { className: "badge event", text: "подія" }));
      for (const entry of ref.entries) line.append(make("span", { className: "badge entry", text: `⏵ ${entry.kind} ${entry.label}`, title: "an entry point" }));
      if (ref.count > 1) line.append(make("span", { className: "count", text: `×${ref.count}` }));
      if (ref.file) line.append(codeLink(this.host.root(), ref.file, ref.line));
      line.append(button("↗", () => this.host.explore(row.id), { className: "reroot", title: "explore from here" }));
    }
    li.append(line);
    if (row.open) {
      const children = make("ul", { className: "children" });
      if (row.error) children.append(make("li", { className: "error", text: row.error }));
      const holes = row.direction === "down" ? (row.calls?.holes ?? []) : [];
      const items: ({ at: CallHole["at"] } & ({ hole: CallHole } | { child: TreeNode }))[] = [
        ...row.children.map((child) => ({ at: child.ref!.at, child })),
        ...holes.map((hole) => ({ at: hole.at, hole })),
      ];
      // Down, in the order the code writes the calls, holes among them; up, as the server sorts the callers.
      if (row.direction === "down") items.sort(byPosition);
      for (const item of items) children.append("hole" in item ? this.holeOf(item.hole) : this.rowOf(item.child));
      if (items.length === 0 && !row.error && !row.loading) children.append(make("li", { className: "none", text: row.direction === "down" ? "нічого не викликає" : "ніхто не викликає (точка входу чи сирота)" }));
      li.append(children);
    }
    return li;
  }

  private holeOf(hole: CallHole): HTMLLIElement {
    const li = make("li", { className: "hole", title: `${hole.kind}: ${hole.text}` });
    li.append(make("span", { className: "glyph", text: "?" }), make("span", { className: "blind", text: "тут keylang сліпий — " }), make("span", { className: "reason", text: hole.reason }));
    if (hole.at.file) li.append(" ", codeLink(this.host.root(), hole.at.file, hole.at.line));
    return li;
  }
}
