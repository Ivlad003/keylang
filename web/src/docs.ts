// «Карта» of the diagram page: the Markdown of the specs as keylang reads it —
// the map as `keylang map` renders it now, the explained map, the flows, the
// discovered flows and the rest of the spec directory (`GET /api/docs`,
// `GET /api/doc`). The text is shown as written, with the syntax in focus:
// headings, list markers, code spans and fences marked, nothing rendered
// away. A link to another listed file opens it here.

import type { Api, DocList } from "./api.ts";
import { make } from "./dom.ts";
import type { ListItem } from "./list.ts";

export const DOC_GROUP: Record<DocList["files"][number]["group"], string> = {
  map: "Карта",
  "map-explained": "Пояснена карта",
  explain: "Пояснення",
  flows: "Флоу",
  "flows-discovered": "Знайдені флоу",
  spec: "Специфікації",
};

/** The list of the «Карта» mode: every file under its group, the map first. */
export function docItems(list: DocList): ListItem[] {
  const order = Object.keys(DOC_GROUP);
  return [...list.files]
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
    .map((file) => {
      const name = file.path.slice(file.path.lastIndexOf("/") + 1);
      return { key: `docs:${file.path}`, label: name, hint: "md", group: DOC_GROUP[file.group], search: file.path.toLowerCase(), title: file.path, query: { view: "docs", path: file.path } };
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

/** Inline Markdown of one line: code spans and links marked, the rest as text. */
function inline(text: string, from: string, known: ReadonlySet<string>, open: (path: string) => void): Node[] {
  const nodes: Node[] = [];
  const pattern = /`[^`]+`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    last = match.index + match[0].length;
    if (match[0].startsWith("`")) {
      nodes.push(make("code", { text: match[0] }));
      continue;
    }
    const target = match[2]!;
    const file = target.split("#")[0]!;
    const resolved = /^[a-z]+:/i.test(target) || file === "" ? null : normalise(`${from.slice(0, from.lastIndexOf("/") + 1)}${decodeURI(file)}`);
    if (resolved !== null && known.has(resolved)) {
      const link = make("a", { text: match[0], title: resolved });
      link.href = "#";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        open(resolved);
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
  private readonly open: (path: string) => void;
  private known: ReadonlySet<string> = new Set();
  private shown = "";

  constructor(container: HTMLElement, api: Api, host: { status(text: string): void; open(path: string): void }) {
    this.container = container;
    this.api = api;
    this.status = host.status;
    this.open = host.open;
  }

  /** The files a link may open. */
  setList(list: DocList): void {
    this.known = new Set(list.files.map((file) => file.path));
  }

  async show(path: string): Promise<void> {
    if (path === "") {
      this.shown = "";
      this.container.replaceChildren(make("p", { className: "empty", text: "Оберіть файл ліворуч: карту, пояснену карту, флоу чи специфікацію." }));
      return;
    }
    this.status(`loading ${path}…`);
    try {
      const doc = await this.api.doc(path);
      this.shown = path;
      this.render(doc.path, doc.text);
      this.status(`${doc.path} · ${doc.text.split("\n").length} lines`);
    } catch (error) {
      this.status(error instanceof Error ? error.message : String(error));
    }
  }

  current(): string {
    return this.shown;
  }

  private render(path: string, text: string): void {
    const pre = make("pre", { className: "md" });
    let fence = false;
    for (const line of text.replace(/\n$/, "").split("\n")) {
      const row = make("span", { className: "line" });
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence;
        row.classList.add("md-fence");
        row.textContent = line;
      } else if (fence) {
        row.classList.add("md-code");
        row.textContent = line;
      } else if (/^#{1,6}\s/.test(line)) {
        row.classList.add("md-heading", `md-h${/^#+/.exec(line)![0].length}`);
        row.append(...inline(line, path, this.known, this.open));
      } else {
        const marker = /^(\s*)([-*+]|\d+\.)(\s)/.exec(line);
        if (marker) {
          row.append(marker[1]!, make("span", { className: "md-marker", text: marker[2]! }), marker[3]!, ...inline(line.slice(marker[0].length), path, this.known, this.open));
        } else if (line.startsWith(">")) {
          row.classList.add("md-quote");
          row.append(...inline(line, path, this.known, this.open));
        } else row.append(...inline(line, path, this.known, this.open));
      }
      pre.append(row, "\n");
    }
    this.container.replaceChildren(make("h2", { text: path }), pre);
    this.container.scrollTop = 0;
  }
}
