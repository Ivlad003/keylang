// Markdown → IR. A small line-oriented parser: keylang files use a strict
// subset of Markdown (headings, bullet lists indented by 2 spaces, paragraphs,
// fenced code), so a hand-written parser gives exact spans for every token
// without mapping back from a CommonMark AST. See `docs/grammar.md`.
//
// Place in the pipeline: the first step of Markdown → Text IR → SpecIR →
// resolve/rules. Every keylang command that reads specs (`parse`, `fmt`,
// `check`, the LSP, the TUI) goes through `parse`. Lines are fed one by one
// to a `Parser` that keeps a stack of open list items (one per indent
// level), a buffer of prose, and an open code fence or HTML block; each item
// line is tokenised by `lex` and turned into a `Node` by its keyword.
// Other entry points: `keywordsAt` and `roleAt` (completion and hover),
// `isId`, `isSegment`, `scheduleText`. Positions: offsets in UTF-16 units,
// columns in code points, spans half-open.

import { diagnostic, type Code, type K005Reason } from "./diag.ts";
import type { Document, Item, Link, Node, NodeKind, Ref, Section, SectionKind, Token, TokenKind } from "./ir.ts";
import { kindLabel } from "./ir.ts";
import type { Pos, Span, Spanned } from "./span.ts";

/** Parses one Markdown file into the Text IR: sections, their items, and the parse diagnostics. Never throws. */
export function parse(path: string, src: string): Document {
  const p = new Parser(path);
  let offset = 0;
  let lineNo = 0;

  for (const raw of splitInclusive(src)) {
    lineNo += 1;
    // A UTF-8 BOM is not text: the first line starts after it, offsets still count it.
    const bom = lineNo === 1 && raw.startsWith("\uFEFF") ? 1 : 0;
    const text = raw.slice(bom).replace(/[\r\n]+$/, "");
    p.line(new Line(lineNo, offset + bom, text));
    offset += raw.length;
  }

  return p.finish();
}

/** Split keeping the `\n` on each line (like Rust's `split_inclusive`). */
function splitInclusive(src: string): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") {
      out.push(src.slice(start, i + 1));
      start = i + 1;
    }
  }

  if (start < src.length) out.push(src.slice(start));

  return out;
}

/** One source line: its 1-based number, the offset of its first character, and its text without the line ending. */
class Line {
  readonly no: number;
  readonly start: number;
  readonly text: string;

  constructor(no: number, start: number, text: string) {
    this.no = no;
    this.start = start;
    this.text = text;
  }

  /** The position of a UTF-16 index into the line's text: absolute offset, 1-based line, 1-based code-point column. */
  pos(b: number): Pos {
    return { offset: this.start + b, line: this.no, col: codePoints(this.text.slice(0, b)) + 1 };
  }

  /** The span between two UTF-16 indexes of the line. */
  span(a: number, b: number): Span {
    return { start: this.pos(a), end: this.pos(b) };
  }
}

/** The number of Unicode code points in `s` (a surrogate pair counts once). */
function codePoints(s: string): number {
  let n = 0;

  for (const _ of s) n++;

  return n;
}

/** Where an item stands, which decides the keywords it may use. */
type Ctx =
  | "map-top"
  | "rules-top"
  | "flow-top"
  | "wiring-top"
  | "migration-top"
  | "system-top"
  | "zone"
  | "component"
  | "table"
  | "sequence"
  | "layer"
  | "module"
  | "fn"
  | "event"
  | "ref-list"
  | "rule-module"
  | "step"
  | "invariant"
  | "when"
  | "then"
  | "parallel"
  | "timer"
  | "wire"
  | "wire-dep"
  /** Under `planned type`: every line is a field `<name>[?]: <type>`. */
  | "planned-type"
  | "unknown"
  | `leaf:${NodeKind}`;

/** The position an item under `parent` stands in: section top, under a node of a nesting kind, or a leaf (nothing may nest). */
function ctxOf(section: SectionKind, parent: NodeKind | undefined): Ctx {
  switch (parent) {
    case undefined:
      return `${section}-top`;
    case "layer":
      return "layer";
    case "module":
      return "module";
    case "fn":
      return "fn";
    case "event":
      return section === "map" ? "event" : `leaf:${parent}`;
    case "layers":
    case "entry":
      return "ref-list";
    case "rule-module":
      return "rule-module";
    case "step":
    case "trigger":
      return "step";
    case "invariant":
      return "invariant";
    case "when":
      return section === "flow" ? "when" : "leaf:when";
    case "then":
      return "then";
    case "parallel":
      return "parallel";
    case "after":
    case "every":
      return "timer";
    case "wire":
      return "wire";
    case "wire-dep":
      return "wire-dep";
    case "zone":
    case "component":
    case "table":
    case "sequence":
      return section === "system" ? parent : `leaf:${parent}`;
    case "unknown":
      return "unknown";
    default:
      return `leaf:${parent}`;
  }
}

/** A field name under `planned type`: a TypeScript identifier. */
const FIELD_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** The declaration kinds `planned` may name. */
const PLANNED_KINDS: ReadonlySet<string> = new Set(["fn", "module", "type", "event"]);

/** `trigger event <id>` (ADR 0023 п. 1): the flow of an event's subscribers; the ID is an event, not an entry point's fn. */
export const TRIGGER_EVENT = "event";

/** What starts a flow besides a plain call (ADR 0023 п. 3): `trigger <kind> <id>` names an entry point of that kind. */
export const TRIGGER_KINDS = ["route", "cron", "consumer", "webhook"] as const;

export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** Whether a word names one of the entry-point kinds of `trigger <kind> <id>`. */
export function isTriggerKind(word: string): word is TriggerKind {
  return TRIGGER_KINDS.some((kind) => kind === word);
}

/**
 * An event ID (ADR 0022 п. 6, ADR 0023 п. 1): a member of the generated group
 * `events` (`events.checkout_submit_all_after`). `emits [event] <name>` with
 * such a name is a reference checked against the snapshot; any other name
 * stays prose, as before.
 */
export function isEventId(text: string): boolean {
  return text.startsWith("events.") && isId(text);
}

/** `30s`, `15m`, `2h`, `7d`: a number and a unit (ms, s, m, min, h, d, w). */
const DURATION = /^[1-9][0-9]*(ms|s|m|min|h|d|w)$/;

/** `@hourly` and the other cron macros. */
const CRON_MACRO = /^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/;

