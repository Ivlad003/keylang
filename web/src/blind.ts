// «Сліпі зони» of the diagram page (business-flows/13 and 22): the report of
// `keylang coverage --json` (`GET /api/coverage`) in its five sections — the
// share of fns the entry points reach, the orphans, the modules with most
// holes and why, the entry points no flow starts from, and «logic in data» to
// check by hand. Every place links into the code (`vscode://`), and an ID
// opens in the entry explorer. Read only; asked again on «оновити».

import { ApiError, type Api, type Coverage } from "./api.ts";
import { button, codeLink, make } from "./dom.ts";

export interface BlindHost {
  root(): string | undefined;
  explore(id: string): void;
  /** Opens the discovered flow of that name as a diagram. */
  discovered(name: string): void;
  status(text: string): void;
}

/** At most this many rows of a long section; the CLI's text keeps a top-10 too. */
const MAX_ROWS = 200;

export class BlindSpots {
  private readonly container: HTMLElement;
  private readonly api: Api;
  private readonly host: BlindHost;
  private loading: Promise<void> | null = null;

  constructor(container: HTMLElement, api: Api, host: BlindHost) {
    this.container = container;
    this.api = api;
    this.host = host;
  }

  show(): Promise<void> {
    this.loading ??= this.load().finally(() => (this.loading = null));
    return this.loading;
  }

  private async load(): Promise<void> {
    this.host.status("blind spots: reading a fresh snapshot (coverage)…");
    if (this.container.childElementCount === 0) this.container.replaceChildren(make("p", { className: "empty", text: "loading…" }));
    try {
      const report = await this.api.coverage();
      this.render(report);
      this.host.status(`blind spots · reach ${(report.reach.share * 100).toFixed(1)}% · ${report.orphans.length} orphans · ? ${report.holes.total} · ${report.unflowed.length} entry points without a flow · ${report.dataLogic.sites.length} logic in data`);
    } catch (error) {
      const text = error instanceof ApiError && error.status === 403 ? "No access: open the URL printed by `keylang web` (it carries the access token)." : error instanceof Error ? error.message : String(error);
      this.container.replaceChildren(make("p", { className: "error", text }));
      this.host.status(text);
    }
  }

  private explore(id: string): HTMLButtonElement {
    return button("дослідити", () => this.host.explore(id), { className: "link", title: `open ${id} in the explorer` });
  }

  private section(id: string, title: string, note: string, ...body: Node[]): HTMLElement {
    const block = make("section", { className: "blind-section" }, make("h3", { text: title }), make("p", { className: "note", text: note }), ...body);
    block.id = id;
    return block;
  }

  private table(head: string[], rows: (Node | string)[][], total: number): HTMLElement {
    if (rows.length === 0) return make("p", { className: "none", text: "нічого" });
    const table = make("table");
    table.append(make("thead", {}, make("tr", {}, ...head.map((h) => make("th", { text: h })))));
    const body = make("tbody");
    for (const row of rows.slice(0, MAX_ROWS)) body.append(make("tr", {}, ...row.map((cell) => make("td", {}, cell))));
    table.append(body);
    if (total > MAX_ROWS) return make("div", {}, table, make("p", { className: "note", text: `…ще ${total - MAX_ROWS}; повний список — \`keylang coverage --json\`` }));
    return table;
  }

  private render(report: Coverage): void {
    const root = this.host.root();
    const { reach } = report;
    const reachBlock = this.section(
      "blind-reach",
      "1. Досяжність з точок входу",
      "Частка fn поза тестами, досяжних хоч з однієї точки входу по розв'язаних викликах.",
      make("p", { className: "big", text: `${(reach.share * 100).toFixed(1)}% — ${reach.reachable} з ${reach.fns} fn; точок входу ${reach.entries}; fn у тестах ${reach.tests}` }),
    );
    const orphans = this.section(
      "blind-orphans",
      `2. Сироти (${report.orphans.length})`,
      "Fn, яких не досягає жодна точка входу: мертвий код або вхід, якого keylang не знає.",
      this.table(
        ["fn", "код", "викликачів", "втікає як значення", ""],
        report.orphans.map((o) => [make("code", { text: o.id }), codeLink(root, o.file, o.line), String(o.callers), o.escapes ?? "—", this.explore(o.id)]),
        report.orphans.length,
      ),
    );
    const reasons = make("ul", { className: "reasons" });
    for (const r of report.holes.reasons.slice(0, 20)) reasons.append(make("li", {}, make("b", { text: String(r.count) }), ` ${r.kind}: ${r.reason}`));
    const holes = this.section(
      "blind-holes",
      `3. Дірки (${report.holes.total})`,
      "Модулі з найбільшою кількістю викликів, яких keylang не розв'язав, і причини (імена замінено на `X`).",
      reasons,
      this.table(
        ["модуль", "код", "дірок", "причини"],
        report.holes.modules.map((m) => [make("code", { text: m.module }), m.file ? codeLink(root, m.file, null) : "—", String(m.holes), m.reasons.map((r) => `${r.count}× ${r.reason}`).join("; ")]),
        report.holes.modules.length,
      ),
    );
    const unflowed = this.section(
      "blind-unflowed",
      `4. Точки входу без флоу (${report.unflowed.length})`,
      "Жоден написаний флоу не має їх тригером; знайдений флоу (`flows discover`) — чернетка для старту.",
      this.table(
        ["вид", "мітка", "fn", "код", "знайдений флоу", ""],
        report.unflowed.map((u) => [
          u.kind,
          u.label,
          make("code", { text: u.id }),
          codeLink(root, u.file, u.line),
          u.discovered ? (u.discovered.inView ? button(u.discovered.name, () => this.host.discovered(u.discovered!.name), { className: "link", title: u.discovered.file }) : `${u.discovered.name} (не в представленні: \`keylang flows discover\`)`) : "—",
          this.explore(u.id),
        ]),
        report.unflowed.length,
      ),
    );
    const labels = new Map(report.dataLogic.signals.map((s) => [s.id, s.label]));
    const signals = make("ul", { className: "reasons" });
    for (const s of report.dataLogic.signals) signals.append(make("li", {}, make("b", { text: String(s.count) }), ` ${s.label}`));
    const dataLogic = this.section(
      "blind-data",
      `5. Логіка в даних — перевірити вручну (${report.dataLogic.sites.length})`,
      "Виклики читачів налаштувань: поведінку вирішують дані, яких keylang не читає.",
      signals,
      this.table(
        ["сигнал", "місце", "виклик", "у", ""],
        report.dataLogic.sites.map((s) => [labels.get(s.signal) ?? s.signal, codeLink(root, s.file, s.line), make("code", { text: s.text }), s.in ? make("code", { text: s.in }) : "—", s.in ? this.explore(s.in) : ""]),
        report.dataLogic.sites.length,
      ),
    );
    const head = make("header", { className: "blind-head" }, make("h2", { text: "Сліпі зони" }), button("оновити", () => void this.show(), { className: "refresh" }));
    this.container.replaceChildren(head, reachBlock, orphans, holes, unflowed, dataLogic);
  }
}
