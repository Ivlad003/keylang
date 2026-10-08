// The clipboard side of copy and paste between tabs and repositories
// (business-flows/25). Everything travels as one `text/plain`: the Markdown
// bundle of `keylang flow export` with the copied shapes in its
// ```keylang-layout``` block — browsers carry no custom MIME type between
// origins, and two `keylang web` on two ports are two origins. Writing goes
// through `navigator.clipboard.writeText`; where the page may not (no
// permission, no secure context) a dialog shows the text selected, for
// Ctrl+C. Pasting reads the `paste` event (or `readText`), and a dialog with
// a field to paste into is the way when neither works. The layer dialog maps
// the bundle's layers onto this repository's before anything is written.
//
// A pasted text is data: the page only checks its header and sends it to
// `/api/bundle-import`, which parses it; nothing in it is run or shown as
// HTML (every text goes through `textContent`).

import type { BundleImport } from "./api.ts";
import { button, make } from "./dom.ts";

/** The first characters of a bundle's header line. */
export const BUNDLE_HEADER = "<!-- keylang:bundle format=";

/** Whether a pasted text is a keylang bundle: its header comment on a line of its own. */
export function isBundle(text: string): boolean {
  return text.replace(/\r\n/g, "\n").split("\n").some((line) => line.startsWith(BUNDLE_HEADER));
}

/** A modal over the page: a titled box with a body and buttons; `close()` removes it. */
function modal(id: string, title: string): { box: HTMLDivElement; body: HTMLDivElement; actions: HTMLDivElement; close: () => void } {
  document.getElementById(id)?.remove();
  const overlay = make("div", { className: "bundle-overlay" });
  overlay.id = id;
  const box = make("div", { className: "bundle-dialog" });
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", title);
  const body = make("div", { className: "bundle-body" });
  const actions = make("div", { className: "bundle-actions" });
  box.append(make("h2", { text: title }), body, actions);
  overlay.append(box);
  document.body.append(overlay);
  return { box, body, actions, close: () => overlay.remove() };
}

/**
 * Puts the text in the clipboard; where the browser refuses, a dialog shows it
 * selected with the words to copy it by hand. Says which way it went.
 */
export async function writeClipboard(text: string): Promise<"clipboard" | "dialog"> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
    await navigator.clipboard.writeText(text);
    return "clipboard";
  } catch {
    showCopyDialog(text);
    return "dialog";
  }
}

/** The fallback of a copy: the bundle in a field, selected; Ctrl+C (⌘C) copies it. */
export function showCopyDialog(text: string): void {
  const dialog = modal("bundle-copy-dialog", "Копіювати пакет");
  const area = make("textarea", { className: "bundle-text" });
  area.id = "bundle-copy-text";
  area.readOnly = true;
  area.value = text;
  dialog.body.append(make("p", { text: "Браузер не дав записати в буфер обміну. Текст пакета виділено: натисніть Ctrl+C (⌘C на Mac), потім вставте його в іншу вкладку keylang web (Ctrl+V у редакторі чи «Вставити пакет…»)." }), area);
  const close = button("Закрити", () => dialog.close());
  close.id = "bundle-copy-close";
  dialog.actions.append(close);
  area.focus();
  area.select();
}

/** A field to paste a bundle into by hand (when the clipboard cannot be read): the text, or null when cancelled. */
export function askPasteText(): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = modal("bundle-paste-dialog", "Вставити пакет");
    const area = make("textarea", { className: "bundle-text" });
    area.id = "bundle-paste-text";
    area.placeholder = "Вставте сюди пакет keylang (Ctrl+V): текст, який скопіювала інша вкладка keylang web чи `keylang flow export`";
    dialog.body.append(area);
    const done = (value: string | null): void => {
      dialog.close();
      resolve(value);
    };
    const ok = button("Вставити", () => done(area.value));
    ok.id = "bundle-paste-ok";
    const cancel = button("Скасувати", () => done(null));
    dialog.actions.append(ok, cancel);
    area.focus();
  });
}

/**
 * The layer dialog of a paste from another repository: each layer of the
 * bundle → a layer here (a select, prefilled with the import's choice), the
 * import's notes, «запитати модель» (the same import in `hybrid` mode, its
 * choices fill the selects) and «Імпортувати». The map, or null when cancelled.
 */
