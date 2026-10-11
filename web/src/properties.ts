// Web page (web/src), part of the diagram editor; entry point `Properties`.
// The properties panel of the diagram editor (business-flows/23c), on the
// right of the canvas: the selected shape's ID (with suggestions from
// `/api/views` and `GET /api/ids?prefix=`), kind, a start event's trigger, a
// parallel gateway's role, the signature of a `planned` shape, its tests as
// `test <file> "<name>"` lines and a description; for a connection, its
// meaning and label. «з коду» shows the same fields read-only, except a
// note's text and a shape's colour (layout, kept in the view's layout file,
// business-flows/24). Every change goes through the editor (editor.ts), so it
// is one step of undo.

import type { Api, Views } from "./api.ts";
import { make } from "./dom.ts";
import type { Cell } from "@maxgraph/core";
import { LINK_NAMES, RELATION_VERBS, SHAPE_NAMES, SYSTEM_PALETTE, TRIGGERS, type Link, type LinkKind, type Shape, type ShapeKind } from "./editor.ts";

/** A line of the tests field: `test <file> "<name>"`. */
export const TEST_LINE = /^test\s+(\S+)\s+"([^"]+)"$/;

/** What the panel needs of the editor. */
export interface PanelEditor {
  mode(): "code" | "draft";
  /** Replaces a shape's keylang side (one undoable change); a refusal comes back as text. */
  updateShape(cell: Cell, patch: Partial<Pick<Shape, "id" | "label" | "kind" | "trigger" | "role" | "signature" | "tests" | "description" | "colour" | "component" | "tech">>): string | null;
  updateLink(cell: Cell, patch: Partial<Pick<Link, "kind" | "label">>): string | null;
}

/** Kinds a person may give a shape in the panel: a lane stays a lane, a group a group. */
const SHAPE_CHOICES: readonly ShapeKind[] = ["module", "fn", "type", "start", "task", "gateway", "parallel", "event", "timer", "external", "hole", "note", "layer"];

/** A select's value is one of the options it was filled with. */
function isChoice<Value extends string>(choices: readonly Value[], value: string): value is Value {
  return choices.some((choice) => choice === value);
}

/** Whether a select's value names a connection kind of the editor. */
function isLinkKind(value: string): value is LinkKind {
  return Object.hasOwn(LINK_NAMES, value);
}

/** The editor keeps a shape's keylang side as a vertex's value and a link's as an edge's; both carry `kind`. */
function hasKind(value: unknown): value is Shape | Link {
  return value !== null && typeof value === "object" && "kind" in value;
}

/** A vertex's value as a shape. */
function isShapeOf(cell: Cell, value: unknown): value is Shape {
  return hasKind(value) && cell.isVertex();
}

/** An edge's value as a connection. */
function isLinkOf(cell: Cell, value: unknown): value is Link {
  return hasKind(value) && cell.isEdge();
}

// A parallel gateway either splits the flow into branches or joins them back.
const ROLES = ["split", "join"] as const;

/** Kinds whose shape names a keylang entity, so it has an ID. */
const NAMED: ReadonlySet<ShapeKind> = new Set(["lane", "layer", "module", "fn", "type", "start", "task", "event", "external"]);

/** The editor's right-hand panel: the fields of the selected shape or connection, each change sent through `PanelEditor`. */
export class Properties {
  private readonly root: HTMLElement;
  private readonly api: Api;
  private readonly editor: PanelEditor;
  private readonly views: () => Views | null;
  private readonly ids: HTMLDataListElement;
  private cell: Cell | null = null;
  /** The number of the latest ID lookup: an older lookup's answer is dropped. */
  private lookup = 0;

  constructor(root: HTMLElement, api: Api, editor: PanelEditor, views: () => Views | null) {
    this.root = root;
    this.api = api;
    this.editor = editor;
    this.views = views;
    // One shared datalist feeds the ID field's suggestions; it is re-attached on every redraw.
    this.ids = make("datalist");
    this.ids.id = "editor-ids";
    this.show(null);
  }

  /** Draws the panel for one cell (a shape or a connection), or the hint for none. */
  show(cell: Cell | null): void {
    this.cell = cell;
    const value: unknown = cell?.getValue();
    const body: Node[] = [];

    if (cell && isShapeOf(cell, value)) body.push(...this.shapeFields(cell, value));
    else if (cell && isLinkOf(cell, value)) body.push(...this.linkFields(cell, value));
    else body.push(make("p", { className: "empty", text: "Виберіть фігуру чи з'єднання: тут їхні ID, вид, сигнатура, тести й опис. Нове з'єднання — тягніть від стрілки, що з'являється над фігурою в «чернетці»." }));
    this.root.replaceChildren(...body, this.ids);
  }

  /** The cell the panel shows. */
  current(): Cell | null {
    return this.cell;
  }

  /** A labelled row: the name, the input, and an optional note under it. */
  private field(label: string, input: HTMLElement, note?: string): HTMLElement {
    const row = make("label", { className: "prop" }, make("span", { className: "prop-name", text: label }), input);

    if (note) row.append(make("span", { className: "prop-note", text: note }));

    return row;
  }

  /** Shows a refusal in the panel's error line, or hides the line for null. */
  private error(text: string | null): void {
    const box = this.root.querySelector<HTMLElement>(".prop-error");

    if (box) {
      box.textContent = text ?? "";
      box.hidden = !text;
    }
  }