/** One field of a cron expression: digits, names, `*`, `/`, `,`, `-`, `?`, `L`, `W`, `#`. */
const CRON_FIELD = /^[0-9A-Za-z*/,?#-]+$/;

/** Whether `text` is a duration such as `15m`. */
export function isDuration(text: string): boolean {
  return DURATION.test(text);
}

/**
 * The schedule of `every <schedule>` in one canonical text, or null when the
 * words are not one: a duration (`15m`), a cron macro (`@daily`), or five or six
 * cron fields, bare (`*\/5 * * * *`) or in double quotes. Quotes are dropped.
 */
export function scheduleText(words: readonly string[]): string | null {
  const [one] = words;

  // One word: a duration, a macro, or a quoted cron expression (split and
  // checked again).
  if (words.length === 1 && one !== undefined) {
    if (DURATION.test(one) || CRON_MACRO.test(one)) return one;

    if (one.length >= 2 && one.startsWith('"') && one.endsWith('"')) return scheduleText(one.slice(1, -1).trim().split(/\s+/).filter((w) => w !== ""));

    return null;
  }

  // Five or six bare words: a cron expression, each field from the cron
  // alphabet.
  if ((words.length === 5 || words.length === 6) && words.every((word) => CRON_FIELD.test(word))) return words.join(" ");

  return null;
}

/** The rule keywords, allowed at the top of a map and of `# rules`. */
const RULES = ["layers", "allow", "deny", "entry", "module", "no-cycles"];

/** What a component of `# system` is (system-design Р2): the first word of its line. */
export const COMPONENT_KINDS = ["client", "cdn", "dns", "lb", "gateway", "service", "worker", "function", "db", "cache", "queue", "storage", "search", "warehouse", "auth", "external"] as const;

export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/** Whether a word is a component kind of `# system`. */
export function isComponentKind(word: string): word is ComponentKind {
  return COMPONENT_KINDS.some((kind) => kind === word);
}

/** Components that keep data: only they hold `table` lines. */
export const DATA_STORES: ReadonlySet<string> = new Set(["db", "cache", "storage", "search", "warehouse"]);

/** How a component talks to another (Р4): `<verb> <component> [caption…]`. */
export const RELATION_VERBS = ["calls", "reads", "writes", "publishes", "consumes", "replicates", "uses"] as const;

/** Whether a word is a relation verb of a `# system` component. */
export function isRelationVerb(word: string): word is (typeof RELATION_VERBS)[number] {
  return RELATION_VERBS.some((verb) => verb === word);
}

/** Flags of a column after its type (Р5); `fk` takes `<table>.<column>`. */
export const COLUMN_FLAGS: ReadonlySet<string> = new Set(["pk", "unique", "null", "fk"]);

/** Free-text lines of an interview at the top of `# system` (Р7). */
const INTERVIEW = ["requirement", "nfr", "estimate", "tradeoff"] as const;

/** Whether a word is an interview line kind of `# system`. */
function isInterviewKind(word: string): word is (typeof INTERVIEW)[number] {
  return INTERVIEW.some((kind) => kind === word);
}

/** Whether a position is inside `# system`, where keywords map to system node kinds. */
function isSystemCtx(ctx: Ctx): boolean {
  return ctx === "system-top" || ctx === "zone" || ctx === "component" || ctx === "table" || ctx === "sequence";
}

/** Keywords an item may start with under `parent` (none at the top of a section). */
export function keywordsAt(section: SectionKind, parent: NodeKind | undefined): readonly string[] {
  return keywordsOf(ctxOf(section, parent));
}

/** The keywords allowed in a position; K004 rejects any other. */
function keywordsOf(ctx: Ctx): readonly string[] {
  switch (ctx) {
    case "map-top":
      return ["layer", ...RULES];
    case "rules-top":
      return RULES;
    case "flow-top":
      return ["kind", "trigger", "continues", "step", "parallel", "reads", "emits", "calls", "invariant", "when", "after", "every", "test", "planned", "?"];
    case "wiring-top":
      return ["wire"];
    case "migration-top":
      return ["map", "dropped"];
    case "system-top":
      return [...COMPONENT_KINDS, "zone", "sequence", ...INTERVIEW, "?"];
    case "zone":
      return [...COMPONENT_KINDS, "zone"];
    case "component":
      return ["code", ...RELATION_VERBS, "scale", "table"];
    case "table":
      return ["index"];
    case "layer":
      return ["module", "event"];
    case "module":
      return ["module", "fn", "type", "event"];
    case "fn":
    case "event":
      return ["calls"];
    case "rule-module":
      return ["exports", "no-cycles"];
    case "step":
      return ["step", "parallel", "reads", "emits", "calls", "when", "after", "every", "test", "invariant", "?"];
    case "invariant":
    case "then":
    case "timer":
      return ["test"];
    case "when":
      return ["then", "step", "parallel", "test", "?"];
    case "parallel":
      return ["step"];
    case "wire-dep":
      return ["when", "compose"];
    default:
      return [];
  }
}

/** Every position with keywords, in words, and the sections it is in: where a misplaced keyword goes. */
const PLACES: readonly { ctx: Ctx; sections: readonly SectionKind[]; where: string }[] = [
  { ctx: "map-top", sections: ["map"], where: "at the top of a map" },
  { ctx: "rules-top", sections: ["rules"], where: "at the top of `# rules`" },
  { ctx: "flow-top", sections: ["flow"], where: "at the top of `# flow`" },
  { ctx: "wiring-top", sections: ["wiring"], where: "at the top of `# wiring`" },
  { ctx: "migration-top", sections: ["migration"], where: "at the top of `# migration`" },
  { ctx: "system-top", sections: ["system"], where: "at the top of `# system`" },
  { ctx: "zone", sections: ["system"], where: "under `- zone`" },
  { ctx: "component", sections: ["system"], where: "under a component of `# system`" },
  { ctx: "table", sections: ["system"], where: "under `- table`" },
  { ctx: "layer", sections: ["map"], where: "under `- layer`" },
  { ctx: "module", sections: ["map"], where: "under `- module`" },
  { ctx: "fn", sections: ["map"], where: "under `- fn`" },
  { ctx: "rule-module", sections: ["rules", "map"], where: "under a rule `- module <id>`" },
  { ctx: "step", sections: ["flow"], where: "under `- step`" },
  { ctx: "step", sections: ["flow"], where: "under `- trigger`" },
  { ctx: "when", sections: ["flow"], where: "under `- when`" },
  { ctx: "invariant", sections: ["flow"], where: "under `- invariant`" },
  { ctx: "then", sections: ["flow"], where: "under `- then`" },
  { ctx: "parallel", sections: ["flow"], where: "under `- parallel`" },
  { ctx: "timer", sections: ["flow"], where: "under `- after`" },
  { ctx: "timer", sections: ["flow"], where: "under `- every`" },
  { ctx: "wire-dep", sections: ["wiring"], where: "under a dependency of `- wire`" },
];

/** How a hint names a section. */
const SECTION_NAMES: Record<SectionKind, string> = { map: "a map", rules: "`# rules`", flow: "`# flow`", wiring: "`# wiring`", migration: "`# migration`", system: "`# system`" };

/**
 * `; \`calls\` goes under \`- fn\`` when `word` is a keyword of other positions
 * and not of `ctx`, else "". The places of the current section are listed;
 * when the word belongs to other sections, one place is named with its
 * section and several by their sections only (`; \`test\` goes in \`# flow\``).
 */
function placeHint(word: string, ctx: Ctx, section: SectionKind): string {
  // No hint when the word is fine here or a keyword nowhere.
  if (keywordsOf(ctx).includes(word)) return "";
  const places = PLACES.filter((place) => keywordsOf(place.ctx).includes(word));
  const [first] = places;

  if (first === undefined) return "";
  // Prefer the places of this section; otherwise one foreign place with its
  // section, or only the sections when there are several.
  const here = places.filter((place) => place.sections.includes(section));
  let shown: string[];

  if (here.length > 0) shown = here.map((place) => place.where);
  else if (places.length === 1) shown = [first.ctx.endsWith("-top") ? first.where : `${first.where} in ${SECTION_NAMES[first.sections[0]!]}`];
  else shown = [`in ${[...new Set(places.map((place) => SECTION_NAMES[place.sections[0]!]))].join(" or ")}`];
  const listed = shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(", ")} or ${shown.at(-1)!}`;

  return `; \`${word}\` goes ${listed}`;
}

/** The roles of the rule keywords, shared by a map and `# rules`. */
const RULE_ROLES = [
  ["layers", "a layer order: a dependency may only point down, to a layer on the left"],
  ["allow", "a rule: the first ID may depend on the rest"],
  ["deny", "a rule: the first ID must not depend on the rest"],
  ["entry", "entry points: a module the nested IDs do not reach is K103"],
  ["rule-module", "a reference to a module the nested rules apply to"],
  ["no-cycles", "a rule: no import cycle anywhere"],
] as const;

/** The hover texts reused by several positions. */
const TEST_ROLE = "a test that must pass in the `check.tests` report";

const COMPONENT_ROLE = "a component of the system: its kind, name and technology; `check` reads the code a nested `code` line names";

const ZONE_ROLE = "a boundary around components: a region, a network, a trust zone";

const QUESTION_ROLE = "an open question: not a claim `check` judges; a feature with one is not done until a person answers it";

const PARALLEL_ROLE = "a parallel group: every nested step must run, in any order; the next step runs after the whole group";

const AFTER_ROLE = "a timer: the parent runs this long after the step before; only a nested `test` checks it";

const EVERY_ROLE = "a schedule: the parent runs on it; a nested `test` checks it, and a cron entry point's schedule when the snapshot has one";

// Maps, not objects: `then` is a keyword, and an object with a `then` key is a thenable.
function roles(entries: readonly (readonly [NodeKind, string])[]): ReadonlyMap<NodeKind, string> {
  return new Map(entries);
}

/**
 * What an item does where it stands (grammar.md §5), for hover. Keyed like
 * `keywordsOf`, which K004 reads, so the roles follow the allowed keywords.
 */
