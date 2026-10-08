// «Новий проєкт» of the diagram page (business-flows/29): a project drawn
// before it has code. When the served root has no keylang.json
// (`GET /api/greenfield`), the list's header gets a «Новий проєкт» button,
// and `keylang web --new <dir>` opens the page with it pressed (`#new=1`).
// It opens the editor on an empty canvas in «чернетка» with a panel above it:
// a template of lanes («4 шари», «hexagonal», «порожньо»), the languages, the
// idea, and «Створити специфікацію», which sends the canvas
// (`currentModel()`) to `POST /api/greenfield`. The server writes the first
// files of the project — keylang.json, rules.md, a feature per process, the
// idea, the layout — only files that do not exist; the panel then lists them
// and the commands that come next. From then on the project is like any
// other: the list shows its flows, planned ◇ until the agent builds them.

import { ApiError, takeToken } from "./api.ts";
import { button, make } from "./dom.ts";
import { PALETTE, type Editor } from "./editor.ts";
import "./greenfield.css";

/** The lanes of a template, from the highest layer to the lowest. */
export const TEMPLATES: Readonly<Record<string, { text: string; lanes: readonly string[] }>> = {
  layers: { text: "4 шари", lanes: ["presentation", "application", "infrastructure", "domain"] },
  hexagonal: { text: "hexagonal", lanes: ["adapters", "ports", "domain"] },
  empty: { text: "порожньо", lanes: [] },
};

const LANGUAGES: readonly [string, string][] = [
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["php", "PHP"],
  ["rust", "Rust"],
];

/** The gap between two lanes of a template, model units. */
const LANE_GAP = 20;

interface Availability {
  available: boolean;
  reason: string | null;
  root: string;
}

interface Answer {
  status: "written" | "conflict" | "invalid" | "failed";
  error: string | null;
  files: string[];
  layers: string[];
  features: { slug: string; file: string; planned: string[] }[];
  notes: string[];
  next: string[];
}

async function call<T>(method: "GET" | "POST", body?: unknown): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${takeToken()}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch("/api/greenfield", { method, headers, cache: "no-store", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(response.status, text.trim() || response.statusText);
  }
  return { status: response.status, body: parsed as T };
}

/** The panel above the editor while a new project is drawn. */
class Greenfield {
  private readonly editor: Editor;
  private readonly status: (text: string) => void;
  private readonly panel: HTMLElement;
  private readonly result: HTMLElement;
  private readonly start: HTMLButtonElement;
  private readonly template: HTMLSelectElement;
  private readonly idea: HTMLTextAreaElement;
  private readonly create: HTMLButtonElement;
  private done = false;

  constructor(editor: Editor, status: (text: string) => void) {
    this.editor = editor;
    this.status = status;
    this.start = button("Новий проєкт", () => void this.open(), { title: "Порожнє полотно з шаблоном доріжок: намалюйте проєкт і створіть його специфікацію" });
    this.start.id = "greenfield-new";
    this.start.className = "greenfield-new";
    document.querySelector("#list header")?.append(this.start);

    this.template = make("select", { title: "Шаблон доріжок" });
    this.template.id = "greenfield-template";
    for (const [value, template] of Object.entries(TEMPLATES)) {
      const option = make("option", { text: template.text });
      option.value = value;
      this.template.append(option);
    }
    const apply = button("намалювати доріжки", () => this.applyTemplate(), { title: "Додати доріжки шаблону на полотно" });
    apply.id = "greenfield-apply";
    const languages = make("span", { className: "greenfield-languages" });
    for (const [value, text] of LANGUAGES) {
      const label = make("label");
      const box = make("input");
      box.type = "checkbox";
      box.id = `greenfield-lang-${value}`;
      box.value = value;
      box.checked = value === "typescript";
      label.append(box, ` ${text}`);
      languages.append(label);
    }
    this.idea = make("textarea", { title: "Ідея проєкту: піде в keylang/README.md" });
    this.idea.id = "greenfield-idea";
    this.idea.rows = 2;
    this.idea.placeholder = "Ідея: що це за проєкт і для кого";
    this.create = button("Створити специфікацію", () => void this.submit(), { title: "keylang.json, rules.md, фічі процесів, ідея й розкладка — лише в порожній проєкт, лише файли, яких ще немає" });
    this.create.id = "greenfield-create";
    const hide = button("×", () => (this.panel.hidden = true), { title: "Сховати" });
    hide.className = "greenfield-hide";
    this.result = make("div", { className: "greenfield-result" });
    this.result.id = "greenfield-result";
    this.result.hidden = true;
    this.panel = make(
      "section",
      { className: "greenfield" },
      make("strong", { text: "Новий проєкт" }),
      make("span", { className: "greenfield-label", text: "шаблон:" }),
      this.template,
      apply,
      make("span", { className: "greenfield-label", text: "мови:" }),
      languages,
      this.idea,
      this.create,
      hide,
      this.result,
    );
    this.panel.id = "greenfield";
    this.panel.setAttribute("aria-label", "Новий проєкт");
    this.panel.hidden = true;
    document.getElementById("editor")?.prepend(this.panel);
  }

