// Strongly connected components of a directed module graph.
// A component is cyclic when it has two or more modules, or a self-loop.

export function stronglyConnected(adj: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const nodes = new Set<string>(adj.keys());
  for (const targets of adj.values()) for (const target of targets) nodes.add(target);

  const visit = (node: string): void => {
    indices.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of adj.get(node) ?? []) {
      if (!indices.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? 0, indices.get(next) ?? 0));
      }
    }
    if (low.get(node) !== indices.get(node)) return;
    const component: string[] = [];
    for (;;) {
      const item = stack.pop();
      if (item === undefined) break;
      onStack.delete(item);
      component.push(item);
      if (item === node) break;
    }
    const self = component.length === 1 && (adj.get(component[0] ?? "")?.has(component[0] ?? "") ?? false);
    if (component.length > 1 || self) components.push(component.sort());
  };

  for (const node of [...nodes].sort()) if (!indices.has(node)) visit(node);
  return components;
}

/** One cycle inside `members` that passes through `start`. */
export function cycleThrough(adj: ReadonlyMap<string, ReadonlySet<string>>, members: ReadonlySet<string>, start: string): string[] {
  if (adj.get(start)?.has(start)) return [start];
  const parent = new Map<string, string>();
  const stack = [start];
  const seen = new Set<string>([start]);
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    for (const next of adj.get(node) ?? []) {
      if (!members.has(next)) continue;
      if (next === start) {
        const rev = [node];
        let cursor = node;
        while (cursor !== start) {
          const previous = parent.get(cursor);
          if (previous === undefined) break;
          rev.push(previous);
          cursor = previous;
        }
        return [start, ...rev.reverse().filter((id) => id !== start)];
      }
      if (seen.has(next)) continue;
      seen.add(next);
      parent.set(next, node);
      stack.push(next);
    }
  }
  return [start];
}