const ROLES = new Map<Ctx, ReadonlyMap<NodeKind, string>>([
  ["map-top", roles([["layer", "a layer declaration"], ...RULE_ROLES])],
  ["rules-top", roles(RULE_ROLES)],
  ["flow-top", roles([
    ["kind", "the kind of the flow: `business` or `technical`"],
    ["trigger", "where the flow starts: a trace is matched from the first trigger; `trigger route|cron|consumer|webhook <id>` names an entry point of that kind, `trigger event <id>` an event whose subscribers run the steps"],
    ["continues", "this flow continues another one in a later request (a webhook after a checkout): both flows must exist; one trace does not cross requests"],
    ["parallel", PARALLEL_ROLE],
    ["after", AFTER_ROLE],
    ["every", EVERY_ROLE],
    ["step", "a step the trigger must reach: a call path in code (static) and a run in a trace"],
    ["reads", "data the trigger reads: only that the ID exists is checked"],
    ["emits", "an event the flow emits: an event ID (`events.<name>`) is checked for a dispatch in the trigger's code; any other name is prose"],
    ["calls", "a direct call of the trigger, checked without order"],
    ["invariant", "an invariant: text; the nested `test` lines are its evidence"],
    ["when", "a branch: text, its steps are optional in a trace"],
    ["test", `evidence for the flow: ${TEST_ROLE}`],
    ["planned", "an intention: an ID that is not implemented yet; steps refer to it as usual"],
    ["question", QUESTION_ROLE],
  ])],
  ["wiring-top", roles([["wire", "the wiring of a module: how its dependencies are built"]])],
  ["system-top", roles([
    ["component", COMPONENT_ROLE],
    ["zone", ZONE_ROLE],
    ["sequence", "a sequence: messages between components, top to bottom"],
    ["requirement", "a functional requirement of the system: text"],
    ["nfr", "a non-functional requirement (latency, availability, scale): text"],
    ["estimate", "a back-of-the-envelope estimate (users, QPS, storage): text"],
    ["tradeoff", "a trade-off the design makes: text"],
    ["question", QUESTION_ROLE],
  ])],
  ["zone", roles([["component", COMPONENT_ROLE], ["zone", ZONE_ROLE]])],
  ["component", roles([
    ["code", "the map IDs this component is built from: `check` reads its dependencies there"],
    ["relation", "how this component talks to another: with `code`, `check` looks for the import that proves it"],
    ["scale", "how the component scales (replicas, shards): text"],
    ["table", "a table of this data store: its columns and indexes"],
  ])],
  ["table", roles([["column", "a column: name, type and flags `pk`, `unique`, `null`, `fk <table>.<column>`"], ["index", "an index over columns of the table"]])],
  ["sequence", roles([["message", "a message from one component to another: `<from> → <to> [text]`, `⇢` for an asynchronous one"]])],
  ["migration-top", roles([
    ["migrate", "an ID of the old stack and its counterpart in this repository (`planned` while it is not written yet)"],
    ["dropped", "an ID of the old stack that is not carried over, with the reason"],
  ])],
  ["layer", roles([["module", "a module declaration in this layer"], ["event", "an event of the generated group `events`: dispatched by code, observed by the framework's config"]])],
  ["module", roles([
    ["module", "a submodule declaration"],
    ["fn", "a function declaration of this module"],
    ["type", "a type declaration of this module"],
    ["event", "an event declaration of this module"],
    ["dep", "a dependency of this module: an alias and the ID it points at"],
  ])],
  ["fn", roles([["calls", "calls this function makes in code"]])],
  ["event", roles([["calls", "the observers the framework calls when the event is dispatched"]])],
  ["rule-module", roles([
    ["exports", "the public names of this module, compared with the code both ways"],
    ["no-cycles", "a rule: no import cycle through this module or its submodules"],
  ])],
  ["step", roles([
    ["step", "a step the parent step must reach: a call path in code (static) and a run in a trace"],
    ["parallel", PARALLEL_ROLE],
    ["after", AFTER_ROLE],
    ["every", EVERY_ROLE],
    ["reads", "data the parent step reads: only that the ID exists is checked"],
    ["emits", "an event the parent step emits: an event ID (`events.<name>`) is checked for a dispatch in the step's code; any other name is prose"],
    ["calls", "a direct call of the parent step, checked without order"],
    ["when", "a branch: text, its steps are optional in a trace"],
    ["test", `evidence for the parent step: ${TEST_ROLE}`],
    ["invariant", "an invariant of the parent step: text; the nested `test` lines are its evidence"],
    ["question", QUESTION_ROLE],
  ])],
  ["when", roles([
    ["then", "the outcome of the branch"],
    ["step", "a step of the branch: optional in a trace that does not take the branch"],
    ["parallel", PARALLEL_ROLE],
    ["test", `evidence for the branch: ${TEST_ROLE}`],
    ["question", QUESTION_ROLE],
  ])],
  ["invariant", roles([["test", `evidence for the invariant: ${TEST_ROLE}`]])],
  ["then", roles([["test", `evidence for the outcome: ${TEST_ROLE}`]])],
  ["parallel", roles([["step", "a step of the parallel group: reached from the group's parent, in any order with the other steps of the group"]])],
  ["timer", roles([["test", `evidence for the timer: ${TEST_ROLE}`]])],
  ["wire", roles([["wire-dep", "an override of a dependency of the wired module"]])],
  ["wire-dep", roles([["when", "a condition → id: the dependency is that ID when the condition holds"], ["compose", "a decorator composed around the dependency"]])],
]);

/** The role of an item of `kind` under `parent` (or at the top of `section`), or `null` when it has none there. */
export function roleAt(section: SectionKind, parent: NodeKind | undefined, kind: NodeKind): string | null {
  // A bare ref line has a role only in two places: an entry point under
  // `entry`, a free layer under `layers`.
  if (kind === "ref") return parent === "entry" ? "an entry point: what it reaches counts as used" : "a layer outside the order: a dependency into it is free unless denied";

  return ROLES.get(ctxOf(section, parent))?.get(kind) ?? null;
}

/** The node kind a keyword makes in a position; `unknown` for a word that is no keyword there. */
function keywordKind(ctx: Ctx, kw: string): NodeKind {
  if (ctx === "migration-top") return kw === "map" ? "migrate" : kw === "dropped" ? "dropped" : "unknown";

  if (isSystemCtx(ctx)) {
    if (isComponentKind(kw)) return "component";

    if (isRelationVerb(kw)) return "relation";

    if (kw === "?") return "question";

    return kw === "zone" || kw === "sequence" || kw === "code" || kw === "scale" || kw === "table" || kw === "index" || isInterviewKind(kw) ? kw : "unknown";
  }

  switch (kw) {
    case "layer":
      return "layer";
    case "module":
      return ctx === "map-top" || ctx === "rules-top" ? "rule-module" : "module";
    case "fn":
    case "type":
    case "event":
    case "calls":
    case "layers":
    case "allow":
    case "deny":
    case "entry":
    case "exports":
    case "no-cycles":
    case "kind":
    case "trigger":
    case "step":
    case "reads":
    case "emits":
    case "invariant":
    case "when":
    case "then":
    case "test":
    case "planned":
    case "wire":
    case "compose":
    case "parallel":
    case "continues":
    case "after":
    case "every":
      return kw;
    case "?":
      return "question";
    default:
      return "unknown";
  }
}

/** What an item needs to know about its parent: kind, ID, the target it refers to, and its keyword's value. */
interface Parent {
  kind: NodeKind;
  id: string | null;
  target: string | null;
  /** The keyword's value a line keeps (a component's kind). */
  label: string | null;
}

/** The state machine that turns lines into sections, nodes, prose and code, with diagnostics. */
class Parser {
  readonly doc: Document;
  private readonly path: string;
  /** Open list items; index = depth. */
  private stack: Node[] = [];
  private prose: string[] = [];
  /** Open code fence. `spaces` is null when a tab sits in the opener indent (fmt must not dedent it). */
  private fence: { char: "`" | "~"; len: number; columns: number; spaces: number | null; lines: string[] } | null = null;
  /**
   * Open CommonMark HTML block of type 1–5. `desc` set: the lines are descriptions of that
   * list item and the block ends with the item. Otherwise the lines are prose through EOF.
   */
  private html: { end: (line: string) => boolean; desc: { depth: number; contentCol: number } | null } | null = null;
  private seenContent = false;

  constructor(path: string) {
    this.path = path;
    this.doc = { path, generated: null, sections: [], diagnostics: [] };
  }

  /** Records a parse diagnostic; only K005 carries a reason. */
  private err(code: Exclude<Code, "K005">, span: Span, msg: string): void;
  private err(code: "K005", span: Span, msg: string, reason: K005Reason): void;
  private err(code: Code, span: Span, msg: string, reason?: K005Reason): void {
    if (code === "K005" && reason !== undefined) this.doc.diagnostics.push(diagnostic("K005", this.path, span, msg, reason));
    else if (code !== "K005") this.doc.diagnostics.push(diagnostic(code, this.path, span, msg));
  }

  /** The current section; a file without a heading starts with an implicit map section. */
  private section(): Section {
    if (this.doc.sections.length === 0) {
      this.doc.sections.push({ kind: "map", heading: null, name: null, items: [] });
    }

    return this.doc.sections[this.doc.sections.length - 1]!;
  }

  /** The kind of the current section (`map` before any heading). */
  private sectionKind(): SectionKind {
    return this.doc.sections.at(-1)?.kind ?? "map";
  }

  /** Moves buffered prose lines into the current section as one prose item. */
  private flushProse(): void {
    if (this.prose.length > 0) {
      this.section().items.push({ type: "prose", lines: this.prose });
      this.prose = [];
    }
  }

  /** A non-empty line that belongs to an open item as its description (§3). */
  private pushDescription(l: Line, text: string, lead: Lead, depth: number): void {
    if (lead.hasTab) this.err("K003", l.span(0, lead.raw.length), "tab in indentation; indent with 2 spaces");
    const start = lead.raw.length;
    const end = text.trimEnd().length;
    this.stack[depth]!.description.push({ value: text.slice(start, end), span: l.span(start, end) });
  }

  /** Pops open items deeper than `depth`, attaching each to its parent (or to the section at depth 0). */
  private closeList(depth: number): void {
    while (this.stack.length > depth) {
      const node = this.stack.pop()!;
      const parent = this.stack.at(-1);

      if (parent) parent.children.push(node);
      else this.section().items.push({ type: "node", ...node });
    }
  }

  /** Closes whatever is still open at the end of the file and returns the document. */
  finish(): Document {
    if (this.fence) {
      this.section().items.push({ type: "code", lines: this.fence.lines });
      this.fence = null;
    }

    this.flushProse();
    this.closeList(0);

    return this.doc;
  }

