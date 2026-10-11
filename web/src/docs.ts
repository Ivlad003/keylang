// «Карта» of the diagram page: the Markdown of the specs as keylang reads it —
// the map as `keylang map` renders it now, the explained map, the flows, the
// discovered flows and the rest of the spec directory (`GET /api/docs`,
// `GET /api/doc`). The text is shown as written, with the syntax in focus:
// headings, list markers, code spans and fences marked, nothing rendered
// away. A list item folds its nested items, so a map of two thousand lines
// opens as its layers and modules (a fn, its calls one click away); a search
// unfolds what it finds. A link to another listed file opens it here, at the
// ID its `#anchor` names.

import type { Api, DocList } from "./api.ts";
import { button, make } from "./dom.ts";
import type { ListItem } from "./list.ts";

export const DOC_GROUP: Record<DocList["files"][number]["group"], string> = {
  map: "Карта",
  "map-explained": "Пояснена карта",
  explain: "Пояснення",
  flows: "Флоу",
  "flows-discovered": "Знайдені флоу",
  spec: "Специфікації",
};

/** A file longer than this opens folded below its modules. */
const FOLD_LINES = 150;
/** List depth shown unfolded in a long file: the layer and its modules. */
const OPEN_DEPTH = 2;

/**
 * The group of an explanation: a brief (`explain/brief/<layer>.<…>.md`) by
 * its layer, a full layer explanation (`explain/<layer>.md`) apart — 860
 * files in one group are a list nobody reads.
 */
function explainGroup(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (/\/explain\/brief\//.test(path)) return `${DOC_GROUP.explain} · ${name.split(".")[0]}`;
  return `${DOC_GROUP.explain} · шари`;
}

/** The list of the «Карта» mode: every file under its group, the map first. */
export function docItems(list: DocList): ListItem[] {
  const order = Object.keys(DOC_GROUP);
  return [...list.files]
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
    .map((file) => {
      const name = file.path.slice(file.path.lastIndexOf("/") + 1);
      const group = file.group === "explain" ? explainGroup(file.path) : DOC_GROUP[file.group];
      return { key: `docs:${file.path}`, label: name, hint: "md", group, search: file.path.toLowerCase(), title: file.path, query: { view: "docs", path: file.path } };
    });
}

/** `a/b/../c.md` → `a/c.md`; null when it climbs above the root. */
function normalise(path: string): string | null {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}

type Open = (path: string, at: string | null) => void;

/** A line of the file and, for a list item, the lines under it. `drawn`: how many children are on the page. */
interface Block {
  line: string;
  kind: "text" | "item" | "fence" | "code" | "heading" | "quote";
  indent: number;
  anchors: string[];
  children: Block[];
  depth: number;
  parent?: Block;
  drawn: number;
  row?: HTMLElement;
  box?: HTMLElement;
}

/** Inline Markdown of one line: code spans and links marked, HTML anchors and comments dimmed, the rest as text. */
function inline(text: string, from: string, known: ReadonlySet<string>, open: Open): Node[] {
  const nodes: Node[] = [];
  const pattern = /`[^`]+`|\[([^\]]+)\]\(([^)\s]+)\)|<a id="[^"]*"><\/a>(?:<br>)?|<!--[\s\S]*?-->/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    last = match.index + match[0].length;
    if (match[0].startsWith("`")) {
      nodes.push(make("code", { text: match[0] }));
      continue;
    }
    if (match[0].startsWith("<")) {
      nodes.push(make("span", { className: "md-html", text: match[0] }));
      continue;
    }
    const target = match[2]!;
    const [file = "", anchor = ""] = target.split("#");
    // A link of this file (`#base.brief`) or of another listed one (`base.md#base.brief`).
    const resolved = /^[a-z]+:/i.test(target) ? null : file === "" ? from : normalise(`${from.slice(0, from.lastIndexOf("/") + 1)}${decodeURI(file)}`);
    if (resolved !== null && known.has(resolved) && (file !== "" || anchor !== "")) {
      const link = make("a", { text: match[0], title: anchor ? `${resolved}#${anchor}` : resolved });
      link.href = "#";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        open(resolved, anchor === "" ? null : decodeURIComponent(anchor));
      });
      nodes.push(link);
    } else nodes.push(make("span", { className: "md-link", text: match[0] }));
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

