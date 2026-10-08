// The properties panel of the diagram editor (business-flows/23c), on the
// right of the canvas: the selected shape's ID (with suggestions from
// `/api/views` and `GET /api/ids?prefix=`), kind, a start event's trigger, a
// parallel gateway's role, the signature of a `planned` shape, its tests as
// `test <file> "<name>"` lines and a description; for a connection, its
// meaning and label. «з коду» shows the same fields read-only, except a
// note's text. Every change goes through the editor (editor.ts), so it is one
// step of undo.

import type { Api, Views } from "./api.ts";
import { make } from "./dom.ts";
import type { Cell } from "@maxgraph/core";
import { LINK_NAMES, SHAPE_NAMES, TRIGGERS, type Link, type LinkKind, type Shape, type ShapeKind } from "./editor.ts";

/** A line of the tests field: `test <file> "<name>"`. */
export const TEST_LINE = /^test\s+(\S+)\s+"([^"]+)"$/;

/** What the panel needs of the editor. */
export interface PanelEditor {
  mode(): "code" | "draft";
  /** Replaces a shape's keylang side (one undoable change); a refusal comes back as text. */
  updateShape(cell: Cell, patch: Partial<Pick<Shape, "id" | "label" | "kind" | "trigger" | "role" | "signature" | "tests" | "description">>): string | null;
  updateLink(cell: Cell, patch: Partial<Pick<Link, "kind" | "label">>): string | null;
}

/** Kinds a person may give a shape in the panel: a lane stays a lane, a group a group. */
const SHAPE_CHOICES: readonly ShapeKind[] = ["module", "fn", "type", "start", "task", "gateway", "parallel", "event", "timer", "external", "hole", "note", "layer"];

/** Kinds whose shape names a keylang entity, so it has an ID. */
const NAMED: ReadonlySet<ShapeKind> = new Set(["lane", "layer", "module", "fn", "type", "start", "task", "event", "external"]);

export class Properties {
  private readonly root: HTMLElement;
  private readonly api: Api;
  private readonly editor: PanelEditor;
  private readonly views: () => Views | null;
  private readonly ids: HTMLDataListElement;
  private cell: Cell | null = null;
  private lookup = 0;

  constructor(root: HTMLElement, api: Api, editor: PanelEditor, views: () => Views | null) {
    this.root = root;
    this.api = api;
    this.editor = editor;
    this.views = views;
    this.ids = make("datalist");
    this.ids.id = "editor-ids";
    this.show(null);
  }

  /** Draws the panel for one cell (a shape or a connection), or the hint for none. */
  show(cell: Cell | null): void {
    this.cell = cell;
    const value: unknown = cell?.getValue();
    const body: Node[] = [];
    if (value && typeof value === "object" && "kind" in value && cell?.isVertex()) body.push(...this.shapeFields(cell, value as Shape));
    else if (value && typeof value === "object" && "kind" in value && cell?.isEdge()) body.push(...this.linkFields(cell, value as Link));
    else body.push(make("p", { className: "empty", text: "Виберіть фігуру чи з'єднання: тут їхні ID, вид, сигнатура, тести й опис. Нове з'єднання — тягніть від стрілки, що з'являється над фігурою в «чернетці»." }));
    this.root.replaceChildren(...body, this.ids);
  }

  /** The cell the panel shows. */
  current(): Cell | null {
    return this.cell;
  }

  private field(label: string, input: HTMLElement, note?: string): HTMLElement {
    const row = make("label", { className: "prop" }, make("span", { className: "prop-name", text: label }), input);
    if (note) row.append(make("span", { className: "prop-note", text: note }));
    return row;
  }

  private error(text: string | null): void {
    const box = this.root.querySelector<HTMLElement>(".prop-error");
    if (box) {
      box.textContent = text ?? "";
      box.hidden = !text;
    }
  }