  /**
   * Feeds one line to the state machine. Order matters: an open fence takes
   * every line until it closes, an open HTML block takes lines until it ends,
   * then blank lines, the generated marker, headings, fences, bullets,
   * descriptions and prose are told apart.
   */
  line(l: Line): void {
    const text = l.text;

    // Inside a code fence: keep the line as is until the closing fence.
    if (this.fence) {
      this.fence.lines.push(text.trimEnd());

      if (closesFence(text, this.fence)) {
        this.section().items.push({ type: "code", lines: this.fence.lines });
        this.fence = null;
      }

      return;
    }

    // Inside an HTML block: its lines are descriptions of an item or prose.
    if (this.html) {
      const lead = leadingWhitespace(text);
      const desc = this.html.desc;

      // A non-empty line shallower than the item's content column ends the item and this block with it.
      if (desc && text.trim() !== "" && lead.indent < desc.contentCol) {
        this.html = null;
        this.line(l);

        return;
      }

      if (desc) {
        if (text.trim() !== "") this.pushDescription(l, text, lead, desc.depth);
      } else {
        this.prose.push(text.trimEnd());
      }

      if (this.html.end(text)) this.html = null;

      return;
    }

    // A blank line ends a paragraph of prose; it does not close list items.
    if (text.trim() === "") {
      this.flushProse();

      return;
    }

    // The generated marker counts only as the first non-blank line.
    if (!this.seenContent && text.startsWith("<!--") && text.includes("keylang:generated")) {
      this.seenContent = true;
      this.doc.generated = text.trimEnd();

      return;
    }

    this.seenContent = true;

    const lead = leadingWhitespace(text);
    const { raw: ws, indent } = lead;
    const wsLen = ws.length;

    // A tab only matters where indentation decides the tree: items and their descriptions, not prose or fences.
    const tab = (): void => {
      if (lead.hasTab) this.err("K003", l.span(0, wsLen), "tab in indentation; indent with 2 spaces");
    };

    const rest = text.slice(wsLen);

    // A multi-line HTML block (types 1–5) hides the lines GitHub does not show as a list.
    // A marker that also ends on this line is an ordinary comment, not a block.
    const html = htmlBlockStart(rest);

    if (html && !html.end(text)) {
      // Under an item and within its content column (plus up to 3 spaces),
      // the block's lines describe that item; at the top level it is prose.
      const underItem = indent >= 2 && this.stack.length > 0;
      const depth = underItem ? Math.min(Math.floor((indent - 2) / 2), this.stack.length - 1) : 0;
      const contentCol = depth * 2 + 2;

      if (underItem && indent <= contentCol + 3) {
        this.pushDescription(l, text, lead, depth);
        this.html = { end: html.end, desc: { depth, contentCol } };

        return;
      }

      if (!underItem && lead.columns <= 3) {
        this.closeList(0);
        this.prose.push(text.trimEnd());
        this.html = { end: html.end, desc: null };

        return;
      }
    }

    // Dispatch the line: a `#` heading at column 0, a fence opener, a list
    // item, a description of an open item, or prose (which closes the list).
    if (indent === 0 && (rest === "#" || rest.startsWith("# ") || rest.startsWith("#\t"))) {
      this.heading(l);
    } else if (opensFence(text, this.stack.length > 0)) {
      this.flushProse();
      this.closeList(0);
      const open = openFence(text)!;
      this.fence = { char: open.char, len: open.len, columns: open.columns, spaces: open.spaces, lines: [text.trimEnd()] };
    } else if (isBullet(rest)) {
      tab();
      this.item(l, wsLen, indent);
    } else if (indent >= 2 && this.stack.length > 0) {
      tab();
      // Description of the deepest open item whose content column fits.
      const depth = Math.min(Math.floor((indent - 2) / 2), this.stack.length - 1);
      const start = wsLen;
      const end = text.trimEnd().length;
      this.stack[depth]!.description.push({ value: text.slice(start, end), span: l.span(start, end) });
    } else {
      this.closeList(0);
      this.prose.push(text.trimEnd());
    }
  }

  private heading(l: Line): void {
    this.flushProse();
    this.closeList(0);
    // The words end before an optional closing sequence of `#` (CommonMark), which fmt does not keep.
    // Lex the heading's words with the same tokenizer as items; a trailing
    // `<!-- … -->` becomes the section's comment.
    const { tokens, comment } = lex(new Line(l.no, l.start, l.text.slice(0, headingEnd(l.text))), 1, []);
    const title = renderTokens(tokens);
    const full = l.span(0, l.text.trimEnd().length);
    const first = tokens[0]?.text;
    let kind: SectionKind = "map";
    let known = true;

    // The first word is the section kind; anything else is K006 and the
    // section is read as a map.
    if (first === "map" || first === "rules" || first === "flow" || first === "wiring" || first === "migration" || first === "system") kind = first;
    else known = false;
    let name: Spanned<string> | null = null;

    if (!known) {
      const what = title === "" ? "section heading without a kind" : `unknown section \`# ${title}\``;
      this.err("K006", full, `${what}; expected \`map\`, \`rules\`, \`flow <name>\`, \`wiring\`, \`migration <name>\` or \`system <name>\` (treated as map)`);
    } else {
      // Only a flow, a migration and a system have a name (§2); any other word is a mistake, not a name.
      const named = kind === "flow" || kind === "migration" || kind === "system";
      const t = tokens[1];

      if (named && t) {
        if (isSegment(t.text)) name = { value: nfc(t.text), span: t.span };
        else this.err("K005", t.span, `invalid section name \`${t.text}\``, "id");
      } else if (named) {
        this.err("K005", full, `\`# ${kind}\` needs a name, e.g. \`# ${kind} ${kind === "system" ? "shop" : "checkout"}\``, "arguments");
      }

      const extra = tokens[named ? 2 : 1];

      if (extra) this.err("K005", extra.span, named ? "unexpected words in heading" : `unexpected words in heading; only \`# flow\`, \`# migration\` and \`# system\` take a name`, "arguments");
    }

    const heading = { value: title, span: full };

    this.doc.sections.push(comment ? { kind, heading, name, comment, items: [] } : { kind, heading, name, items: [] });
  }

  /** Opens a list item: checks its indentation, closes deeper items, lexes the line and interprets it under its parent. */
  private item(l: Line, wsLen: number, indent: number): void {
    this.flushProse();
    const bulletSpan = l.span(wsLen, wsLen + 1);

    if (indent % 2 !== 0) {
      this.err("K003", bulletSpan, `indentation must be a multiple of 2 spaces, found ${indent}`);
    }

    // Depth is indent / 2; an item may go at most one level deeper than the
    // open stack, so a jump is reported and clamped.
    let depth = Math.floor(indent / 2);

    if (depth > this.stack.length) {
      this.err(
        "K003",
        bulletSpan,
        `item indented too deep: ${indent} spaces, at most ${this.stack.length * 2} expected here`,
      );
      depth = this.stack.length;
    }

    this.closeList(depth);
    this.section();

    // Where the item's content starts: after the bullet and its spaces.
    const afterBullet = l.text.slice(wsLen + 1);
    const head = wsLen + 1 + (afterBullet.length - afterBullet.trimStart().length);

    if (l.text.slice(head).trim() === "") {
      this.err("K003", bulletSpan, "empty list item");

      return;
    }

    const top = this.stack.at(-1);

    const parent: Parent | undefined = top && {
      kind: top.kind,
      id: top.id,
      target: top.refs[0]?.target ?? null,
      label: top.label?.value ?? null,
    };

    const errs: [Span, string][] = [];
    const { tokens, comment } = lex(l, head, errs);

    for (const [span, msg] of errs) this.err("K005", span, msg, "quote");

    const node: Node = {
      kind: "unknown",
      keyword: null,
      name: null,
      id: null,
      link: null,
      refs: [],
      text: null,
      label: null,
      tokens,
      comment,
      description: [],
      children: [],
      span: l.span(wsLen, l.text.trimEnd().length),
    };

    // Under `planned type` the lines are fields; under any other `planned` they stay K004 (a leaf).
    const ctx = parent?.kind === "planned" && parent.label === "type" ? "planned-type" : ctxOf(this.sectionKind(), parent?.kind);
    this.interpret(node, l, ctx, parent);
    this.stack.push(node);
  }

