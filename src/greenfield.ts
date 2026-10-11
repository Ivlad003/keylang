// A project from a diagram (business-flows/29): what «Створити специфікацію»
// of `keylang web --new` writes into an empty project, as texts. Pure: the
// drawing comes in, the files come out, and the operation
// (`operations/greenfield.ts`) writes them — only into a project with no
// keylang.json, and only files that do not exist yet.
//
// - Lanes, top to bottom, are the layers from the highest to the lowest:
//   keylang.json gets one `src/<layer>/**` glob each, `rules.md` one
//   `layers` line in that order, and each layer an empty folder
//   (`src/<layer>/.gitkeep`).
// - Every flow a trigger starts is a process: `<dir>/features/<process>.md`,
//   built by the same code as a new flow of «Запропонувати зміни»
//   (`diagramChanges`): steps, `when`, `parallel`, events, timers, tests, and
//   a `planned` declaration for each shape, its signature with it. Nothing
//   exists yet, so every named shape is planned; an external system is a
//   planned fn of its lane (the adapter that talks to it).
// - Modules, fns and types no process reaches are declared in
//   `<dir>/features/structure.md`.
// - `allow` and `deny` lines (and a `dependency` line, read as `allow`)
//   between lanes or structure shapes are rules.
// - The idea is prose of `<dir>/README.md` — quoted, because the spec
//   directory is read as specs and a heading or a list line there would be
//   one.
// - The layout of each process view and of the layers view goes to
//   `<dir>/diagrams/`, keyed as the editor keys it (`diagram-layout.ts`).
//
// Pipeline: web editor model (diagram) → spec Markdown + keylang.json texts,
// reusing the diagram proposal code; nothing is parsed or resolved here.
// Entry point: `greenfieldPlan`; key terms: lane (= layer), process (= flow
// started by a trigger), planned declaration, layout.

import { isReservedLayerName } from "./config.ts";
import { layoutPath, layoutText, LAYOUT_FORMAT, shapeBase, type LayoutShape } from "./diagram-layout.ts";
import { diagramChanges, type EditorModel, type EditorNode } from "./diagram-proposal.ts";
import type { Language } from "./languages.ts";
import { compareText } from "./span.ts";
import type { SpecIR } from "./spec-ir.ts";

/** A choice of the dialog, by what it shows: the languages it stands for. */
interface LanguageChoices {
  readonly [choice: string]: readonly Language[];
}

/** The languages the dialog offers, by what it shows. */
export const GREENFIELD_LANGUAGES: LanguageChoices = {
  typescript: ["typescript"],
  python: ["python"],
  php: ["php"],
  rust: ["rust"],
};

/** What the `web --new` dialog sends: the drawing, chosen languages, the idea and where specs go. */
export interface GreenfieldInput {
  model: EditorModel;
  /** Keys of `GREENFIELD_LANGUAGES`. */
  languages: readonly string[];
  /** The idea, as the person wrote it. */
  idea: string;
  /** The spec directory, relative to the root (`keylang`). */
  specDir: string;
}

/** One file the operation will create. */
export interface GreenfieldFile {
  /** Relative to the root, POSIX. */
  path: string;
  text: string;
}

/** Every file of the new project, plus what the dialog reports back (layers, features, notes). */
export interface GreenfieldPlan {
  files: GreenfieldFile[];
  /** Layers from the highest to the lowest. */
  layers: string[];
  /** One per feature file: its slug and the IDs it plans. */
  features: { slug: string; file: string; planned: string[] }[];
  notes: string[];
}

/** An empty project's spec: the proposal code compares the drawing with nothing, so everything is new. */
const EMPTY_SPEC: SpecIR = { rules: [], rejectedLayers: [], hasRules: false, modules: [], flows: [], planned: [], wires: [] };

/** Shapes that carry a keylang ID: planned in an empty project. */
const NAMED: ReadonlySet<string> = new Set(["module", "fn", "type", "task", "start", "external"]);