  /** The editor on an empty canvas in «чернетка», the panel over it; a fresh canvas gets the chosen template. */
  async open(): Promise<void> {
    if (location.hash.slice(1) !== "view=editor&of=") location.hash = "view=editor&of=";
    // The page opens the editor on the hash change: wait for its empty canvas.
    for (let i = 0; i < 100 && (document.body.dataset["mode"] !== "editor" || this.editor.view() !== ""); i++) await new Promise((done) => setTimeout(done, 30));
    this.editor.setMode("draft");
    this.panel.hidden = false;
    if (this.editor.currentModel().lanes.length === 0 && this.editor.currentModel().nodes.length === 0) this.applyTemplate();
    this.status("новий проєкт · чернетка: доріжки — шари (верхня — найвищий), тригер і кроки — процес; далі «Створити специфікацію»");
  }

  /** The lanes of the chosen template below what the canvas has, each renamed to its layer. */
  applyTemplate(): void {
    const lanes = TEMPLATES[this.template.value]?.lanes ?? [];
    const entry = PALETTE.find((item) => item.kind === "lane");
    if (!entry || lanes.length === 0) return;
    this.editor.setMode("draft");
    const model = this.editor.currentModel();
    const taken = new Set(model.lanes.map((lane) => lane.id.replace(/^planned:/, "")));
    let y = model.lanes.reduce((bottom, lane) => Math.max(bottom, lane.y + lane.h + LANE_GAP), 0);
    for (const name of lanes) {
      if (taken.has(name)) continue;
      const cell = this.editor.addFromPalette(entry, { x: 0, y });
      if (cell) this.editor.updateShape(cell, { id: `planned:${name}` });
      y += entry.size[1] + LANE_GAP;
    }
    this.editor.graph.clearSelection();
    this.editor.fit();
  }

  private async submit(): Promise<void> {
    const languages = [...this.panel.querySelectorAll<HTMLInputElement>(".greenfield-languages input:checked")].map((box) => box.value);
    await this.editor.flush();
    this.create.disabled = true;
    let answer: { status: number; body: Answer };
    try {
      answer = await call<Answer>("POST", { model: this.editor.currentModel(), languages, idea: this.idea.value });
    } catch (error) {
      this.create.disabled = false;
      this.show(null, error instanceof Error ? error.message : String(error));
      return;
    }
    if (answer.body.status !== "written") {
      this.create.disabled = false;
      this.show(answer.body, answer.body.error ?? `HTTP ${answer.status}`);
      return;
    }
    this.done = true;
    this.start.hidden = true;
    this.show(answer.body, null);
  }

  /** The answer under the panel: the files, the features with their planned IDs, the next commands, or why nothing was written. */
  private show(answer: Answer | null, error: string | null): void {
    const items: Node[] = [];
    if (error !== null) {
      items.push(make("p", { className: "greenfield-error", text: `Не створено: ${error}` }));
      for (const note of answer?.notes ?? []) items.push(make("p", { text: note }));
      this.result.dataset["status"] = answer?.status ?? "failed";
    } else if (answer) {
      items.push(make("p", { text: `Створено файлів: ${answer.files.length}. Шари: ${answer.layers.join(" · ")}.` }));
      const files = make("ul");
      for (const file of answer.files) {
        const row = make("li", {}, make("code", { text: file }));
        row.dataset["file"] = file;
        files.append(row);
      }
      items.push(files);
      for (const feature of answer.features) items.push(make("p", {}, make("code", { text: feature.file }), ` — planned: ${feature.planned.length} (◇ ${feature.planned.join(", ")})`));
      for (const note of answer.notes) items.push(make("p", { className: "greenfield-note", text: note }));
      items.push(make("p", { text: "Далі, у терміналі в корені проєкту:" }));
      const next = make("ol");
      next.id = "greenfield-next";
      for (const command of answer.next) next.append(make("li", {}, make("code", { text: command })));
      items.push(next);
      items.push(make("p", { text: "Флоу з'являться в списку «Діаграми»: planned ◇, а коли агент напише код і ви виконаєте `keylang map` — ✓ чи ✗." }));
      this.result.dataset["status"] = "written";
    }
    this.result.replaceChildren(...items);
    this.result.hidden = false;
    this.status(error === null ? `створено: ${answer?.files.length ?? 0} файлів; далі ${answer?.next[0] ?? ""}` : `не створено: ${error}`);
  }

  written(): boolean {
    return this.done;
  }
}

/**
 * Mounts «Новий проєкт» when the served root has no keylang.json; with
 * `#new=1` in the address (`keylang web --new`), opens it at once. Nothing
 * when the project exists: a drawing there becomes proposals.
 */
export async function mountGreenfield(editor: Editor, status: (text: string) => void): Promise<void> {
  const wanted = new URLSearchParams(location.hash.slice(1)).get("new") === "1";
  let availability: Availability;
  try {
    availability = (await call<Availability>("GET")).body;
  } catch {
    return;
  }
  if (!availability.available) {
    if (wanted) status(`новий проєкт: ${availability.reason ?? "недоступно"}`);
    return;
  }
  const greenfield = new Greenfield(editor, status);
  (window as unknown as { keylangGreenfield: unknown }).keylangGreenfield = greenfield;
  if (wanted) await greenfield.open();
}