  /** Gives a lexed item its kind and fields from its first word, or reads it as a bare item when that word is no keyword here. */
  private interpret(n: Node, l: Line, ctx: Ctx, parent: Parent | undefined): void {
    const first = n.tokens[0];

    if (!first) {
      this.err("K005", n.span, "item has no content", "arguments");

      return;
    }

    const isKw = first.kind === "word" && keywordsOf(ctx).includes(first.text);

    if (!isKw) {
      this.bare(n, l, ctx, parent);

      return;
    }

    n.keyword = first.span;
    n.kind = keywordKind(ctx, first.text);
    const rest = n.tokens.slice(1);
    const parentId = parent?.id ?? null;

    // One case per keyword: each reads its own argument shape and reports
    // K005 with a reason when the shape is wrong.
    switch (n.kind) {
      case "layer":
        this.decl(n, rest, null, false);
        break;
      case "module":
      case "fn":
      case "type":
      case "event":
        this.decl(n, rest, parentId, n.kind !== "module");
        break;
      case "calls":
      case "reads":
      case "allow":
      case "deny":
        this.refList(n, rest, n.kind === "allow" || n.kind === "deny" ? 2 : 1);
        break;
      case "exports": {
        // Exported names are members of the rule module's target.
        const base = parent?.target ?? null;

        for (const t of rest) {
          if (t.kind === "comma") continue;

          if (t.kind === "word" && isSegment(t.text)) {
            n.refs.push({ text: t.text, target: base === null ? nfc(t.text) : `${base}.${nfc(t.text)}`, span: t.span });
          } else {
            this.err("K005", t.span, `expected a name, found \`${t.text}\``, "id");
          }
        }

        // `- exports ,` lists no name either.
        if (rest.every((t) => t.kind === "comma")) {
          this.err("K005", n.span, "`exports` needs at least one name", "arguments");
        }

        break;
      }

      case "layers":
        this.layers(n, rest);
        break;
      case "entry":
      case "no-cycles": {
        const t = rest[0];

        if (t) {
          const hint = n.kind === "entry" ? "; list entries as nested items" : "";
          this.err("K005", t.span, `\`${kindLabel(n.kind)}\` takes no arguments${hint}`, "arguments");
        }

        break;
      }

      case "trigger":
        if (!this.plannedModifier(n, rest) && !this.typedTrigger(n, rest)) this.oneRef(n, rest);
        break;
      case "step":
        if (!this.plannedModifier(n, rest)) this.oneRef(n, rest);
        break;
      case "parallel": {
        const t = rest[0];

        if (t) this.err("K005", t.span, "`parallel` takes no arguments; nest its steps under it", "arguments");
        break;
      }

      case "continues": {
        const t = rest[0];

        if (rest.length === 1 && t && t.kind === "word" && isSegment(t.text)) n.text = { value: nfc(t.text), span: t.span };
        else if (rest.length === 1 && t) this.err("K005", t.span, `expected a flow name, found \`${t.text}\``, "id");
        else this.err("K005", rest[1]?.span ?? n.span, "expected `continues <flow>`", "arguments");
        break;
      }

      case "after": {
        const t = rest[0];

        if (rest.length === 1 && t && t.kind === "word" && isDuration(t.text)) n.text = spanned(t);
        else this.err("K005", t?.span ?? n.span, "expected `after <duration>`: a number and a unit (ms, s, m, min, h, d, w), such as `after 30m`", "arguments");
        break;
      }

      case "every": {
        const first = rest[0];
        const last = rest.at(-1);

        if (first && last && scheduleText(rest.map((t) => t.text)) !== null) n.text = { value: renderTokens(rest), span: { start: first.span.start, end: last.span.end } };
        else this.err("K005", first?.span ?? n.span, 'expected `every <schedule>`: a duration (`every 15m`), a cron macro (`every @daily`) or five cron fields (`every 0 * * * *` or `every "0 * * * *"`)', "arguments");
        break;
      }

      case "rule-module":
      case "wire":
      case "compose":
        this.oneRef(n, rest);
        break;
      case "kind": {
        const t = rest[0];

        if (rest.length === 1 && t && (t.text === "business" || t.text === "technical")) {
          n.text = spanned(t);
        } else {
          this.err("K005", n.span, "`kind` must be `business` or `technical`", "arguments");
        }

        break;
      }

      case "emits": {
        // An optional `event` word after `emits`.
        const r = rest[0]?.text === "event" ? rest.slice(1) : rest;
        const t = r[0];
        const link = t?.kind === "link" ? parseLink(t) : null;

        if (r.length === 1 && t && link !== null && isEventId(link.text)) {
          // `emits event [events.x](…)`: a link is a reference, so its text must be an event ID.
          const ref = this.makeRef(t);

          if (ref) {
            n.refs.push(ref);
            n.text = { value: ref.target, span: ref.span };
          }
        } else if (r.length === 1 && t && t.kind === "word") {
          n.text = spanned(t);

          // An event ID is a reference (ADR 0023 п. 1); any other name stays prose.
          if (isEventId(t.text)) n.refs.push({ text: t.text, target: nfc(t.text), span: t.span });
        } else this.err("K005", n.span, "expected `emits [event] <name>`", "arguments");
        break;
      }

      case "invariant":
      case "question":
        this.freeText(n, l, rest);
        break;
      case "when":
        if (ctx === "wire-dep") {
          // In a wiring dependency: `when <condition> → <id>`.
          const arrow = rest.findIndex((t) => t.text === "→" || t.text === "->");

          if (arrow > 0) {
            this.freeText(n, l, rest.slice(0, arrow));
            this.oneRef(n, rest.slice(arrow + 1));
          } else {
            this.err("K005", n.span, "expected `when <condition> → <id>`", "arguments");
          }
        } else {
          this.freeText(n, l, rest);
        }

        break;
      case "then": {
        const t = rest[0];
        // A single dotted ID is a reference; anything else is prose.
        const id = t?.kind === "link" ? parseLink(t).text : t?.kind === "word" ? t.text : "";

        if (rest.length === 1 && id.includes(".") && isId(id)) {
          this.oneRef(n, rest);
        } else {
          this.freeText(n, l, rest);
        }

        break;
      }

      case "planned": {
        const kindTok = rest[0];
        const idTok = rest[1];

        // `planned <kind> <id> [signature…]`; the error reason says whether
        // the ID or the shape was wrong.
        if (!kindTok || !idTok || !PLANNED_KINDS.has(kindTok.text) || !isId(idTok.text)) {
          const badId = kindTok !== undefined && idTok !== undefined && PLANNED_KINDS.has(kindTok.text) && !isId(idTok.text);
          this.err("K005", n.span, "`planned` needs `<fn|module|type|event> <id> [signature]`", badId ? "id" : "arguments");
          break;
        }

        n.id = nfc(idTok.text);
        n.label = { value: kindTok.text, span: kindTok.span };
        const sig = rest.slice(2);
        const sigStart = sig[0];
        const sigEnd = sig.at(-1);

        if (sigStart && sigEnd) n.text = { value: renderTokens(sig), span: { start: sigStart.span.start, end: sigEnd.span.end } };
        break;
      }

      case "migrate":
        this.migrationRow(n, l, rest);
        break;
      case "component":
      case "zone":
        if (n.kind === "component") n.label = spanned(first);
        this.systemName(n, l, rest, true);
        break;
      case "sequence":
      case "table":
        // A table may only sit under a data store component.
        if (n.kind === "table" && parent?.kind === "component" && parent.label !== null && !DATA_STORES.has(parent.label)) {
          this.err("K005", first.span, `\`table\` goes under a data store (${[...DATA_STORES].join(", ")}), not under \`${parent.label}\``, "arguments");
        }

        this.systemName(n, l, rest, false);
        break;
      case "code":
        this.refList(n, rest, 1);
        break;
      case "relation": {
        n.label = spanned(first);
        const [target, ...caption] = rest;

        if (target && target.kind === "word" && isSegment(target.text)) {
          n.name = { value: nfc(target.text), span: target.span };

          if (caption.length > 0) this.freeText(n, l, caption);
        } else this.err("K005", target?.span ?? n.span, `expected \`${first.text} <component> [caption]\``, target ? "id" : "arguments");
        break;
      }

      case "scale":
      case "index":
      case "requirement":
      case "nfr":
      case "estimate":
      case "tradeoff":
        this.freeText(n, l, rest);
        break;
      case "dropped": {
        const id = rest[0];

        if (id && id.kind === "word" && isId(id.text) && rest.length > 1) {
          n.id = nfc(id.text);
          this.freeText(n, l, rest.slice(1));
        } else {
          this.err("K005", n.span, "expected `dropped <id> <reason>`", "arguments");
        }

        break;
      }

      case "test": {
        const file = rest[0];

        // `test <file> ["<name>"]`: the file, then at most one quoted name.
        if (file && file.kind === "word") {
          n.text = spanned(file);
          const tail = rest.slice(1);
          const q = tail[0];

          if (tail.length === 0) {
            // no name
          } else if (tail.length === 1 && q && q.kind === "quoted") {
            n.label = { value: q.text.replace(/^"|"$/g, ""), span: q.span };
          } else if (q) {
            this.err("K005", q.span, 'expected `test <file> "<name>"`', "arguments");
          }
        } else {
          this.err("K005", n.span, 'expected `test <file> "<name>"`', "arguments");
        }

        break;
      }

      default:
        break;
    }
  }

  /** Item whose first word is not a keyword of its context. */
  private bare(n: Node, l: Line, ctx: Ctx, parent: Parent | undefined): void {
    const tokens = n.tokens;
    const parentId = parent?.id ?? null;
    // A keyword of another position says where it goes when the line here is wrong.
    const hint = (): string => (tokens[0]?.kind === "word" ? placeHint(tokens[0].text, ctx, this.sectionKind()) : "");

    // What a bare line means depends on where it stands: an implicit layer
    // or module name, a module dependency, an entry or free layer, a table
    // column, a sequence message; anywhere else it is an unknown keyword or
    // a child of a leaf (K004).
    switch (ctx) {
      case "map-top":
        n.kind = "layer";
        this.decl(n, tokens, null, false, hint);
        break;
      case "layer":
        n.kind = "module";
        this.decl(n, tokens, parentId, false, hint);
        break;
      case "module":
      case "wire": {
        n.kind = ctx === "module" ? "dep" : "wire-dep";
        const [alias, target] = tokens;

        if (tokens.length === 2 && alias && target && alias.kind === "word" && isSegment(alias.text)) {
          n.name = { value: nfc(alias.text), span: alias.span };

          if (ctx === "module") n.id = parentId === null ? null : `${parentId}.${n.name.value}`;
          this.oneRef(n, [target]);
        } else {
          n.kind = "unknown";

          const what =
            ctx === "module"
              ? "`fn`, `type`, `event`, `module` or a dependency `<alias> <path>`"
              : "a dependency `<alias> <path>`";

          this.err("K005", n.span, `expected ${what}${hint()}`, "arguments");
        }

        break;
      }

      case "ref-list":
        n.kind = "ref";
        this.oneRef(n, tokens);
        break;
      case "table":
        n.kind = "column";
        this.column(n, tokens, hint);
        break;
      case "sequence":
        n.kind = "message";
        this.message(n, tokens, hint);
        break;
      case "planned-type":
        n.kind = "field";
        this.field(n, l);
        break;
      case "unknown":
        break;
      default: {
        if (ctx.startsWith("leaf:")) {
          // SAFETY: a Ctx that starts with `leaf:` is `leaf:${NodeKind}`, so the rest of it is a NodeKind.
          const k = ctx.slice("leaf:".length) as NodeKind;
          this.err("K004", n.span, `\`${kindLabel(k)}\` cannot have nested items`);
        } else {
          const t = tokens[0]!;
          const expected = keywordsOf(ctx).join(", ");
          this.err("K004", t.span, `unknown keyword \`${t.text}\` here; expected one of: ${expected}${hint()}`);
        }
      }
    }
  }

