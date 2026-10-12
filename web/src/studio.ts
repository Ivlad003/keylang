// «Студія» of `keylang web` (`/studio`, .scratch/studio): the diagram, what it
// becomes and the agent on one screen. Three panes side by side, with
// splitters a person drags (the widths stay in `localStorage`):
//
// 1. «Діаграма» — the editor of the diagram page (editor.ts) on the view
//    picked in the bar above;
// 2. «Проєкція» — what the canvas says as keylang (the spec texts it would
//    propose, the lines it adds marked) or as TypeScript (`keylang types`
//    over the specs plus the drawing), asked from `POST /api/projection`
//    400 ms after the last change; the lines of the selected shape's ID are
//    highlighted;
// 3. «Агент» — a chat with the configured model (`POST /api/chat`): it sees
//    the view, the selection, the view's spec and the drawing's diff; a spec
//    block of its answer comes back as a proposal, shown hunk by hunk with
//    «Прийняти» / «Відхилити» (`POST /api/proposal`).
//
// Place in the pipeline: a second entry script of the web client (beside
// diagrams.ts), over the same API client (api.ts) and editor. It writes
// nothing itself: proposals and their merge are the server's.

import { Api, ApiError, transport, type ChatAnswer, type ChatTurn, type Projection, type ProjectionFile, type ViewQuery, type Views } from "./api.ts";
import { isJsonNumber, parseJson } from "../../src/json.ts";
import { button, element, make } from "./dom.ts";
import { Editor } from "./editor.ts";
import { FileLayoutStore, useLayoutStore } from "./layout-store.ts";
import "./diagrams.css";
import "./studio.css";

/** The pause after the last change of the canvas before the projection is asked again, ms. */
const PROJECTION_DEBOUNCE_MS = 400;

/** Where the pane widths are kept between visits. */
const WIDTHS_KEY = "keylang-studio-widths";

/** The narrowest a pane may be dragged, px. */
const MIN_PANE = 220;

/** The default widths: the canvas (with its palette and properties) takes more than half, the projection and the chat the rest. */
const DEFAULT_WIDTHS: readonly [number, number, number] = [5, 2, 2];

/** The views the studio opens: flows, discovered flows, the layers, and the empty canvas (""). */
function queryOfKey(key: string): ViewQuery | null {
  if (key === "layers") return { view: "layers" };
  const flow = /^(flow|discovered):(.+)$/.exec(key);

  return flow ? { view: flow[1] === "flow" ? "flow" : "discovered", name: flow[2]! } : null;
}

/** Whether `line` names `id` as a whole token (not inside a longer ID). */
function mentions(line: string, id: string): boolean {
  const at = line.indexOf(id);

  if (at === -1) return false;
  const before = line[at - 1] ?? " ";
  const after = line[at + id.length] ?? " ";

  return !/[\w.:]/.test(before) && !/[\w.]/.test(after);
}

/** The widths saved by an earlier visit, or the defaults; storage may be missing or throw. */
function savedWidths(): [number, number, number] {
  try {
    const parsed = parseJson(localStorage.getItem(WIDTHS_KEY) ?? "null");
    const widths = Array.isArray(parsed) ? parsed.filter((n): n is number => isJsonNumber(n) && Number.isFinite(n) && n > 0) : [];

    if (widths.length === 3) return [widths[0]!, widths[1]!, widths[2]!];
  } catch {
    // No storage (a private window, blocked site data): the defaults.
  }

  return [...DEFAULT_WIDTHS];
}

/** The studio page: the editor, the projection, the chat and the splitters between them. */
class Studio {
  private readonly api = new Api();
  readonly editor: Editor;
  private readonly status = element<HTMLDivElement>("status");
  private readonly picker = element<HTMLSelectElement>("studio-view");
  private readonly projectionBox = element<HTMLDivElement>("projection");
  private readonly projectionState = element<HTMLSpanElement>("projection-state");
  private readonly log = element<HTMLDivElement>("chat-log");
  private readonly input = element<HTMLTextAreaElement>("chat-input");
  private readonly send = element<HTMLButtonElement>("chat-send");
  private readonly cancel = element<HTMLButtonElement>("chat-cancel");
  private views: Views | null = null;
  private format: "keylang" | "ts" = "keylang";
  private projected: Projection | null = null;
  /** The selected shapes' keylang IDs, without the `planned:` prefix. */
  private selection: string[] = [];
  private timer = 0;
  /** The number of the newest projection request: an older answer arriving late is dropped. */
  private asked = 0;
  private readonly history: ChatTurn[] = [];
  private pending: AbortController | null = null;
  private widths = savedWidths();

