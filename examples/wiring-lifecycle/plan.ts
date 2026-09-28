// Prototype of the wiring lifecycle contract (ADR 0003): a wiring graph →
// an initialization order, or the cycle that forbids one. `keylang wire`
// emits straight-line code in this order; there is no container at run time.

export interface WireNode {
  id: string;
  /** Dependency name → the ID it is built from. */
  deps: Record<string, string>;
}

export type Plan = { order: string[] } | { cycle: string[] };

/** Depth-first topological order (dependencies first), stable by declaration order; the first cycle found otherwise. */
export function plan(nodes: readonly WireNode[]): Plan {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, "visiting" | "done">();
  const order: string[] = [];
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...path.slice(path.indexOf(id)), id];
    state.set(id, "visiting");
    path.push(id);
    for (const dep of Object.values(byId.get(id)?.deps ?? {})) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(id, "done");
    order.push(id);
    return null;
  };
  for (const n of nodes) {
    const cycle = visit(n.id);
    if (cycle) return { cycle };
  }
  return { order };
}