  /**
   * `<name>` or `[name](path#Lnn)` + optional signature. `hint` says where a
   * keyword written as an implicit layer or module name goes.
   */
  private decl(n: Node, rest: Token[], parentId: string | null, sig: boolean, hint: () => string = () => ""): void {
    const t = rest[0];

    if (!t) {
      this.err("K005", n.span, `\`${kindLabel(n.kind)}\` needs a name`, "arguments");

      return;
    }

    let name = "";
    let link: Link | null = null;

    // The name is a plain word or the text of a code link.
    if (t.kind === "word") name = t.text;
    else if (t.kind === "link") {
      link = parseLink(t);
      name = link.text;
    }

    if (!isSegment(name)) {
      const brokenLink = t.text.startsWith("[");
      const msg = brokenLink ? "malformed link, expected `[name](path#Lnn)`" : `invalid name \`${t.text}\``;
      this.err("K005", t.span, msg, brokenLink ? "link" : "id");

      return;
    }

    // A layer's ID is its name; any other declaration's ID extends its
    // parent's ID (none when the parent has none).
    const nameSpan = link ? linkTextSpan(t) : t.span;
    n.name = { value: nfc(name), span: nameSpan };
    n.id = n.kind === "layer" ? n.name.value : parentId === null ? null : `${parentId}.${n.name.value}`;
    n.link = link;
    const tail = rest.slice(1);
    const first = tail[0];
    const last = tail.at(-1);

    // Words after the name: a signature for fn/type/event, an error for a
    // layer or a module.
    if (first && last) {
      if (sig) {
        n.text = { value: renderTokens(tail), span: { start: first.span.start, end: last.span.end } };
      } else {
        const keyword = hint();
        const why = keyword !== "" ? keyword : n.kind === "layer" ? " (a dependency `<alias> <path>` must be nested under a module)" : "";
        this.err("K005", first.span, `unexpected arguments after ${kindLabel(n.kind)} \`${name}\`${why}`, "arguments");
      }
    }
  }

  /** A bare ID, or `[id](href)`: the link text is the ID, the target is kept and never checked. */
  private makeRef(t: Token): Ref | null {
    if (t.kind === "word" && isId(t.text)) {
      return { text: t.text, target: nfc(t.text), span: t.span };
    }

    if (t.kind === "link") {
      const link = parseLink(t);

      if (isId(link.text)) return { text: link.text, target: nfc(link.text), span: linkTextSpan(t), link };
      this.err("K005", t.span, `expected an ID as the link text, found \`${link.text}\``, "id");

      return null;
    }

    // `[](x)` and `[a.b](x` are words to the lexer: a link with no text or no closing `)`.
    const brokenLink = t.text.startsWith("[");
    const msg = brokenLink ? "malformed link, expected `[id](href)`" : `expected an ID, found \`${t.text}\``;
    this.err("K005", t.span, msg, brokenLink ? "link" : "id");

    return null;
  }

  /**
   * `step planned <id>` (or `step planned <kind> <id>`) reads like a modifier,
   * but `planned` is a declaration of its own: K005 on the word says how to
   * write it. Without a line kind the hint assumes `fn`.
   */
  private plannedModifier(n: Node, rest: Token[]): boolean {
    // Only `planned <id>` or `planned <kind> <id>` after the keyword is this
    // mistake; anything else is left to the normal reading.
    const [word, ...tail] = rest;

    if (word?.text !== "planned") return false;
    const kind = tail.length === 2 && PLANNED_KINDS.has(tail[0]!.text) ? tail[0]!.text : tail.length === 1 ? "fn" : null;
    const id = tail.at(-1);

    if (kind === null || !id || id.kind !== "word" || !isId(id.text)) return false;
    const keyword = kindLabel(n.kind);
    this.err(
      "K005",
      word.span,
      `\`planned\` is a declaration, not a ${keyword} modifier: add \`- planned ${kind} ${id.text}\` at the top of the flow and keep \`- ${keyword} ${id.text}\``,
      "arguments",
    );

    return true;
  }

  /**
   * `trigger <kind> <id>` (ADR 0023 п. 3): the kind is kept as the label, the
   * ID is the entry point's fn; `trigger event <id>` (п. 1) keeps `event` as
   * the label and the ID is the event's. A first word without a dot that is
   * no kind is K005 on it. False when the line is a plain `trigger <id>`.
   */
  private typedTrigger(n: Node, rest: Token[]): boolean {
    const [kind, id] = rest;

    // A two-word line whose first word has no dot: that word must be a
    // trigger kind or `event`.
    if (rest.length !== 2 || !kind || !id || kind.kind !== "word" || kind.text.includes(".")) return false;

    if (!isTriggerKind(kind.text) && kind.text !== TRIGGER_EVENT) {
      this.err("K005", kind.span, `unknown trigger kind \`${kind.text}\`; expected one of: ${[...TRIGGER_KINDS, TRIGGER_EVENT].join(", ")}; an entry point of another kind (\`cli\`, \`main\`) is a plain \`- trigger <id>\``, "arguments");

      return true;
    }

    n.label = { value: kind.text, span: kind.span };
    this.oneRef(n, [id]);

    return true;
  }

  /** Reads exactly one reference from the arguments; none or several are K005. */
  private oneRef(n: Node, rest: Token[]): void {
    if (rest.length === 1) {
      const r = this.makeRef(rest[0]!);

      if (r) n.refs.push(r);
    } else if (rest.length === 0) {
      this.err("K005", n.span, "expected an ID", "arguments");
    } else {
      this.err("K005", rest[1]!.span, "expected a single ID", "arguments");
    }
  }

  /** Reads a comma- or space-separated list of references, at least `min` of them. */
  private refList(n: Node, rest: Token[], min: number): void {
    let count = 0;

    for (const t of rest) {
      if (t.kind === "comma") continue;
      count++;
      const r = this.makeRef(t);

      if (r) n.refs.push(r);
    }

    if (count < min) {
      this.err("K005", n.span, `\`${kindLabel(n.kind)}\` needs at least ${min} ID(s)`, "arguments");
    }
  }

  /** `layers a < b < c` */
  private layers(n: Node, rest: Token[]): void {
    // Even positions are references, odd ones must be `<`; a valid list has
    // an odd number of tokens.
    rest.forEach((t, i) => {
      if (i % 2 === 1) {
        if (t.text !== "<") this.err("K005", t.span, `expected \`<\`, found \`${t.text}\``, "arguments");
      } else {
        const r = this.makeRef(t);

        if (r) n.refs.push(r);
      }
    });

    if (rest.length === 0 || rest.length % 2 === 0) {
      this.err("K005", n.span, "expected `layers <a> < <b> …`", "arguments");
    }
  }

  /** `<kind|zone|table|sequence> <name> [text…]`: a name local to the system; `text` (a technology, a label) only where `withText`. */
  private systemName(n: Node, l: Line, rest: Token[], withText: boolean): void {
    const [name, ...tail] = rest;

    if (!name || name.kind !== "word" || !isSegment(name.text)) {
      this.err("K005", name?.span ?? n.span, name ? `invalid name \`${name.text}\`` : `\`${kindLabel(n.kind) === "component" ? (n.label?.value ?? "component") : kindLabel(n.kind)}\` needs a name`, name ? "id" : "arguments");

      return;
    }

    n.name = { value: nfc(name.text), span: name.span };

    if (tail.length === 0) return;

    if (withText) this.freeText(n, l, tail);
    else this.err("K005", tail[0]!.span, `unexpected arguments after ${kindLabel(n.kind)} \`${name.text}\``, "arguments");
  }

  /** `<name> <type> [pk] [unique] [null] [fk <table>.<column>]` under `table`. */
  private column(n: Node, tokens: Token[], hint: () => string): void {
    const [name, type, ...flags] = tokens;

    if (!name || !type || name.kind !== "word" || !isSegment(name.text) || type.kind !== "word") {
      this.err("K005", n.span, `expected a column \`<name> <type> [pk] [unique] [null] [fk <table>.<column>]\` or \`index <columns>\`${hint()}`, "arguments");
      n.kind = "unknown";

      return;
    }

    n.name = { value: nfc(name.text), span: name.span };
    n.text = spanned(type);

    // Flags in any order; `fk` consumes the next token as its
    // `<table>.<column>` target.
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i]!;

