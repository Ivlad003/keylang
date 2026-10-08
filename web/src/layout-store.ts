// Where the diagram editor (editor.ts, business-flows/23) keeps the positions
// a person gave the shapes of a view. Ticket 24 backs this interface with
// `keylang/diagrams/<view>.layout.json` in git; until then the positions live
// in memory, for the life of the page. Keys are stable: the shape's key in the
// diagram (`step:6`, `when:9`, a lane's layer, `edge:<from>-><to>`), never an
// index, so a layout survives a reordered spec.

/** One shape's place, model coordinates; an edge carries its bend points instead. */
export interface Position {
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: { x: number; y: number }[];
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

let current: LayoutStore = new MemoryLayoutStore();

/** The store the editor reads and writes. */
export function layoutStore(): LayoutStore {
  return current;
}

/** Puts another store in place (ticket 24: the layout files). */
export function useLayoutStore(store: LayoutStore): void {
  current = store;
}