  constructor() {
    // The token leaves the address bar before anything reads the fragment (`#view=`).
    transport();
    useLayoutStore(new FileLayoutStore(this.api));
    this.editor = new Editor(element("editor"), this.api, {
      status: (text) => (this.status.textContent = text),
      views: () => this.views,
      reload: (key) => this.openView(key, true),
      changed: () => this.scheduleProjection(),
      selected: (ids) => {
        this.selection = ids.map((id) => id.replace(/^planned:/, ""));
        this.highlight();
      },
    });
    // The browser tests read the editor and the studio through these.
    Object.assign(window, { keylangEditor: this.editor, keylangStudio: this });
    this.wireTabs();
    this.wireChat();
    this.wireSplitters();
    this.picker.addEventListener("change", () => void this.openView(this.picker.value));
  }

  /** Loads the list of views, opens the one the fragment names (or the first flow), and projects it. */
  async start(): Promise<void> {
    try {
      this.views = await this.api.views();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);

      return;
    }

    this.fillPicker(this.views);
    const wanted = new URLSearchParams(location.hash.slice(1)).get("view");
    const first = this.views.flows[0];
    const key = wanted !== null && [...this.picker.options].some((o) => o.value === wanted) ? wanted : first !== undefined ? `flow:${first}` : "";
    await this.openView(key);
  }

  /** The view menu: the empty canvas, the flows, the discovered flows, the layers. */
  private fillPicker(views: Views): void {
    const group = (label: string, keys: { key: string; text: string }[]): HTMLOptGroupElement | null => {
      if (keys.length === 0) return null;
      const node = document.createElement("optgroup");
      node.label = label;

      for (const { key, text } of keys) node.append(new Option(text, key));

      return node;
    };

    const groups = [
      group("Полотно", [{ key: "", text: "порожнє полотно" }]),
      group("Флоу", views.flows.map((name) => ({ key: `flow:${name}`, text: name }))),
      group("Знайдені флоу", (views.discovered ?? []).map((flow) => ({ key: `discovered:${flow.name}`, text: flow.name }))),
      group("Архітектура", views.layers.length > 0 ? [{ key: "layers", text: "шари" }] : []),
    ];

    this.picker.replaceChildren(...groups.filter((g) => g !== null));
  }

  /** Opens a view on the canvas (`fresh`: from the specs, past this tab's draft) and remembers it in the fragment. */
  async openView(key: string, fresh = false): Promise<void> {
    this.picker.value = key;
    history.replaceState(null, "", `${location.pathname}${key === "" ? "" : `#view=${encodeURIComponent(key)}`}`);
    const query = queryOfKey(key);

    try {
      if (query === null) await this.editor.openEmpty();
      else await this.editor.openDiagram(key, await this.api.diagram(query), fresh);
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
    }

    this.selection = [];
    this.scheduleProjection(0);
  }

  /** Asks for the projection after the canvas has been still for a while. */
  private scheduleProjection(delay = PROJECTION_DEBOUNCE_MS): void {
    window.clearTimeout(this.timer);
    this.projectionState.textContent = "…";
    this.timer = window.setTimeout(() => void this.project(), delay);
  }

  /** The projection of the canvas as it is now, in the chosen format. */
  async project(): Promise<void> {
    const number = ++this.asked;
    const format = this.format;

    try {
      const answer = await this.api.projection(this.editor.currentModel(), this.editor.specHash(), format);

      // A newer request (a later change, another tab) wins.
      if (number !== this.asked) return;
      this.projected = answer;
      this.renderProjection();
    } catch (error) {
      if (number !== this.asked) return;
      this.projected = null;
      this.projectionState.textContent = "";
      this.projectionBox.replaceChildren(make("p", { className: "projection-error", text: error instanceof ApiError ? error.message : String(error) }));
    }
  }

  /** The tabs «keylang» | «TypeScript»: a switch asks for the other projection at once. */
  private wireTabs(): void {
    for (const tab of document.querySelectorAll<HTMLButtonElement>("#pane-projection [data-format]")) {
      tab.addEventListener("click", () => {
        this.format = tab.dataset["format"] === "ts" ? "ts" : "keylang";

        for (const other of document.querySelectorAll<HTMLButtonElement>("#pane-projection [data-format]")) other.setAttribute("aria-selected", String(other === tab));
        this.scheduleProjection(0);
      });
    }
  }

  /** Draws the last projection: per file for keylang, one text for TypeScript; then the highlight. */
  private renderProjection(): void {
    const answer = this.projected;

    if (answer === null) return;
    const blocks: Node[] = [];

    // A drawing the server would not propose (a stale view, a bad shape) says why instead of a text.
    if (answer.error !== null) blocks.push(make("p", { className: "projection-error", text: answer.status === "conflict" ? `${answer.error}` : `не спроєктовано: ${answer.error}` }));

    if (answer.format === "keylang") {
      for (const file of answer.files) blocks.push(this.fileBlock(file));

      if (answer.error === null && answer.files.length === 0) blocks.push(make("p", { className: "projection-empty", text: "Полотно порожнє для специфікацій: намалюйте фігури в «чернетці»." }));

      for (const weakening of answer.weakenings) blocks.push(make("p", { className: "projection-warning", text: `${weakening.file}:${weakening.line}: ${weakening.message}` }));
      const changed = answer.files.filter((f) => f.changed).length;
      this.projectionState.textContent = answer.status === "printed" ? `змінює ${changed} файл(и)` : answer.status === "nothing" ? "без змін" : answer.status;
    } else {
      if (answer.error === null) blocks.push(answer.items.length === 0 ? make("p", { className: "projection-empty", text: "На полотні немає planned-типів, модулів чи fn, а з коду — типів для import." }) : this.codeBlock(answer.text.replace(/\n$/, "").split("\n"), new Set(), "ts"));
      this.projectionState.textContent = answer.error === null ? `${answer.items.length} оголошен${answer.items.length === 1 ? "ня" : "ь"}` : answer.status;
    }

    // With nothing to propose, the state in the head says it already.
    if (answer.status !== "nothing") for (const note of answer.notes) blocks.push(make("p", { className: "projection-note", text: note }));
    this.projectionBox.replaceChildren(...blocks);
    this.highlight();
  }

  /** One spec file of the keylang projection: a head with its state, then its lines with the added ones marked. */
  private fileBlock(file: ProjectionFile): HTMLElement {
    const state = !file.changed ? "без змін" : file.newFile ? "новий файл" : `${file.hunks.length} шматок(ки)`;
    const head = make("div", { className: "file-head" }, make("code", { text: file.path }), make("span", { className: file.changed ? "badge changed" : "badge", text: state }));

    return make("div", { className: "file" }, head, this.codeBlock(file.text.replace(/\n$/, "").split("\n"), new Set(file.added), file.path));
  }

  /** Lines with their numbers; `added` are marked as new. */
  private codeBlock(lines: readonly string[], added: ReadonlySet<number>, source: string): HTMLElement {
    const block = make("div", { className: "code" });
    block.dataset["source"] = source;

    for (const [i, text] of lines.entries()) {
      const row = make("div", { className: added.has(i + 1) ? "line added" : "line" }, make("span", { className: "ln", text: String(i + 1) }), make("span", { className: "tx", text: text === "" ? " " : text }));
      row.dataset["line"] = String(i + 1);
      block.append(row);
    }

    return block;
  }

  /** Marks the lines of the selected IDs: lines that name them in keylang, the declarations of them in TypeScript; the first one scrolls into view. */
  private highlight(): void {
    const answer = this.projected;

    for (const row of this.projectionBox.querySelectorAll(".line.hit")) row.classList.remove("hit");

    if (answer === null || this.selection.length === 0) return;
    const hits: Element[] = [];

    if (answer.format === "keylang") {
      for (const row of this.projectionBox.querySelectorAll(".line")) {
        const text = row.querySelector(".tx")?.textContent ?? "";

        if (this.selection.some((id) => mentions(text, id))) hits.push(row);
      }
    } else {
      // A planned fn is a method of its module's interface: the module's item holds it.
      const items = answer.items.filter((item) => this.selection.some((id) => id === item.id || id.startsWith(`${item.id}.`)));
      const rows = [...this.projectionBox.querySelectorAll<HTMLElement>(".line")];

      for (const item of items) hits.push(...rows.filter((row) => Number(row.dataset["line"]) >= item.from && Number(row.dataset["line"]) <= item.to));
    }

    for (const row of hits) row.classList.add("hit");
    hits[0]?.scrollIntoView({ block: "nearest" });
  }

  /** The chat form: Enter with Ctrl (or Cmd) or the button sends; «Скасувати» drops the request. */
  private wireChat(): void {
    element<HTMLFormElement>("chat-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.ask();
    });

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void this.ask();
      }
    });

    this.cancel.addEventListener("click", () => this.pending?.abort());
    this.say("clip", "Я бачу вибраний вид, виділені фігури, специфікацію виду й те, що полотно додає до неї. Попросіть змінити специфікацію — відповідь прийде пропозицією, яку можна прийняти чи відхилити.");
  }

  /** Sends the person's message with the studio's context, and shows the answer and its proposal. */
  async ask(): Promise<void> {
    const text = this.input.value.trim();

    if (text === "" || this.pending !== null) return;
    this.input.value = "";
    this.history.push({ role: "you", text });
    this.say("you", text);
    const waiting = this.say("wait", "думаю…");
    const controller = new AbortController();
    this.pending = controller;
    this.busy(true);

    try {
      const answer = await this.api.chat({ history: this.history, view: this.editor.view(), selection: this.selection, model: this.editor.currentModel(), specHash: this.editor.specHash() }, controller.signal);
      waiting.remove();
      this.answered(answer);
    } catch (error) {
      waiting.remove();
      // The person's message stays in the log but not in the history the model reads: it was never answered.
      this.history.pop();
      const cancelled = controller.signal.aborted;
      const reason = error instanceof Error ? error.message : String(error);
      // 409: no model; the reason says what to set up.
      this.say("error", cancelled ? "скасовано" : error instanceof ApiError && error.status === 409 ? `Агента не налаштовано. ${reason}` : reason);
    } finally {
      this.pending = null;
      this.busy(false);
    }
  }

  /** The model's answer in the log and the history; its proposal as a card. */
  private answered(answer: ChatAnswer): void {
    const notes = [...(answer.refused !== null ? [`пропозицію не записано: ${answer.refused}`] : []), ...(answer.dropped.length > 0 ? [`відкинуто: ${answer.dropped.join(", ")} — береться лише перший закритий блок keylang path=`] : [])];
    const shown = [answer.reply, ...notes].filter((line) => line !== "").join("\n\n");
    // The history keeps what the model said and that a proposal was made, so the next question can refer to it.
    this.history.push({ role: "clip", text: [answer.reply, answer.proposal ? `(proposal written for ${answer.proposal.target})` : ""].filter((l) => l !== "").join("\n") });
    const message = this.say("clip", shown || "(порожня відповідь)");

    if (answer.agent !== null) message.title = answer.agent;

    if (answer.proposal !== null) this.log.append(this.proposalCard(answer.proposal));
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** A proposal of the chat: its target, its hunks, «Прийняти» and «Відхилити». */
  private proposalCard(proposal: NonNullable<ChatAnswer["proposal"]>): HTMLElement {
    const card = make("div", { className: "proposal" });
    card.dataset["target"] = proposal.target;
    const result = make("p", { className: "proposal-result" });
    const head = make("div", { className: "proposal-head" }, make("code", { text: proposal.target }), make("span", { className: "badge changed", text: proposal.newFile ? "новий файл" : `${proposal.hunks.length} шматок(ки)` }));
    const hunks = make("div", { className: "hunks" });

    for (const hunk of proposal.hunks) {
      const block = make("div", { className: "hunk" }, make("div", { className: "hunk-head", text: `@@ рядок ${hunk.line} @@` }));

      for (const line of hunk.removed) block.append(make("div", { className: "del", text: `-${line}` }));

      for (const line of hunk.added) block.append(make("div", { className: "add", text: `+${line}` }));
      hunks.append(block);
    }

    const accept = button("Прийняти", () => void this.decide(card, proposal.target, "accept"), { className: "accept", title: "Записати пропозицію в специфікацію" });
    const reject = button("Відхилити", () => void this.decide(card, proposal.target, "reject"), { className: "reject", title: "Видалити пропозицію, специфікація лишається як є" });
    card.append(head, hunks, make("div", { className: "proposal-actions" }, accept, reject), result);

    return card;
  }

  /** Accepts or rejects a proposal; after an accept the view is drawn again from the specs. */
  private async decide(card: HTMLElement, target: string, action: "accept" | "reject"): Promise<void> {
    const result = card.querySelector<HTMLElement>(".proposal-result")!;

    for (const b of card.querySelectorAll("button")) b.disabled = true;

    try {
      const done = await this.api.decideProposal(target, action);
      card.dataset["state"] = action === "accept" ? "accepted" : "rejected";
      result.textContent = action === "reject" ? "відхилено: специфікація без змін" : done.status === "unchanged" ? "специфікація вже така: нічого не записано" : `прийнято: ${target} оновлено${done.kept ? ` (${done.kept})` : ""}`;

      // The spec changed: the view is drawn again from it, and projected.
      if (action === "accept") await this.openView(this.editor.view(), true);
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : String(error);

      for (const b of card.querySelectorAll("button")) b.disabled = false;
    }
  }

  /** Adds one message to the log. */
  private say(role: "you" | "clip" | "wait" | "error", text: string): HTMLElement {
    const label = role === "you" ? "ви" : role === "clip" ? "агент" : role === "error" ? "помилка" : "";
    const message = make("div", { className: `msg ${role}` }, ...(label === "" ? [] : [make("span", { className: "who", text: label })]), make("div", { className: "body", text }));
    this.log.append(message);
    this.log.scrollTop = this.log.scrollHeight;

    return message;
  }

  /** While a request runs: the send button waits, «Скасувати» is on. */
  private busy(on: boolean): void {
    this.send.disabled = on;
    this.cancel.disabled = !on;
  }

  /** The splitters: a drag (or the arrow keys) moves the border between two panes; the widths are kept. */
  private wireSplitters(): void {
    const grid = element<HTMLDivElement>("studio");
    this.applyWidths(grid);

    for (const splitter of document.querySelectorAll<HTMLElement>(".splitter")) {
      const index = Number(splitter.dataset["split"]);

      // Pointer drags: the border follows the pointer, in pixels converted back to shares.
      splitter.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        splitter.setPointerCapture(event.pointerId);
        splitter.classList.add("dragging");

        const move = (moved: PointerEvent): void => this.moveBorder(grid, index, moved.clientX);

        const stop = (): void => {
          splitter.classList.remove("dragging");
          splitter.removeEventListener("pointermove", move);
          splitter.removeEventListener("pointerup", stop);
          this.saveWidths();
        };

        splitter.addEventListener("pointermove", move);
        splitter.addEventListener("pointerup", stop);
      });

      // Keys: 24 px a press, for a person without a pointer.
      splitter.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const box = splitter.getBoundingClientRect();
        this.moveBorder(grid, index, box.left + box.width / 2 + (event.key === "ArrowLeft" ? -24 : 24));
        this.saveWidths();
      });
    }
  }

  /** Moves the border right of pane `index` to `x` (client px), keeping both neighbours at least `MIN_PANE`. */
  private moveBorder(grid: HTMLElement, index: number, x: number): void {
    const panes = [...grid.querySelectorAll<HTMLElement>(":scope > .pane")];
    const left = panes[index]!.getBoundingClientRect();
    const right = panes[index + 1]!.getBoundingClientRect();
    const total = left.width + right.width;
    const leftWidth = Math.min(total - MIN_PANE, Math.max(MIN_PANE, x - left.left));
    // The two panes share their old total in the new proportion; the third keeps its share.
    const share = this.widths[index]! + this.widths[index + 1]!;
    this.widths[index] = (share * leftWidth) / total;
    this.widths[index + 1] = (share * (total - leftWidth)) / total;
    this.applyWidths(grid);
  }

  private applyWidths(grid: HTMLElement): void {
    grid.style.gridTemplateColumns = `${this.widths[0]}fr 6px ${this.widths[1]}fr 6px ${this.widths[2]}fr`;
  }

  private saveWidths(): void {
    try {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify(this.widths));
    } catch {
      // No storage: the widths last until the tab closes.
    }
  }
}

void new Studio().start();