/** Shapes that are code structure (not process steps); a dependency between them becomes an `allow`. */
const STRUCTURE: ReadonlySet<string> = new Set(["module", "fn", "type"]);

/** A layer name valid as a keylang ID segment and as a folder name. */
const LAYER_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

const STRUCTURE_FILE = "structure";

/** The bare ID of a shape, without the editor's `planned:` prefix. */
const strip = (id: string): string => id.replace(/^planned:/, "");

/** A line of prose that no parser reads as a list item, a heading or a quote. */
function prose(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();

  // A line starting with a bullet, heading, quote or ordered-list marker is escaped with `\`.
  return /^(?:[-*+#>]|\d+[.)])/.test(line) ? `\\${line}` : line;
}

/** The files of a new project drawn on the canvas, or what keeps it from being one. */
export function greenfieldPlan(input: GreenfieldInput): GreenfieldPlan | string {
  const { model, specDir } = input;
  const dir = specDir === "" ? "" : `${specDir}/`;
  const notes: string[] = [];

  // ── layers ───────────────────────────────────────────────────────────────
  // Lanes ordered top to bottom (then left to right, then key) so the layer order is stable.
  const lanes = [...model.lanes].sort((a, b) => a.y - b.y || a.x - b.x || compareText(a.key, b.key));

  if (lanes.length === 0) return "draw at least one lane: a lane is a layer (the template «4 шари» draws four)";
  const layers: string[] = [];

  // Each lane must name a valid, non-reserved, unique layer; the first problem is the answer.
  for (const lane of lanes) {
    const name = strip(lane.id);

    if (!LAYER_NAME.test(name)) return `lane \`${lane.label}\`: a layer name is a letter or _ and then letters, digits, _ or - (\`${name}\`)`;

    if (isReservedLayerName(name)) return `lane \`${name}\`: a reserved name; pick another`;

    if (layers.includes(name)) return `two lanes are \`${name}\`: a layer is one lane`;
    layers.push(name);
  }

  // Map the dialog's choices to languages; any unknown choice rejects the plan.
  const languages = [...new Set(input.languages.flatMap((name) => GREENFIELD_LANGUAGES[name] ?? []))];
  const unknown = input.languages.filter((name) => !Object.hasOwn(GREENFIELD_LANGUAGES, name));

  if (unknown.length > 0) return `languages: ${unknown.map((name) => `\`${name}\``).join(", ")} — one of ${Object.keys(GREENFIELD_LANGUAGES).join(", ")}`;

  if (languages.length === 0) return "pick a language: TypeScript, Python, PHP or Rust";

  // ── the drawing as an empty project reads it ────────────────────────────
  const nodes: EditorNode[] = [];

  // Re-key every named shape as `planned:<layer>.<name>`: other kinds and shapes
  // without a name pass through; a named one outside every lane rejects the plan.
  for (const node of model.nodes) {
    if (!NAMED.has(node.kind)) {
      nodes.push(node);
      continue;
    }

    const bare = strip(node.id) || (node.kind === "task" ? "" : node.label);

    if (bare === "") {
      nodes.push(node);
      continue;
    }

    const layer = bare.includes(".") ? bare.slice(0, bare.indexOf(".")) : null;

    if (layer === null || !layers.includes(layer)) return `${node.kind} \`${bare}\` is in no lane: put it in a lane, or give it an ID \`<layer>.<name>\` of a lane (${layers.join(", ")})`;
    // An external system is the adapter of its lane that talks to it: a planned fn like the rest.
    nodes.push({ ...node, id: `planned:${bare}`, kind: node.kind === "external" ? "task" : node.kind });
  }

  // A `dependency` drawn between structure shapes or lanes means the same as `allow`.
  const ends = new Map(nodes.map((node) => [node.key, node.kind]));

  for (const lane of model.lanes) ends.set(lane.key, "lane");
  const edges = model.edges.map((edge) => (edge.kind === "dependency" && (STRUCTURE.has(ends.get(edge.from) ?? "") || ends.get(edge.from) === "lane") && (STRUCTURE.has(ends.get(edge.to) ?? "") || ends.get(edge.to) === "lane") ? { ...edge, kind: "allow" } : edge));
  // The lanes are not new to an empty project's order: no `layers` line comes from them here, keylang.json is written below.
  const drawing: EditorModel = { ...model, nodes, edges, lanes: model.lanes.map((lane) => ({ ...lane, id: strip(lane.id) })) };
  const changes = diagramChanges({ model: drawing, diagram: { nodes: [], edges: [] }, flow: null, spec: EMPTY_SPEC, snapshot: null, specDir, read: () => null, config: { text: null, layers: Object.fromEntries(layers.map((layer) => [layer, [`src/${layer}/**`]])) } });

  // Loose structure is declared in its own file below, so the proposal's "belongs to no flow" note is dropped.
  for (const note of changes.notes) if (!/^planned `.*` belongs to no flow/.test(note)) notes.push(note);

  const files: GreenfieldFile[] = [];
  const features: GreenfieldPlan["features"] = [];
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const declared = new Set<string>();
  const layouts: { view: string; shapes: Record<string, LayoutShape> }[] = [];
  const laneShapes = (): Record<string, LayoutShape> => Object.fromEntries(lanes.map((lane) => [`lane:${strip(lane.id)}`, { x: lane.x, y: lane.y, w: lane.w, h: lane.h }]));

  // ── processes: each new flow a feature ──────────────────────────────────
  for (const target of changes.targets) {
    const prefix = `${dir}flows/`;

    // Only new flow files become features; other targets (rules, layouts) are handled further down.
    if (!target.target.startsWith(prefix) || !target.target.endsWith(".md")) continue;
    const slug = target.target.slice(prefix.length, -".md".length);
    const members = target.shapes.map((key) => byKey.get(key)).filter((node): node is EditorNode => node !== undefined);
    let text = target.text;
    // The trigger's description: the prose of the feature, under its heading.
    const trigger = members.find((node) => node.kind === "start" && (node.description ?? "").trim() !== "");

    if (trigger) text = text.replace(/^(# flow [^\n]*\n)/, `$1\n${prose(trigger.description!)}\n`);
    // IDs the feature file declares with `- planned <kind> <id>`, so structure and rules know them.
    const planned = [...text.matchAll(/^- planned \w+ (\S+)/gm)].map((match) => match[1]!);

    for (const id of planned) declared.add(id);
    const file = `${dir}features/${slug}.md`;
    files.push({ path: file, text });
    features.push({ slug, file, planned });
    const shapes = laneShapes();
    // Layout keys follow the editor's scheme; a repeated base gets `#2`, `#3`… in drawing order.
    const taken = new Map<string, number>();

    for (const node of members) {
      const base = shapeBase(node.kind, node.id, node.label);
      const n = (taken.get(base) ?? 0) + 1;
      taken.set(base, n);
      shapes[n === 1 ? base : `${base}#${n}`] = { x: node.x, y: node.y, w: node.w, h: node.h };
    }

    layouts.push({ view: `flow:${slug}`, shapes });
  }

  // ── structure no process reaches ────────────────────────────────────────
  const loose = nodes.filter((node) => STRUCTURE.has(node.kind) && node.id.startsWith("planned:") && !declared.has(strip(node.id)));

  if (loose.length > 0) {
    let slug = STRUCTURE_FILE;

    // Avoid a clash with a process that is itself called `structure`.
    for (let n = 2; features.some((feature) => feature.slug === slug); n++) slug = `${STRUCTURE_FILE}-${n}`;
    const lines: string[] = [];
    const ids: string[] = [];

    // One `planned` line per distinct ID.
    for (const node of loose) {
      const id = strip(node.id);

      if (ids.includes(id)) continue;
      ids.push(id);
      declared.add(id);
      lines.push(`- planned ${node.kind} ${id}${node.signature ? ` ${node.signature}` : ""}`);
    }

    const file = `${dir}features/${slug}.md`;
    files.push({ path: file, text: `# flow ${slug}\n\nМодулі, функції й типи з діаграми, яких не досягає жоден процес: їхні рядки \`- trigger\` і \`- step\` ще треба написати.\n\n${lines.join("\n")}\n` });
    features.push({ slug, file, planned: ids });
  }

  // ── rules ────────────────────────────────────────────────────────────────
  const rules = changes.targets.find((target) => target.target === `${dir}rules.md`);
  const ruleLines = rules ? rules.text.split("\n").filter((line) => /^- (?:allow|deny) /.test(line)) : [];
  // A rule about a shape nobody declared would dangle: only lanes and declared shapes.
  const known = (id: string): boolean => layers.includes(id) || declared.has(id);

  const kept = ruleLines.filter((line) => {
    const [, , from, to] = line.split(" ");

    if (known(from!) && known(to!)) return true;
    notes.push(`\`${line.slice(2)}\`: a rule is between lanes or declared shapes; not written`);

    return false;
  });

  // `layers` lists them from lowest to highest, hence the reverse; a single layer needs no order.
  const layersLine = layers.length > 1 ? [`- layers ${[...layers].reverse().join(" < ")}`] : [];
  files.push({ path: `${dir}rules.md`, text: `# rules\n\n${[...layersLine, ...kept].join("\n")}${layersLine.length + kept.length > 0 ? "\n" : ""}` });

  // ── keylang.json ─────────────────────────────────────────────────────────
  const config = { format: 1, languages, layers: Object.fromEntries(layers.map((layer) => [layer, [`src/${layer}/**`]])) };
  files.push({ path: "keylang.json", text: `${JSON.stringify(config, null, 2)}\n` });

  // ── the idea ─────────────────────────────────────────────────────────────
  const idea = input.idea.replace(/\r\n?/g, "\n").trim();
  // The idea is quoted line by line (blank lines as a bare `>`) so it can never parse as spec items.
  const quoted = idea === "" ? ["> (ідею ще не записано)"] : idea.split("\n").map((line) => (line.trim() === "" ? ">" : `> ${line}`));
  const featureList = features.map((feature) => `\`${feature.file}\``).join(", ");

  const readme = [
    "Ідея проєкту, як її записали до коду (`keylang web --new`):",
    "",
    ...quoted,
    "",
    `Шари — від верхнього до нижнього: ${layers.map((layer) => `\`${layer}\``).join(", ")}; код шару — у \`src/<шар>/\`.`,
    features.length > 0 ? `Фічі: ${featureList}.` : "Фіч ще немає: намалюйте процес (тригер і кроки) і створіть специфікацію знову в порожньому проєкті, або пишіть `keylang new flow <назва>`.",
    "",
    `Далі: \`keylang agents --agents=claude\` (чи codex, cursor, opencode) ставить інтеграцію агента; \`keylang feature <slug>\` каже агентові, чого ще бракує фічі; \`keylang map\` і \`keylang check\` після кожного кроку. Діаграма в \`keylang web\` показує поступ: planned ◇, далі ✓ чи ✗.`,
    "",
  ].join("\n");

  files.push({ path: `${dir}README.md`, text: readme });

  // ── layouts and layer folders ───────────────────────────────────────────
  layouts.push({ view: "layers", shapes: Object.fromEntries(lanes.map((lane) => [`layer:${strip(lane.id)}`, { x: lane.x, y: lane.y, w: lane.w, h: lane.h }])) });

  for (const layout of layouts) files.push({ path: layoutPath(specDir, layout.view), text: layoutText({ format: LAYOUT_FORMAT, view: layout.view, shapes: layout.shapes, edges: {} }) });

  for (const layer of layers) files.push({ path: `src/${layer}/.gitkeep`, text: "" });

  return { files, layers, features, notes };
}