export class Docs {
  private readonly container: HTMLElement;
  private readonly api: Api;
  private readonly status: (text: string) => void;
  private readonly open: Open;
  private known: ReadonlySet<string> = new Set();
  private shown = "";
  /** The last request: an answer to an earlier one (a slower file) is dropped, not drawn over it. */
  private request = 0;
  /** Every line of the open file, drawn or not: search and anchors look here. */
  private blocks: Block[] = [];
  private hits: Block[] = [];
  private hit = -1;
  private path = "";
  private fold = false;

  constructor(container: HTMLElement, api: Api, host: { status(text: string): void; open(path: string, at: string | null): void }) {
    this.container = container;
    this.api = api;
    this.status = host.status;
    this.open = host.open;
  }

  /** The files a link may open. */
  setList(list: DocList): void {
    this.known = new Set(list.files.map((file) => file.path));
  }

  async show(path: string, at: string | null = null): Promise<void> {
    const request = ++this.request;
    if (path === "") {
      this.shown = "";
      this.container.replaceChildren(make("p", { className: "empty", text: "Оберіть файл ліворуч: карту, пояснену карту, флоу чи специфікацію." }));
      return;
    }
    // The same file: only the place changes.
    if (path === this.shown && this.container.querySelector("pre.md")) {
      if (at !== null) this.reveal(at);
      return;
    }
    this.status(`loading ${path}…`);
    try {
      const doc = await this.api.doc(path);
      if (request !== this.request) return;
      this.shown = path;
      const lines = this.render(doc.path, doc.text);
      this.status(`${doc.path} · ${lines} lines${lines > FOLD_LINES ? " · folded below the modules: ▸ opens, «розгорнути все» shows all" : ""}`);
      if (at !== null) this.reveal(at);
    } catch (error) {
      if (request === this.request) this.status(error instanceof Error ? error.message : String(error));
    }
  }

  current(): string {
    return this.shown;
  }

  /** A block drawn and in sight: every item above it unfolded (their nested items drawn first), centred. */
  private bringOut(block: Block): HTMLElement {
    const chain: Block[] = [];
    for (let up = block.parent; up; up = up.parent) chain.unshift(up);
    for (const item of chain) this.unfold(item);
    const row = block.row!;
    row.scrollIntoView({ block: "center" });
    return row;
  }

  /** The line of an `<a id="…">` (the explained map's anchors), unfolded, centred and marked. */
  private reveal(at: string): void {
    for (const old of this.container.querySelectorAll(".md-target")) old.classList.remove("md-target");
    const block = this.blocks.find((b) => b.anchors.includes(at));
    if (!block) {
      this.status(`${this.shown}: no anchor #${at}`);
      return;
    }
    this.bringOut(block).classList.add("md-target");
  }

  private search(needle: string, count: HTMLElement): void {
    for (const old of this.hits) old.row?.classList.remove("md-hit", "md-hit-now");
    this.hits = [];
    this.hit = -1;
    const text = needle.trim().toLowerCase();
    if (text === "") {
      count.textContent = "";
      return;
    }
    // The text, not the page: a hit inside a folded item that was never drawn counts too.
    this.hits = this.blocks.filter((block) => block.line.toLowerCase().includes(text));
    count.textContent = this.hits.length === 0 ? "нічого" : `${this.hits.length}`;
    if (this.hits.length > 0) this.next(count);
  }

  private next(count: HTMLElement, step = 1): void {
    if (this.hits.length === 0) return;
    this.hits[this.hit]?.row?.classList.remove("md-hit-now");
    this.hit = (this.hit + step + this.hits.length) % this.hits.length;
    const row = this.bringOut(this.hits[this.hit]!);
    for (const block of this.hits) block.row?.classList.add("md-hit");
    row.classList.add("md-hit-now");
    count.textContent = `${this.hit + 1} / ${this.hits.length}`;
  }

  /** Opens a folded item, drawing its nested lines the first time. */
  private unfold(item: Block): void {
    if (!item.box) return;
    this.drawRest(item);
    item.box.classList.remove("folded");
  }

  /** The lines of an item not drawn yet (it was folded when the file opened). */
  private drawRest(item: Block): void {
    if (item.drawn >= item.children.length) return;
    const into = item.box!.lastElementChild as HTMLElement;
    for (const child of item.children.slice(item.drawn)) into.append(this.draw(child));
    item.drawn = item.children.length;
  }