      if (flag.kind === "comma") continue;

      if (!COLUMN_FLAGS.has(flag.text)) {
        this.err("K005", flag.span, `unknown column flag \`${flag.text}\`; expected one of: ${[...COLUMN_FLAGS].join(", ")}`, "arguments");
        continue;
      }

      if (flag.text !== "fk") continue;
      const target = flags[i + 1];

      if (!target || !/^[^.\s]+\.[^.\s]+$/.test(target.text) || !isId(target.text)) this.err("K005", target?.span ?? flag.span, "expected `fk <table>.<column>`", "arguments");

      if (target) i++;
    }
  }

  /**
   * `<name>[?]: <type…>` under `planned type`: `name` the field, `label` `?`
   * when it is optional, `text` the type in canonical words. The name and
   * the colon may touch the type (`id:string`): the line is matched as
   * written and the type is the tokens from the first character after the
   * colon. A field of a type alias (`planned type x.T = …`) is K005
   * `arguments`, reported once on its first field; a malformed line is K005
   * `field`. Repeated names are K002 of resolution (`resolve.ts`).
   */
  private field(n: Node, l: Line): void {
    const first = n.tokens[0]!;
    const last = n.tokens.at(-1)!;
    const startIndex = first.span.start.offset - l.start;
    const head = l.text.slice(startIndex, last.span.end.offset - l.start);
    const match = /^([^\s:?]+)(\?)?\s*:\s*/.exec(head);

    if (!match) {
      this.err("K005", n.span, "expected a field `<name>[?]: <type>`, such as `- total: Money` or `- note?: string`", "field");
      n.kind = "unknown";

      return;
    }

    const name = match[1]!;

    if (!FIELD_NAME.test(name)) {
      this.err("K005", l.span(startIndex, startIndex + name.length), `invalid field name \`${name}\`; a field name is an identifier such as \`total\` or \`_id\``, "field");
      n.kind = "unknown";

      return;
    }

    // The type: the tokens from the first character after the colon and its
    // spaces; a token the colon splits keeps only its part after it.
    const typeStart = l.start + startIndex + match[0].length;

    const typeTokens = n.tokens.flatMap((t): Token[] => {
      if (t.span.end.offset <= typeStart) return [];

      if (t.span.start.offset >= typeStart) return [t];
      const cut = typeStart - l.start;

      return [{ kind: t.kind, text: t.text.slice(typeStart - t.span.start.offset), span: l.span(cut, t.span.end.offset - l.start) }];
    });

    const typeFirst = typeTokens[0];
    const typeLast = typeTokens.at(-1);

    n.name = { value: nfc(name), span: l.span(startIndex, startIndex + name.length) };

    if (match[2] !== undefined) n.label = { value: "?", span: l.span(startIndex + name.length, startIndex + name.length + 1) };

    if (!typeFirst || !typeLast) {
      this.err("K005", n.span, `field \`${name}\` needs a type, such as \`- ${name}: string\``, "field");

      return;
    }

    n.text = { value: renderTokens(typeTokens), span: { start: typeFirst.span.start, end: typeLast.span.end } };
    // A type alias has its shape after `=`: fields would be a second one.
    const owner = this.stack.at(-1);

    if (owner?.text?.value.startsWith("=") && !owner.children.some((c) => c.kind === "field")) {
      this.err("K005", n.span, `a type alias has no fields: \`planned type ${owner.id ?? ""} ${owner.text.value}\` already gives its shape; remove the fields or the \`= …\``, "arguments");
    }
  }

  /** `<from> → <to> [text…]` under `sequence`; `->` is `→`, `-->` is `⇢`. */
  private message(n: Node, tokens: Token[], hint: () => string): void {
    const [from, arrow, to, ...text] = tokens;
    const arrows = ["→", "->", "⇢", "-->"];

    if (!from || !arrow || !to || !arrows.includes(arrow.text) || from.kind !== "word" || !isSegment(from.text) || to.kind !== "word" || !isSegment(to.text)) {
      this.err("K005", n.span, `expected a message \`<from> → <to> [text]\`${hint()}`, "arguments");
      n.kind = "unknown";

      return;
    }

    n.name = { value: nfc(from.text), span: from.span };
    n.label = { value: nfc(to.text), span: to.span };
    const first = text[0];
    const last = text.at(-1);

    if (first && last) n.text = { value: renderTokens(text), span: { start: first.span.start, end: last.span.end } };
  }

  /**
   * `map <old> → [planned] <new>`: `id` is the old stack's ID, `text` the
   * row as written, `label` `planned` when the new ID is an intention. The
   * new ID is a reference of this repository (K001 unless the code has it or
   * a `planned` declares it); the old ID lives in another repository and is
   * checked against its snapshot (`migration.from`, business-flows/27).
   */
  private migrationRow(n: Node, l: Line, rest: Token[]): void {
    // `map <old> → [planned] <new>` with nothing after the new ID.
    const [old, arrow, ...tail] = rest;
    const planned = tail[0]?.text === "planned" ? tail[0] : null;
    const target = planned ? tail[1] : tail[0];
    const extra = planned ? tail[2] : tail[1];

    if (!old || old.kind !== "word" || !isId(old.text) || !arrow || (arrow.text !== "→" && arrow.text !== "->") || !target || target.kind !== "word" || !isId(target.text) || extra) {
      this.err("K005", n.span, "expected `map <old id> → [planned] <new id>`", "arguments");

      return;
    }

    n.id = nfc(old.text);
    n.refs.push({ text: target.text, target: nfc(target.text), span: target.span });

    if (planned) n.label = spanned(planned);
    this.freeText(n, l, rest);
  }

  /** Sets the node's text to the arguments as canonical words; no arguments is K005. */
  private freeText(n: Node, l: Line, rest: Token[]): void {
    const a = rest[0];
    const b = rest.at(-1);

    if (a && b) {
      const s = a.span.start.offset - l.start;
      const e = b.span.end.offset - l.start;
      // Canonical like a signature: `fmt` respaces the line, and the text (a verdict's area and hash) must not change with it.
      n.text = { value: renderTokens(rest), span: l.span(s, e) };
    } else {
      this.err("K005", n.span, `\`${kindLabel(n.kind)}\` needs a description`, "arguments");
    }
  }
}

/** A token as a spanned string. */
function spanned(t: Token): Spanned<string> {
  return { value: t.text, span: t.span };
}

/** The leading whitespace of a line, measured two ways: keylang's indent and CommonMark's columns. */
interface Lead {
  raw: string;
  /** Keylang indent: a tab counts as two spaces (§3). */
  indent: number;
  /** CommonMark columns: a tab advances to the next multiple of 4. */
  columns: number;
  hasTab: boolean;
}

/** Measures a line's leading spaces and tabs. */
function leadingWhitespace(text: string): Lead {
  const raw = /^[ \t]*/.exec(text)![0];
  let indent = 0;
  let columns = 0;

  for (const c of raw) {
    if (c === "\t") {
      indent += 2;
      columns += 4 - (columns % 4);
    } else {
      indent += 1;
      columns += 1;
    }
  }

  return { raw, indent, columns, hasTab: raw.includes("\t") };
}

/** A fence opener: its character, its length, its indent in columns and in spaces. */
interface FenceOpen {
  char: "`" | "~";
  len: number;
  columns: number;
  /** Leading spaces, or null when a tab is part of the indent. */
  spaces: number | null;
}

/** A fence opener, ignoring the indent-of-4 rule. An info string with a backtick is not an opener. */
function openFence(text: string): FenceOpen | null {
  const lead = leadingWhitespace(text);
  const rest = text.slice(lead.raw.length);
  const ch = rest[0];

  if (ch !== "`" && ch !== "~") return null;
  // At least three backticks or tildes in a row.
  let len = 0;

  while (rest[len] === ch) len++;

  if (len < 3) return null;
  const info = rest.slice(len).trim();

  if (ch === "`" && info.includes("`")) return null;

  return { char: ch, len, columns: lead.columns, spaces: lead.hasTab ? null : lead.indent };
}

/**
 * CommonMark fence: indent under 4 spaces, or any indent while a list is open (Р9).
 * A backtick info string that itself contains a backtick is prose.
 */
function opensFence(text: string, listOpen: boolean): boolean {
  const open = openFence(text);

  return open !== null && (open.columns < 4 || listOpen);
}

/** Whether a line closes an open fence: the same character, at least as many, nothing but whitespace after. */
function closesFence(text: string, open: { char: string; len: number; columns: number }): boolean {
  const lead = leadingWhitespace(text);

  // A document-level fence closes at indent ≤ 3. A fence opened under a list (Р9) also closes at its own indent.
  if (lead.columns > Math.max(3, open.columns)) return false;
  const rest = text.slice(lead.raw.length);

  if (!rest.startsWith(open.char)) return false;
  let len = 0;

  while (rest[len] === open.char) len++;

  if (len < open.len) return false;

  return /^[ \t]*$/.test(rest.slice(len));
}