export function mapLayers(preview: BundleImport, askModel: (current: Record<string, string>) => Promise<BundleImport>): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const dialog = modal("bundle-dialog", `Вставка пакета з ${preview.header.repo}@${preview.header.commit.slice(0, 12)}`);
    const targets = preview.targetLayers ?? [];
    const sources = new Map((preview.sourceLayers ?? []).map((l) => [l.name, l.description]));
    dialog.body.append(
      make("p", { text: `Флоу: ${preview.flows.join(", ")}. ID, яких тут немає, стануть planned із сигнатурами; результат — пропозиції ${preview.target ?? "фічі"} і ${preview.migrationTarget ?? "таблиці відповідності"} (злиття — MERGE чи keylang proposals accept).` }),
      make("p", { className: "bundle-hint", text: "Текст пакета — дані з іншого репозиторію: він не виконується; модель, якщо її запитати, бачить його як недовірений." }),
    );
    const table = make("table", { className: "bundle-layers" });
    table.append(make("tr", {}, make("th", { text: "шар пакета" }), make("th", { text: "→ шар тут" }), make("th", { text: "як вибрано" })));
    const selects = new Map<string, HTMLSelectElement>();
    const how = new Map<string, HTMLTableCellElement>();
    const fill = (answer: BundleImport): void => {
      for (const choice of answer.layers ?? []) {
        const select = selects.get(choice.from);
        if (select && targets.some((t) => t.name === choice.to)) select.value = choice.to;
        const cell = how.get(choice.from);
        if (cell) cell.textContent = BY[choice.by] ?? choice.by;
      }
    };
    for (const layer of preview.used ?? []) {
      const select = make("select");
      select.id = `bundle-layer-${layer}`;
      select.dataset["layer"] = layer;
      for (const target of targets) {
        const option = make("option", { text: target.name, title: target.description });
        option.value = target.name;
        select.append(option);
      }
      const cell = make("td");
      select.addEventListener("change", () => (cell.textContent = BY["flag"]!));
      selects.set(layer, select);
      how.set(layer, cell);
      table.append(make("tr", {}, make("td", { title: sources.get(layer) ?? "" }, make("code", { text: layer })), make("td", {}, select), cell));
    }
    dialog.body.append(table);
    const notes = make("ul", { className: "bundle-notes" });
    notes.id = "bundle-notes";
    const showNotes = (list: readonly string[]): void => notes.replaceChildren(...list.map((text) => make("li", { text })));
    showNotes(preview.notes ?? []);
    dialog.body.append(notes);
    fill(preview);
    const current = (): Record<string, string> => Object.fromEntries([...selects].map(([from, select]) => [from, select.value]));
    const done = (value: Record<string, string> | null): void => {
      dialog.close();
      resolve(value);
    };
    const ask = button("запитати модель", () => {
      ask.disabled = true;
      ask.textContent = "модель думає…";
      askModel(current())
        .then((answer) => {
          fill(answer);
          showNotes([...(answer.agent ? [`модель: ${answer.agent}`] : []), ...(answer.notes ?? [])]);
        })
        .catch((error: unknown) => showNotes([`модель не відповіла: ${error instanceof Error ? error.message : String(error)}`]))
        .finally(() => {
          ask.disabled = false;
          ask.textContent = "запитати модель";
        });
    }, { title: "Запропонувати відповідність шарів моделлю (той самий шлях, що flow import --mode hybrid); рішення — ваше" });
    ask.id = "bundle-ask-model";
    const ok = button("Імпортувати", () => done(current()), { title: "Пропозиції фічі й таблиці відповідності; фігури — на полотно біля курсора" });
    ok.id = "bundle-import";
    const cancel = button("Скасувати", () => done(null));
    cancel.id = "bundle-cancel";
    dialog.actions.append(ask, ok, cancel);
    ok.focus();
  });
}

/** How a layer's choice was made, in the words of the dialog. */
const BY: Record<string, string> = { same: "та сама назва", first: "перший шар (за браком кращого)", model: "модель", flag: "ви" };