  /** One block and, unless it is folded, what lies under it. */
  private draw(block: Block): HTMLElement {
    // `md-item` is the foldable box around an item's line, not the line.
    const row = make("div", { className: `line${block.kind === "text" || block.kind === "item" ? "" : ` md-${block.kind}`}` });
    block.row = row;
    const line = block.line;
    if (block.kind === "fence" || block.kind === "code") row.textContent = line;
    else if (block.kind === "heading") {
      row.classList.add(`md-h${/^#+/.exec(line)![0].length}`);
      row.append(...inline(line, this.path, this.known, this.open));
    } else if (block.kind === "item") {
      const marker = /^(\s*)([-*+]|\d+\.)(\s)/.exec(line)!;
      row.append(marker[1]!, make("span", { className: "md-marker", text: marker[2]! }), marker[3]!, ...inline(line.slice(marker[0].length), this.path, this.known, this.open));
    } else row.append(...inline(line, this.path, this.known, this.open));
    if (block.anchors.length > 0) row.dataset["anchors"] = block.anchors.join(" ");
    if (block.kind !== "item") return row;
    const children = make("div", { className: "md-children" });
    const box = make("div", { className: "md-item" }, row, children);
    block.box = box;
    if (block.children.some((child) => child.kind === "item")) {
      box.classList.add("has-items");
      const toggle = make("button", { className: "md-toggle", title: "згорнути / розгорнути" });
      toggle.type = "button";
      toggle.addEventListener("click", () => (box.classList.contains("folded") ? this.unfold(block) : box.classList.add("folded")));
      row.prepend(toggle);
    }
    // Folded: its description now, its nested items when it opens — a map of thousands of lines draws its modules only.
    const folded = this.fold && block.depth >= OPEN_DEPTH && box.classList.contains("has-items");
    if (folded) box.classList.add("folded");
    const until = folded ? block.children.findIndex((child) => child.kind === "item") : block.children.length;
    for (const child of block.children.slice(0, until === -1 ? block.children.length : until)) children.append(this.draw(child));
    block.drawn = until === -1 ? block.children.length : until;
    return box;
  }

  /** Draws the file; returns its number of lines. */
  private render(path: string, text: string): number {
    const all = text.replace(/\n$/, "").split("\n");
    this.path = path;
    this.fold = all.length > FOLD_LINES;
    this.blocks = [];
    // The lines as a tree: a line goes under the deepest list item it is indented under.
    const roots: Block[] = [];
    const stack: Block[] = [];
    let fence = false;
    for (const line of all) {
      const indent = /^\s*/.exec(line)![0].length;
      const opens = /^\s*(```|~~~)/.test(line);
      const kind: Block["kind"] = opens ? "fence" : fence ? "code" : /^#{1,6}\s/.test(line) ? "heading" : /^(\s*)([-*+]|\d+\.)(\s)/.test(line) ? "item" : line.startsWith(">") ? "quote" : "text";
      if (opens) fence = !fence;
      if (line.trim() !== "" && kind !== "code" && !(kind === "fence" && !fence)) while (stack.length > 0 && indent <= stack[stack.length - 1]!.indent) stack.pop();
      const parent = stack[stack.length - 1];
      const block: Block = { line, kind, indent, anchors: [...line.matchAll(/<a id="([^"]+)">/g)].map((m) => m[1]!), children: [], depth: (parent?.depth ?? 0) + (kind === "item" ? 1 : 0), drawn: 0, ...(parent ? { parent } : {}) };
      (parent ? parent.children : roots).push(block);
      this.blocks.push(block);
      if (kind === "item") stack.push(block);
    }
    const pre = make("pre", { className: "md" });
    for (const block of roots) pre.append(this.draw(block));
    const count = make("span", { className: "md-count" });
    const find = make("input");
    find.type = "search";
    find.className = "md-find";
    find.placeholder = "знайти в документі";
    find.setAttribute("aria-label", "Знайти в документі");
    find.addEventListener("input", () => this.search(find.value, count));
    find.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.next(count, event.shiftKey ? -1 : 1);
    });
    const unfoldAll = (): void => {
      for (const block of this.blocks) if (block.box?.classList.contains("has-items") || (block.kind === "item" && block.box)) this.unfold(block);
      // Items drawn by the unfolding above are unfolded too.
      for (const box of pre.querySelectorAll(".md-item.folded")) box.classList.remove("folded");
    };
    const foldAll = (): void => {
      for (const box of pre.querySelectorAll(".md-item.has-items")) box.classList.add("folded");
    };
    const bar = make("div", { className: "md-bar" }, make("h2", { text: path }), button("розгорнути все", unfoldAll, { className: "md-tool" }), button("згорнути все", foldAll, { className: "md-tool" }), find, count);
    this.container.replaceChildren(bar, pre);
    this.container.scrollTop = 0;
    this.hits = [];
    return all.length;
  }
}
