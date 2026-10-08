// Where the diagram editor (editor.ts, business-flows/23) keeps the positions
// a person gave the shapes of a view: `keylang/diagrams/<view>.layout.json`
// in git (business-flows/24), through `GET`/`PUT /api/layout`. The page
// speaks in the keys of its canvas (`step:6`, `lane:<layer>`,
// `edge:<from>-><to>`, `draft:3` for a drawn shape); the server keys the
// file by what each shape says in the spec, so the layout survives a
// reordered spec. `MemoryLayoutStore` is the store without a server.

import type { Api } from "./api.ts";

/** One shape's place, model coordinates; an edge carries its bend points instead. Beside it, what a shape the code does not draw needs to be drawn again. */
export interface Position {
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: { x: number; y: number }[];
  /** A drawn shape: its keylang ID, kind and label. */
  id?: string;
  kind?: string;
  label?: string;
  /** A note's text. */
  note?: string;
  /** A fill colour (`#rrggbb`). */
  colour?: string;
  /** The spec a proposal of this drawn shape went to. */
  proposed?: string;
  /** A drawn edge: the keys of its ends. */
  from?: string;
  to?: string;
  /** From the server: a drawn shape whose proposal waits, or was not merged. */
  status?: "pending" | "rejected";
}

/** The positions of one view, by shape key. */
export type Layout = Record<string, Position>;

export interface LayoutStore {
  /** The saved layout of a view (`flow:checkout`, `layers`…), or null when none is. */
  load(view: string): Promise<Layout | null>;
  /** Replaces the layout of a view. */
  save(view: string, layout: Layout): Promise<void>;
}

/** The store until ticket 24: a map in memory, copies in and out so a caller never shares an object with it. */
export class MemoryLayoutStore implements LayoutStore {
  private readonly layouts = new Map<string, string>();

  load(view: string): Promise<Layout | null> {
    const text = this.layouts.get(view);
    return Promise.resolve(text === undefined ? null : (JSON.parse(text) as Layout));
  }

  save(view: string, layout: Layout): Promise<void> {
    this.layouts.set(view, JSON.stringify(layout));
    return Promise.resolve();
  }
}

/** The store of `keylang web`: the view's layout file, through the API. A view without a key keeps nothing. */
export class FileLayoutStore implements LayoutStore {
  private readonly api: Api;

  constructor(api: Api) {
    this.api = api;
  }

  async load(view: string): Promise<Layout | null> {
    if (view === "") return null;
    const answer = await this.api.layout(view);
    return answer.exists ? answer.layout : null;
  }

  async save(view: string, layout: Layout): Promise<void> {
    if (view !== "") await this.api.saveLayout(view, layout);
  }
}

let current: LayoutStore = new MemoryLayoutStore();

/** The store the editor reads and writes. */
export function layoutStore(): LayoutStore {
  return current;
}

/** Puts another store in place: the page puts `FileLayoutStore` (business-flows/24). */
export function useLayoutStore(store: LayoutStore): void {
  current = store;
}
