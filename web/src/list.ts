// Web page (web/src), the left-hand view list; entry point `VirtualList`.
// The view list of the diagram page: flows, discovered flows, entry points and
// the layers view, grouped (flows by the trigger's layer, entry points by
// kind) and filtered by a search over names, labels and IDs. Virtualised: one
// row is one fixed height, and only the rows in sight (plus a margin) exist
// in the DOM, so the hundreds of entry points of a Magento repository scroll
// and filter without a pause.

import type { PageQuery } from "./api.ts";

/** One pickable row of the list: a view (flow, entry point, layers, a doc, a change) and the query that opens it. */
export interface ListItem {
  /** Stable across refreshes: the view's kind and name or ID. */
  key: string;
  label: string;
  hint: string;
  group: string;
  /** Lower-case text the search matches: name, label, IDs. */
  search: string;
  title: string;
  query: PageQuery;
}

/** A drawn row: a collapsible group header or an item under it. */
type Row = { type: "group"; group: string; count: number; open: boolean } | { type: "item"; item: ListItem };

/** One row, px: the CSS of `.row` has the same height. */
export const ROW_HEIGHT = 26;

/** Rows drawn above and below the visible ones. */
const OVERSCAN = 8;

/** The virtualised, grouped and filtered list inside `container`; `onPick` runs when an item is clicked. */
export class VirtualList {
  private readonly container: HTMLElement;
  private readonly spacer: HTMLDivElement;
  private readonly onPick: (item: ListItem) => void;
  private items: ListItem[] = [];
  private rows: Row[] = [];
  private needle = "";
  private active: string | null = null;
  private marked: ReadonlySet<string> | null = null;
  private readonly closed = new Set<string>();
  /** The pending animation frame of a render, 0 when none is pending. */
  private frame = 0;

  constructor(container: HTMLElement, onPick: (item: ListItem) => void) {
    this.container = container;
    this.onPick = onPick;
    this.spacer = document.createElement("div");
    this.spacer.className = "spacer";
    // The spacer is as tall as all rows, so the scrollbar is right; drawn rows sit in it, absolutely placed.
    container.replaceChildren(this.spacer);
    container.addEventListener("scroll", () => this.schedule());
    new ResizeObserver(() => this.schedule()).observe(container);
  }

  /** Replaces the items, keeping the filter and the closed groups. */
  setItems(items: ListItem[]): void {
    this.items = items;
    this.rebuild();
  }

  /** Filters by a text search: every whitespace-separated word must occur; scrolls back to the top. */
  setFilter(text: string): void {
    this.needle = text.trim().toLowerCase();
    this.container.scrollTop = 0;
    this.rebuild();
  }

  /** Highlights the item of the open view; null highlights none. */
  setActive(key: string | null): void {
    this.active = key;
    this.schedule();
  }

  /** Items to mark as using the ID of a usages search; null clears the marks. */
  setMarked(keys: ReadonlySet<string> | null): void {
    this.marked = keys;
    this.rebuild();
  }

  /** The items the search keeps, in list order. */
  visibleItems(): ListItem[] {
    return this.rows.flatMap((row) => (row.type === "item" ? [row.item] : []));
  }

  /** Scrolls the active item into sight. */
  reveal(key: string): void {
    const at = this.rows.findIndex((row) => row.type === "item" && row.item.key === key);

    if (at === -1) return;
    const top = at * ROW_HEIGHT;

    // Scroll only when the row is out of sight, and then centre it.
    if (top < this.container.scrollTop || top + ROW_HEIGHT > this.container.scrollTop + this.container.clientHeight) this.container.scrollTop = Math.max(0, top - this.container.clientHeight / 2);
    this.schedule();
  }

  private matches(item: ListItem): boolean {
    // A usages search replaces the text search until it is cleared.
    if (this.marked !== null) return this.marked.has(item.key);

    if (this.needle === "") return true;

    return this.needle.split(/\s+/).every((word) => item.search.includes(word));
  }

  /** Recomputes the row list (groups in the items' first-seen order, then their matching items) and redraws. */
  private rebuild(): void {
    const byGroup = new Map<string, ListItem[]>();

    // Bucket the matching items by group; a Map keeps the groups in the order the caller gave the items.
    for (const item of this.items) {
      if (!this.matches(item)) continue;
      const list = byGroup.get(item.group);

      if (list) list.push(item);
      else byGroup.set(item.group, [item]);
    }

    // A search or a usages filter opens every group: what it found must be in sight.
    const filtering = this.needle !== "" || this.marked !== null;
    const rows: Row[] = [];

    for (const [group, list] of byGroup) {
      const open = filtering || !this.closed.has(group);
      rows.push({ type: "group", group, count: list.length, open });

      if (open) for (const item of list) rows.push({ type: "item", item });
    }

    this.rows = rows;
    this.spacer.style.height = `${rows.length * ROW_HEIGHT}px`;
    this.render();
  }

  /** Coalesces scroll and resize events into one render per animation frame. */
  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  /** Draws only the rows in the visible window plus `OVERSCAN` on each side; the rest of the list has no DOM. */
  private render(): void {
    const first = Math.max(0, Math.floor(this.container.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(this.rows.length, Math.ceil((this.container.scrollTop + this.container.clientHeight) / ROW_HEIGHT) + OVERSCAN);
    const nodes: HTMLElement[] = [];

    for (let i = first; i < last; i++) nodes.push(this.row(this.rows[i]!, i));
    this.spacer.replaceChildren(...nodes);
  }

  /** One row's button, placed at its index; a group header toggles the group, an item picks it. */
  private row(row: Row, index: number): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.style.top = `${index * ROW_HEIGHT}px`;

    if (row.type === "group") {
      button.className = "row group";
      button.textContent = `${row.open ? "▾" : "▸"} ${row.group} (${row.count})`;
      button.addEventListener("click", () => {
        if (this.closed.has(row.group)) this.closed.delete(row.group);
        else this.closed.add(row.group);
        this.rebuild();
      });

      return button;
    }

    const { item } = row;
    button.className = `row item${item.key === this.active ? " active" : ""}${this.marked?.has(item.key) ? " marked" : ""}`;
    button.title = item.title;
    button.dataset["key"] = item.key;
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = item.hint;
    button.append(hint, document.createTextNode(item.label));
    button.addEventListener("click", () => this.onPick(item));

    return button;
  }
}