  private shapeFields(cell: Cell, shape: Shape): Node[] {
    const code = this.editor.mode() === "code";
    // «з коду» changes only notes; a note's text is layout.
    const locked = code && shape.kind !== "note";
    const out: Node[] = [make("h2", { text: SHAPE_NAMES[shape.kind] ?? shape.kind }), make("p", { className: "prop-key", text: shape.key })];
    if (locked) out.push(make("p", { className: "prop-hint", text: "«з коду»: тут змінюються лише розкладка й примітки; зміст — у «чернетці»." }));
    const apply = (patch: Parameters<PanelEditor["updateShape"]>[1]): void => {
      const refused = this.editor.updateShape(cell, patch);
      this.error(refused);
      if (!refused) this.show(cell);
    };

    if (NAMED.has(shape.kind)) {
      const id = make("input");
      id.id = "prop-id";
      id.value = shape.id;
      id.disabled = locked;
      id.setAttribute("list", "editor-ids");
      id.autocomplete = "off";
      id.spellcheck = false;
      id.placeholder = "planned:<шар>.<назва> чи ID з коду";
      id.addEventListener("input", () => this.suggest(id.value));
      id.addEventListener("focus", () => this.suggest(id.value));
      id.addEventListener("change", () => apply({ id: id.value.trim() }));
      out.push(this.field("ID", id, shape.id.startsWith("planned:") ? "planned: ще не в коді" : undefined));
    } else if (shape.kind !== "note" && shape.kind !== "group" && shape.kind !== "parallel" && shape.kind !== "hole") {
      const label = make("input");
      label.id = "prop-label";
      label.value = shape.label;
      label.disabled = locked;
      label.addEventListener("change", () => apply({ label: label.value }));
      out.push(this.field(shape.kind === "gateway" ? "умова" : shape.kind === "timer" ? "after / every" : "мітка", label));
    }

    if (shape.kind !== "lane" && shape.kind !== "group") {
      const kind = make("select");
      kind.id = "prop-kind";
      kind.disabled = locked;
      for (const choice of SHAPE_CHOICES) {
        const option = make("option", { text: SHAPE_NAMES[choice] ?? choice });
        option.value = choice;
        option.selected = choice === shape.kind;
        kind.append(option);
      }
      kind.addEventListener("change", () => apply({ kind: kind.value as ShapeKind }));
      out.push(this.field("вид", kind));
    }
    if (shape.kind === "start") {
      const trigger = make("select");
      trigger.id = "prop-trigger";
      trigger.disabled = locked;
      for (const choice of TRIGGERS) {
        const option = make("option", { text: choice });
        option.value = choice;
        option.selected = choice === shape.trigger;
        trigger.append(option);
      }
      trigger.addEventListener("change", () => apply({ trigger: trigger.value }));
      out.push(this.field("тригер", trigger));
    }
    if (shape.kind === "parallel") {
      const role = make("select");
      role.id = "prop-role";
      role.disabled = locked;
      for (const choice of ["split", "join"] as const) {
        const option = make("option", { text: choice === "split" ? "розгалуження" : "злиття" });
        option.value = choice;
        option.selected = choice === shape.role;
        role.append(option);
      }
      role.addEventListener("change", () => apply({ role: role.value as "split" | "join" }));
      out.push(this.field("роль", role));
    }
    if (NAMED.has(shape.kind) && shape.kind !== "lane" && shape.kind !== "layer") {
      const planned = shape.id.startsWith("planned:");
      const signature = make("input");
      signature.id = "prop-signature";
      signature.value = shape.signature;
      signature.disabled = locked || !planned;
      signature.placeholder = planned ? "(order: Order) => Receipt" : "лише для planned";
      signature.spellcheck = false;
      signature.addEventListener("change", () => apply({ signature: signature.value.trim() }));
      out.push(this.field("сигнатура", signature, planned ? undefined : "сигнатура є в коді"));

      const tests = make("textarea");
      tests.id = "prop-tests";
      tests.rows = 3;
      tests.value = shape.tests.join("\n");
      tests.disabled = locked;
      tests.spellcheck = false;
      tests.placeholder = 'test tests/order.test.ts "creates an order"';
      tests.addEventListener("change", () => {
        const lines = tests.value
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== "");
        const bad = lines.find((line) => !TEST_LINE.test(line));
        if (bad !== undefined) return this.error(`не рядок тесту: ${bad} — потрібно test <файл> "<назва>"`);
        apply({ tests: lines });
      });
      out.push(this.field("тести", tests, 'по рядку: test <файл> "<назва>"'));
    }
    if (shape.kind !== "group") {
      const description = make("textarea");
      description.id = "prop-description";
      description.rows = shape.kind === "note" ? 5 : 3;
      description.value = shape.description;
      description.disabled = locked;
      description.addEventListener("change", () => apply({ description: description.value }));
      out.push(this.field(shape.kind === "note" ? "текст" : "опис", description));
    }
    if (shape.reason) out.push(make("h3", { text: "чому маршрут не доведено" }), make("p", { className: "prop-reason", text: shape.reason }));
    if (shape.verdict) out.push(make("p", { className: "prop-key", text: `вердикт: ${shape.verdict}` }));
    const error = make("p", { className: "prop-error" });
    error.id = "prop-error";
    error.hidden = true;
    error.setAttribute("role", "alert");
    out.push(error);
    return out;
  }

  private linkFields(cell: Cell, link: Link): Node[] {
    const locked = this.editor.mode() === "code";
    const out: Node[] = [make("h2", { text: "з'єднання" }), make("p", { className: "prop-key", text: link.key })];
    if (locked) out.push(make("p", { className: "prop-hint", text: "«з коду»: з'єднання моделі лише згинаються; зміст — у «чернетці»." }));
    const kind = make("select");
    kind.id = "prop-link-kind";
    kind.disabled = locked;
    for (const [value, text] of Object.entries(LINK_NAMES)) {
      const option = make("option", { text });
      option.value = value;
      option.selected = value === link.kind;
      kind.append(option);
    }
    const apply = (patch: Parameters<PanelEditor["updateLink"]>[1]): void => {
      const refused = this.editor.updateLink(cell, patch);
      this.error(refused);
      if (!refused) this.show(cell);
      else kind.value = link.kind;
    };
    kind.addEventListener("change", () => apply({ kind: kind.value as LinkKind }));
    out.push(this.field("значення", kind));
    const label = make("input");
    label.id = "prop-link-label";
    label.value = link.label;
    label.disabled = locked;
    label.addEventListener("change", () => apply({ label: label.value }));
    out.push(this.field("мітка", label));
    const error = make("p", { className: "prop-error" });
    error.id = "prop-error";
    error.hidden = true;
    error.setAttribute("role", "alert");
    out.push(error);
    return out;
  }

  /** Suggestions for the ID field: the views' IDs and layers at once, then the snapshot's under the prefix. */
  private suggest(prefix: string): void {
    const views = this.views();
    const known = new Set<string>([...(views?.layers ?? []), ...(views?.entries ?? []).map((e) => e.id), ...(views?.flowList ?? []).flatMap((f) => f.ids ?? [])]);
    const fill = (ids: Iterable<string>): void => {
      const options = [...new Set(ids)]
        .filter((id) => id.startsWith(prefix))
        .sort()
        .slice(0, 100)
        .map((id) => {
          const option = make("option");
          option.value = id;
          return option;
        });
      this.ids.replaceChildren(...options);
    };
    fill(known);
    const ticket = ++this.lookup;
    window.setTimeout(() => {
      if (ticket !== this.lookup) return;
      this.api
        .ids(prefix.replace(/^planned:/, ""))
        .then((answer) => {
          if (ticket === this.lookup) fill([...known, ...answer.ids.map((i) => i.id)]);
        })
        .catch(() => {
          // The views' IDs stay; the next keystroke asks again.
        });
    }, 150);
  }
}
