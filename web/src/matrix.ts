// The layers view as a dependency matrix: a row depends on a column, a cell
// holds how many dependencies go that way, its colour what the rules say —
// a broken rule red, an unverified one amber, an allowed pair green. Between
// a dozen layers or more, with a rule for every pair (a baseline writes
// them), a drawing is a smudge; a matrix reads at any size. A row's header
// picks the layer, as a click on its shape does.

import type { Diagram, DiagramNode } from "./api.ts";
import { VERDICT_GLYPH } from "./canvas.ts";
import { make } from "./dom.ts";

/** More edges than this and the layers view opens as the matrix. */
export const MATRIX_FROM = 60;

interface Cell {
  count: number;
  rules: { kind: string; verdict: string; label: string }[];
}

export function renderMatrix(container: HTMLElement, diagram: Diagram, pick: (node: DiagramNode) => void, selected: string | null): void {
  const layers = diagram.nodes.filter((node) => node.kind === "layer");
  const cells = new Map<string, Cell>();
  const cell = (from: string, to: string): Cell => {
    const key = `${from}\u0000${to}`;
    let found = cells.get(key);
    if (!found) cells.set(key, (found = { count: 0, rules: [] }));
    return found;
  };
  for (const edge of diagram.edges) {
    if (edge.kind === "dependency") cell(edge.from, edge.to).count += Number(edge.label ?? 0) || 0;
    else if (edge.kind === "allow" || edge.kind === "deny") cell(edge.from, edge.to).rules.push({ kind: edge.kind, verdict: edge.verdict ?? "ok", label: edge.label ?? edge.kind });
  }
  const table = make("table", { className: "dsm" });
  const head = make("tr", {}, make("th", { className: "corner", text: "залежить ↓ від →" }));
  for (const column of layers) head.append(make("th", { className: "col", title: column.label }, make("span", { text: column.label })));
  table.append(make("thead", {}, head));
  const body = make("tbody");
  for (const row of layers) {
    const name = make("th", { className: `row${row.id === selected ? " selected" : ""}`, title: `${row.label}: показати шар` }, `${row.verdict ? `${VERDICT_GLYPH[row.verdict] ?? ""} ` : ""}${row.label}`);
    name.addEventListener("click", () => pick(row));
    const tr = make("tr", {}, name);
    for (const column of layers) {
      const td = make("td");
      if (row.id === column.id) {
        td.className = "self";
        tr.append(td);
        continue;
      }
      const found = cells.get(`${row.id}\u0000${column.id}`);
      if (found) {
        const broken = found.rules.find((rule) => rule.verdict === "fail");
        const doubtful = found.rules.find((rule) => rule.verdict === "unverified");
        const allowed = found.rules.find((rule) => rule.kind === "allow");
        // A broken rule shows always; otherwise only a pair with dependencies has a colour — an allow
        // (`allow app external.react`) before a deny check could not prove, which an empty pair needs no word on.
        td.className = broken ? "fail" : found.count === 0 ? "" : allowed ? "allowed" : doubtful ? "unverified" : "dep";
        if (found.count > 0) td.textContent = String(found.count);
        td.title = [`${row.label} → ${column.label}: ${found.count} залежн.`, ...found.rules.map((rule) => `${VERDICT_GLYPH[rule.verdict] ?? ""} ${rule.label}`)].join("\n");
      }
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  const legend = make(
    "p",
    { className: "dsm-legend" },
    "Рядок залежить від стовпця, число — скільки залежностей. ",
    make("span", { className: "swatch fail", text: "порушене правило" }),
    " ",
    make("span", { className: "swatch unverified", text: "не перевірено" }),
    " ",
    make("span", { className: "swatch allowed", text: "дозволено правилом" }),
    " ",
    make("span", { className: "swatch dep", text: "без правила" }),
    ". Наведіть на клітинку — правила пари; клік по шару — його панель.",
  );
  container.replaceChildren(legend, table);
}
