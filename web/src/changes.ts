// «Зміни» of the diagram page (.scratch/web-git): what the working tree
// changed since a base and the findings of `check --changed` over it —
// `GET /api/git` names HEAD and the base of a feature, `GET /api/changes`
// answers for a base. The base is the feature's by default (the merge-base
// with the main branch); the person may pick a branch or, where the page
// asks live (`keylang web`, app.html), type any ref. A spec opens in «Карта»,
// a module in the explorer.

import { ApiError, transport, type Api, type ChangesAnswer, type GitAnswer } from "./api.ts";
import { VERDICT_GLYPH } from "./canvas.ts";
import { button, codeLink, make } from "./dom.ts";
import type { ListItem } from "./list.ts";

export interface ChangesHost {
  root(): string | undefined;
  status(text: string): void;
  /** Opens a spec file in «Карта». */
  openDoc(path: string): void;
  explore(id: string): void;
  /** The tab's own fragment: `since` "" is the base of a feature. */
  pick(since: string): void;
}

const KIND_GROUP = { spec: "Змінені специфікації", code: "Змінений код", other: "Інші файли" } satisfies Record<ChangesAnswer["files"][number]["kind"], string>;

/** The list of the «Зміни» mode: the changed files by kind, then the deleted ones. */
export function changeItems(changes: ChangesAnswer, since: string): ListItem[] {
  const rank = (kind: string): number => ["spec", "code", "other"].indexOf(kind);

  const items: ListItem[] = [...changes.files].sort((a, b) => rank(a.kind) - rank(b.kind)).map((file) => ({
    key: `change:${file.path}`,
    label: file.path,
    hint: file.kind,
    group: KIND_GROUP[file.kind] ?? "Інші файли",
    search: [file.path, ...file.modules].join(" ").toLowerCase(),
    title: [file.path, ...file.modules].join("\n"),
    query: file.kind === "spec" ? { view: "docs", path: file.path } : file.modules[0] ? { view: "explore", id: file.modules[0] } : { view: "changes", since },
  }));

  for (const file of changes.deleted) items.push({ key: `deleted:${file.path}`, label: file.path, hint: "deleted", group: "Видалені", search: [file.path, ...file.modules].join(" ").toLowerCase(), title: [file.path, ...file.modules].join("\n"), query: { view: "changes", since } });

  return items;
}

export class Changes {
  private readonly container: HTMLElement;
  private readonly api: Api;
  private readonly host: ChangesHost;
  private git: GitAnswer | null = null;
  private shown: { since: string; answer: ChangesAnswer } | null = null;
  /** The last request: the answer for an earlier base (picked, then another) is dropped. */
  private request = 0;

  constructor(container: HTMLElement, api: Api, host: ChangesHost) {
    this.container = container;
    this.api = api;
    this.host = host;
  }

  /** The changes of the base asked last, for the list; null before the first answer. */
  current(): { since: string; answer: ChangesAnswer } | null {
    return this.shown;
  }

  async show(since: string): Promise<ChangesAnswer | null> {
    const request = ++this.request;
    this.host.status(`changes: reading git${since ? ` since ${since}` : ""}…`);

    if (this.container.childElementCount === 0) this.container.replaceChildren(make("p", { className: "empty", text: "loading…" }));

    try {
      this.git ??= await this.api.git();

      if (!this.git.available) {
        this.container.replaceChildren(make("h2", { text: "Зміни" }), make("p", { className: "empty", text: `Git недоступний: ${this.git.reason}` }));
        this.host.status("changes: no git");

        return null;
      }

      const answer = await this.api.changes(since);

      if (request !== this.request) return null;
      this.shown = { since, answer };
      this.render(this.git, answer, since);
      const counts = answer.check?.counts;
      this.host.status(`changes since ${answer.base.label} · ${answer.files.length} changed · ${answer.deleted.length} deleted${counts ? ` · ✗ ${counts.fail} · ◌ ${counts.unverified}` : ""}`);

      return answer;
    } catch (error) {
      if (request !== this.request) return null;
      const text = error instanceof ApiError && error.status === 404 && transport().kind === "static" ? `this export holds the changes since the base of a feature and since HEAD only (${error.message})` : error instanceof Error ? error.message : String(error);
      this.container.replaceChildren(make("h2", { text: "Зміни" }), this.picker(this.git, since), make("p", { className: "error", text }));
      this.host.status(text);

      return null;
    }
  }