/**
 * Drop the indent `fmt` owes a fence that was written under a list item.
 * The opener and the closer lose all of their indent; each body line loses as many
 * spaces as the opener had, and never more than it has. A tab in the opener indent stays.
 */
export function dedentFenceLines(lines: string[]): string[] {
  const first = lines[0];

  if (first === undefined) return lines;
  const open = openFence(first);

  if (!open || open.spaces === null || open.spaces === 0) return lines;
  const spaces = open.spaces;

  return lines.map((line, i) => {
    if (i === 0 || (i === lines.length - 1 && closesFence(line, open))) return line.trimStart();
    let n = 0;

    while (n < spaces && line[n] === " ") n++;

    return line.slice(n);
  });
}

/**
 * Type 1 ends when a line contains `</pre>`, `</script>`, `</style>`, or `</textarea>`.
 * The tag need not match the opener, case does not matter, and `>` comes straight after the name.
 */
const HTML_TYPE1_END = /<\/(?:pre|script|style|textarea)>/i;

/** Start of a CommonMark HTML block of types 1–5, or null. The end test reads the whole line. */
function htmlBlockStart(rest: string): { end: (line: string) => boolean } | null {
  // Types 1 to 5 of CommonMark: raw-text tags, comments, processing
  // instructions, CDATA, declarations; each with its own end marker.
  if (/^<(?:pre|script|style|textarea)(?:[ \t]|>|$)/i.test(rest)) {
    return { end: (line) => HTML_TYPE1_END.test(line) };
  }

  if (rest.startsWith("<!--")) return { end: (line) => line.includes("-->") };

  if (rest.startsWith("<?")) return { end: (line) => line.includes("?>") };

  if (rest.startsWith("<![CDATA[")) return { end: (line) => line.includes("]]>") };

  if (/^<![A-Za-z]/.test(rest)) return { end: (line) => line.includes(">") };

  return null;
}

/**
 * Where the words of a `#` heading line end: before an optional closing
 * sequence of `#` that follows a space or a tab and has only spaces or tabs
 * after it (CommonMark). `# flow a #` has the words `flow a`; in `# flow a#`
 * the `#` is part of a word.
 */
function headingEnd(text: string): number {
  // A closing run of `#` must be preceded by whitespace; trailing
  // whitespace is ignored first.
  const content = text.replace(/[ \t]+$/, "");
  const closing = /[ \t]+#+$/.exec(content);

  return closing ? closing.index : content.length;
}

/** Whether the text after the indent starts a list item: `-`, `*` or `+` followed by a space or the end of the line. */
function isBullet(rest: string): boolean {
  const c0 = rest[0];
  const c1 = rest[1];

  return (c0 === "-" || c0 === "*" || c0 === "+") && (c1 === undefined || c1 === " ");
}

/**
 * An ID in Unicode normal form C: a composed `café` and a decomposed one are
 * one ID. Tokens and spans keep the text as written, so `fmt` changes nothing.
 */
function nfc(text: string): string {
  return text.normalize("NFC");
}

/** A single ID segment: letter or `_`, then letters (with their combining marks), digits, `_`, `-`. */
export function isSegment(s: string): boolean {
  // `$` keeps JS identifiers apart: `$save` and `_save` are two names. `\p{M}`: a decomposed `café` is still letters.
  return /^[\p{Alphabetic}_$][\p{Alphabetic}\p{M}\p{N}_$-]*$/u.test(s);
}

/** A dotted ID: `segment(.segment)*`. */
export function isId(s: string): boolean {
  return s.split(".").every(isSegment);
}

/** The span of the text inside `[…]`, the same span a link reference uses. */
export function linkTextSpan(t: Token): Span {
  const text = parseLink(t).text;
  const { offset, line, col } = t.span.start;

  return { start: { offset: offset + 1, line, col: col + 1 }, end: { offset: offset + 1 + text.length, line, col: col + 1 + codePoints(text) } };
}

/**
 * The parts of a link token `[text](target)`: the text, the decoded path,
 * the target as written (decoded path plus fragment), and the line of a
 * `#L12` or `#L12-L20` fragment.
 */
function parseLink(t: Token): Link {
  const close = t.text.indexOf("](");
  const closeAt = close === -1 ? t.text.length : close;
  const text = t.text.slice(1, closeAt);
  const target = t.text.slice(closeAt + 2, t.text.length - 1);
  const hash = target.indexOf("#");
  const rawPath = hash === -1 ? target : target.slice(0, hash);
  const path = decodeLinkPath(rawPath);
  const frag = hash === -1 ? "" : target.slice(hash + 1);
  let line: number | null = null;

  if (frag.startsWith("L")) {
    const first = frag.slice(1).split("-")[0] ?? "";

    if (/^\d+$/.test(first)) line = Number(first);
  }

  const decoded = frag === "" ? path : `${path}#${frag}`;

  return { text, path, target: decoded, line, span: t.span };
}

/** Percent-decoding for map links. A broken escape is kept as written so the diagnostic still points at the source. */
function decodeLinkPath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

type LexedLine = { tokens: Token[]; comment: Spanned<string> | null };

/**
 * Split an item head into tokens. Words end at whitespace or `,`;
 * `[text](target)` and `"quoted"` are single tokens (a `[` that opens no link
 * is an ordinary word); `<!-- … -->` ends the
 * head and is returned separately.
 */
function lex(l: Line, start: number, errs: [Span, string][]): LexedLine {
  const s = l.text;
  let i = start;
  const tokens: Token[] = [];
  let comment: Spanned<string> | null = null;

  // A word runs to the next space, tab or comma.
  const wordEnd = (from: number): number => {
    for (let k = from; k < s.length; k++) {
      const c = s[k];

      if (c === " " || c === "\t" || c === ",") return k;
    }

    return s.length;
  };

  // Scan left to right: skip whitespace; a `<!--` comment ends the head; a
  // comma, a link, a quoted string or a plain word is one token each.
  while (i < s.length) {
    const c = s[i]!;

    if (c === " " || c === "\t") {
      i++;
      continue;
    }

    if (s.startsWith("<!--", i)) {
      const e = s.trimEnd().length;
      comment = { value: s.slice(i, e), span: l.span(i, e) };
      break;
    }

    let kind: TokenKind;
    let e: number;

    if (c === ",") {
      kind = "comma";
      e = i + 1;
    } else if (c === "[") {
      const end = linkEnd(s, i);

      if (end !== null) {
        kind = "link";
        e = end;
      } else {
        // Plain text such as `[Span, string][]` in a signature; a name that
        // should have been a link is reported by `decl`.
        kind = "word";
        e = wordEnd(i);
      }
    } else if (c === '"') {
      const k = s.indexOf('"', i + 1);

      if (k !== -1) {
        kind = "quoted";
        e = k + 1;
      } else {
        errs.push([l.span(i, wordEnd(i)), "unterminated quote"]);
        kind = "word";
        e = wordEnd(i);
      }
    } else {
      kind = "word";
      e = wordEnd(i);
    }

    tokens.push({ kind, text: s.slice(i, e), span: l.span(i, e) });
    i = e;
  }

  return { tokens, comment };
}

/**
 * The end of `[text](destination)` opened at `i`, or null. As in CommonMark,
 * the destination has no whitespace and holds parentheses only in balanced
 * pairs or escaped (`\(`), so `(https://e.com/Foo_(bar))` ends at the last `)`.
 */
function linkEnd(s: string, i: number): number | null {
  const close = s.indexOf("]", i);

  if (close <= i + 1 || s[close + 1] !== "(") return null;
  // Scan the destination, tracking parenthesis depth; whitespace ends it
  // (no link), an escaped paren is skipped, and the `)` at depth 0 closes it.
  // An empty destination `[x]()` is no link.
  let depth = 0;

  for (let k = close + 2; k < s.length; k++) {
    const c = s[k]!;

    if (/\s/.test(c)) return null;

    if (c === "\\" && (s[k + 1] === "(" || s[k + 1] === ")")) k++;
    else if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) return k > close + 2 ? k + 1 : null;
      depth--;
    }
  }

  return null;
}

/**
 * What an item's head says, for comparing meaning (a verdict's `specHash`, a
 * rule already written): canonical tokens, with a reference written as a link
 * `[id](href)` counted as its ID, so linking a reference changes nothing.
 */
export function renderMeaning(node: Node): string {
  // Link tokens that are references, by their start offset, with the ID to
  // render in their place.
  const linked = new Map(node.refs.flatMap((ref) => (ref.link ? [[ref.link.span.start.offset, ref.link.text] as const] : [])));

  return renderTokens(node.tokens.map((t) => (t.kind === "link" && linked.has(t.span.start.offset) ? { ...t, text: linked.get(t.span.start.offset)! } : t)));
}

/** Canonical rendering of head tokens: single spaces, `a, b` for commas. */
export function renderTokens(tokens: readonly Token[]): string {
  let out = "";
  let previous: Token | undefined;

  for (const t of tokens) {
    // Tokens that touch in the source (`"a")`) stay touching; others, and a comma, get one space after.
    const touching = previous !== undefined && previous.kind !== "comma" && previous.span.end.offset === t.span.start.offset && previous.span.end.line === t.span.start.line;

    if (out !== "" && t.kind !== "comma" && !touching) out += " ";
    out += t.text;
    previous = t;
  }

  return out;
}

export type { Item };