  /** The fields of a shape; which ones appear depends on its kind, and in «з коду» most are read-only. */
  private shapeFields(cell: Cell, shape: Shape): Node[] {
    const code = this.editor.mode() === "code";
    // «з коду» changes only notes; a note's text is layout.
    const locked = code && shape.kind !== "note";
    const out: Node[] = [make("h2", { text: SHAPE_NAMES[shape.kind] ?? shape.kind }), make("p", { className: "prop-key", text: shape.key })];

    if (locked) out.push(make("p", { className: "prop-hint", text: "«з коду»: тут змінюються лише розкладка й примітки; зміст — у «чернетці»." }));

    // Applies one change; on success the panel redraws from the updated shape, on refusal it shows why.
    const apply = (patch: Parameters<PanelEditor["updateShape"]>[1]): void => {
      const refused = this.editor.updateShape(cell, patch);
      this.error(refused);

      if (!refused) this.show(cell);
    };

    // A named kind edits its ID, with suggestions; other kinds (except the label-less ones) edit a free label instead.
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

    if (shape.kind === "component") {
      // A system's component: its kind decides its shape; the technology is what `check` matches drivers against.
      const component = make("select");
      component.id = "prop-component";
      component.disabled = locked;

      for (const entry of SYSTEM_PALETTE) {
        if (!entry.component) continue;
        const option = make("option", { text: `${entry.component} — ${entry.text}` });
        option.value = entry.component;
        option.selected = entry.component === shape.component;
        component.append(option);
      }

      component.addEventListener("change", () => apply({ component: component.value }));
      out.push(this.field("вид", component));
      const tech = make("input");
      tech.id = "prop-tech";
      tech.value = shape.tech;
      tech.disabled = locked;
      tech.placeholder = "postgres, redis, kafka, express…";
      tech.addEventListener("change", () => apply({ tech: tech.value.trim() }));
      out.push(this.field("технологія", tech, "postgres, redis, kafka… звіряються з кодом"));
    } else if (shape.kind !== "lane" && shape.kind !== "group") {
      // Any other shape but a lane or group may change its kind among `SHAPE_CHOICES`.
      const kind = make("select");
      kind.id = "prop-kind";
      kind.disabled = locked;

      for (const choice of SHAPE_CHOICES) {
        const option = make("option", { text: SHAPE_NAMES[choice] ?? choice });
        option.value = choice;
        option.selected = choice === shape.kind;
        kind.append(option);
      }

      kind.addEventListener("change", () => {
        if (isChoice(SHAPE_CHOICES, kind.value)) apply({ kind: kind.value });
      });
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

      for (const choice of ROLES) {
        const option = make("option", { text: choice === "split" ? "розгалуження" : "злиття" });
        option.value = choice;
        option.selected = choice === shape.role;
        role.append(option);
      }

      role.addEventListener("change", () => {
        if (isChoice(ROLES, role.value)) apply({ role: role.value });
      });
      out.push(this.field("роль", role));
    }

    // Code entities (not lanes or layers) carry a signature, editable only while planned (the code has the real one), and tests.
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

        // Every non-empty line must be a test reference; one bad line refuses the whole change.
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

    // Colour is layout, not spec, so it stays editable in «з коду» too.
    if (shape.kind !== "group" && shape.kind !== "lane") {
      const colour = make("input");
      colour.type = "color";
      colour.id = "prop-colour";
      colour.value = shape.colour || "#ffffff";
      colour.addEventListener("change", () => apply({ colour: colour.value }));
      out.push(this.field("колір", colour, "розкладка: keylang/diagrams/"));
    }

    // Read-only facts about the shape: its proposal's fate, why its route is unproven, its verdict.
    if (shape.status !== null) out.push(make("p", { className: "prop-hint", text: shape.status === "rejected" ? `не прийнято: пропозицію для ${shape.proposed} не злито — фігура лишається на діаграмі, у специфікації її немає` : `очікує злиття: ${shape.proposed} (MERGE чи keylang proposals accept)` }));

    if (shape.reason) out.push(make("h3", { text: "чому маршрут не доведено" }), make("p", { className: "prop-reason", text: shape.reason }));

    if (shape.verdict) out.push(make("p", { className: "prop-key", text: `вердикт: ${shape.verdict}` }));
    // The error line `error()` fills; hidden until a change is refused.
    const error = make("p", { className: "prop-error" });
    error.id = "prop-error";
    error.hidden = true;
    error.setAttribute("role", "alert");
    out.push(error);

    return out;
  }

  /** The fields of a connection: its meaning (kind) and label; read-only in «з коду». */
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

      // A refused kind change puts the select back to the connection's real kind.
      if (!refused) this.show(cell);
      else kind.value = link.kind;
    };

    kind.addEventListener("change", () => {
      if (isLinkKind(kind.value)) apply({ kind: kind.value });
    });
    out.push(this.field("значення", kind));
    const label = make("input");
    label.id = "prop-link-label";
    label.value = link.label;
    label.disabled = locked;
    label.addEventListener("change", () => apply({ label: label.value }));
    out.push(this.field("мітка", label, link.kind === "relation" ? `<дієслово>: <підпис> — ${RELATION_VERBS.join(", ")}` : undefined));
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
    // IDs the page already holds (layers, entry points, flow IDs) are suggested at once, without a request.
    const known = new Set<string>([...(views?.layers ?? []), ...(views?.entries ?? []).map((e) => e.id), ...(views?.flowList ?? []).flatMap((f) => f.ids ?? [])]);

    const fill = (ids: Iterable<string>): void => {
      // Unique, matching the prefix, sorted, and capped at 100 so the datalist stays light.
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
    // Debounce the snapshot lookup by 150 ms; only the latest keystroke's answer fills the list.
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