  /** The base: the suggestions of `/api/git`, and a free ref where the page asks live. */
  private picker(git: GitAnswer | null, since: string): HTMLElement {
    const box = make("div", { className: "changes-base" });

    if (git === null || !git.available) return box;
    const select = make("select");
    select.id = "changes-base";
    select.setAttribute("aria-label", "База");
    const options = [{ ref: "", label: `база фічі: ${git.base.label}` }, ...git.bases.filter((base) => base.ref !== git.base.ref)];

    for (const option of options) {
      const node = make("option", { text: option.label });
      node.value = option.ref;
      node.selected = option.ref === since;
      select.append(node);
    }

    select.addEventListener("change", () => this.host.pick(select.value));
    box.append(make("label", { text: "від " }, select));

    if (transport().kind !== "static") {
      const input = make("input");
      input.id = "changes-ref";
      input.type = "text";
      input.placeholder = "інший ref: гілка, тег, коміт";
      input.value = options.some((option) => option.ref === since) ? "" : since;
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && input.value.trim() !== "") this.host.pick(input.value.trim());
      });
      box.append(input);
    }

    return box;
  }

  private render(git: GitAnswer & { available: true }, answer: ChangesAnswer, since: string): void {
    const head = git.head.commit === null ? "HEAD без коміту" : `${git.head.branch ?? "detached"} @ ${git.head.short}`;
    const body: Node[] = [make("h2", { text: "Зміни" }), make("p", { className: "note", text: `${head}${git.origin ? ` · ${git.origin}` : ""} · від ${answer.base.label}${answer.unborn ? " (до першого коміту: усі файли нові)" : ""}` }), this.picker(git, since)];
    const counts = answer.check?.counts;
    body.push(make("p", { className: "changes-summary", text: `${answer.files.length} змінено · ${answer.deleted.length} видалено${counts ? ` · ✗ ${counts.fail} fail · ◌ ${counts.unverified} unverified` : ""}` }));

    const files = make("ul", { className: "changes-files" });

    for (const file of answer.files) {
      const row = make("li", {}, make("span", { className: `kind kind-${file.kind}`, text: file.kind }), " ");

      if (file.kind === "spec") row.append(button(file.path, () => this.host.openDoc(file.path), { className: "link", title: "відкрити в «Карті»" }));
      else row.append(codeLink(this.host.root(), file.path, null));

      for (const id of file.modules) row.append(" ", button(id, () => this.host.explore(id), { className: "link", title: `open ${id} in the explorer` }));
      files.append(row);
    }

    for (const file of answer.deleted) files.append(make("li", { className: "deleted" }, make("span", { className: "kind kind-deleted", text: "deleted" }), ` ${file.path}`, ...file.modules.map((id) => make("code", { text: ` ${id}` }))));
    body.push(make("h3", { text: "Файли" }), answer.files.length + answer.deleted.length > 0 ? files : make("p", { className: "empty", text: "нічого не змінено" }));

    body.push(make("h3", { text: "Знахідки, що зачіпають зміни" }));

    if (answer.check === null) body.push(make("p", { className: "empty", text: answer.checkReason ?? "перевірки немає" }));
    else {
      const findings = answer.check.results.filter((result) => result.verdict !== "ok");

      if (findings.length === 0) body.push(make("p", { className: "empty", text: "жодної: зміни нічого не ламають" }));
      const list = make("ul", { className: "results" });

      for (const result of findings) {
        list.append(make("li", { className: `v-${result.verdict}` }, make("span", { className: "glyph", text: VERDICT_GLYPH[result.verdict] ?? "·" }), make("b", { text: result.code ?? result.criterion }), ` ${result.evidence} `, codeLink(this.host.root(), result.file, result.line)));
      }

      if (findings.length > 0) body.push(list);
      const hidden = answer.check.changed?.hidden ?? 0;

      if (hidden > 0) body.push(make("p", { className: "note", text: `ще ${hidden} знахідок поза змінами не показано (повна перевірка — «Діаграми» й «Сліпі зони»)` }));
    }

    this.container.replaceChildren(...body);
  }
}
