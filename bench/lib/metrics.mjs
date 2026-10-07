// Business-flow metrics over a `.keylang/index.json` snapshot (spec
// business-flows §6): the share of resolved calls, holes by kind and by
// normalised reason, entries by kind (when the snapshot has them), the steps
// of `draft flow --mode algo` drafts and which golden IDs they contain. One
// formatter renders them as deterministic Markdown; anything that changes
// between two runs on the same sources (time, memory, versions) goes into a
// separate «Цього запуску» block so the rest of the report is diffable.
//
// Shared by `bench/magento/run.mjs` and `bench/run.ts` (TS/JS, Python, Rust
// repositories); `tests/bench-magento.test.ts` checks the formatter on a tiny
// fixture without network.

/** `call through \`super\` of \`TabWrapper\`` → `call through \`X\` of \`X\``, so one reason has one row. */
export function normaliseReason(reason) {
  return reason.replace(/`[^`]*`/g, "`X`");
}

/** Step IDs of a `draft flow --print` text: the trigger first, then every `step`, in document order. */
export function draftSteps(text) {
  const steps = [];
  for (const line of text.split("\n")) {
    const m = /^\s*- (?:trigger|step) (\S+)/.exec(line);
    if (m) steps.push(m[1]);
  }
  return steps;
}

const HOLE_KINDS = new Set(["dynamic-call", "unresolved-call", "unresolved-import", "unsupported"]);

/** Share as a percentage with one decimal, `0.0` for an empty denominator. */
export function percent(part, total) {
  return total === 0 ? "0.0" : ((part / total) * 100).toFixed(1);
}

/**
 * @param snapshot parsed `.keylang/index.json` (`nodes`, `edges`, `coverage`, `stats`, optional `entries`)
 * @param options.drafts `{ trigger, text }` of each `draft flow --mode algo --print`
 * @param options.expect golden list: `{ flow, ids, events }` (see `bench/magento/expect.json`)
 */
export function collectMetrics(snapshot, options = {}) {
  const stats = snapshot.stats ?? {};
  const resolved = stats.callsResolved ?? 0;
  const unresolved = stats.callsUnresolved ?? 0;
  const dynamic = stats.callsDynamic ?? 0;
  const external = stats.callsExternal ?? 0;
  const total = resolved + unresolved + dynamic + external;

  const byKind = new Map();
  const byReason = new Map();
  for (const c of snapshot.coverage ?? []) {
    byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);
    if (!HOLE_KINDS.has(c.kind)) continue;
    const key = `${c.kind}: ${normaliseReason(c.reason ?? "")}`;
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  const sortCounts = (map) => [...map].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const nodes = snapshot.nodes ?? {};
  const entries = snapshot.entries === undefined ? null : countEntries(snapshot.entries);
  const eventIds = Object.keys(nodes).filter((id) => id.startsWith("event.") || nodes[id].kind === "event").sort();

  const drafts = (options.drafts ?? []).map((d) => ({ trigger: d.trigger, steps: draftSteps(d.text) }));
  const expect = options.expect ?? null;
  let golden = null;
  if (expect) {
    const flow = drafts.find((d) => d.trigger === expect.flow) ?? null;
    const ids = (expect.ids ?? []).map((id) => ({
      id,
      inMap: nodes[id] !== undefined,
      inFlow: flow !== null && flow.steps.includes(id),
      inDrafts: drafts.filter((d) => d.steps.includes(id)).map((d) => d.trigger),
    }));
    const events = (expect.events ?? []).map((name) => {
      const id = eventIds.find((e) => e === `event.${name}` || e.endsWith(`.${name}`)) ?? null;
      return { name, id, inFlow: id !== null && flow !== null && flow.steps.includes(id) };
    });
    golden = { flow: expect.flow, ids, events, found: ids.filter((g) => g.inFlow).length, total: ids.length };
  }

  return {
    sizes: { files: stats.files ?? 0, modules: stats.modules ?? 0, fns: stats.fns ?? 0, types: stats.types ?? 0, deps: stats.deps ?? 0, importsUnresolved: stats.importsUnresolved ?? 0 },
    calls: { resolved, unresolved, dynamic, external, total, resolvedShare: percent(resolved, total) },
    holes: { byKind: sortCounts(byKind), topReasons: sortCounts(byReason).slice(0, 10), total: [...byReason.values()].reduce((a, b) => a + b, 0) },
    entries,
    events: eventIds,
    drafts,
    golden,
  };
}

function countEntries(entries) {
  const list = Array.isArray(entries) ? entries : Object.values(entries);
  const kinds = new Map();
  for (const e of list) kinds.set(e.kind ?? "unknown", (kinds.get(e.kind ?? "unknown") ?? 0) + 1);
  return [...kinds].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

const yes = (b) => (b ? "так" : "—");
const code = (s) => `\`${s}\``;

/**
 * Deterministic Markdown. `run` (optional) is rendered last, under
 * «Цього запуску», as `label → value` rows: times, memory, versions, dates.
 * @param metrics result of {@link collectMetrics}
 * @param options.title heading; options.intro lines before the tables; options.run `[label, value][]`
 */
export function formatReport(metrics, options = {}) {
  const out = [];
  out.push(`# ${options.title ?? "Метрики business-flows"}`, "");
  for (const line of options.intro ?? []) out.push(line);
  if (options.intro?.length) out.push("");

  const { sizes, calls, holes } = metrics;
  out.push("## Розмір", "");
  out.push("| Файли | Модулі | fn | Типи | Залежності | Нерозв'язані імпорти |", "|---:|---:|---:|---:|---:|---:|");
  out.push(`| ${sizes.files} | ${sizes.modules} | ${sizes.fns} | ${sizes.types} | ${sizes.deps} | ${sizes.importsUnresolved} |`, "");

  out.push("## Виклики", "");
  out.push(`Розв'язано **${calls.resolvedShare} %** (${calls.resolved} з ${calls.total}; ціль spec §6 — ≥ 60 %).`, "");
  out.push("| resolved | external | dynamic | unresolved |", "|---:|---:|---:|---:|");
  out.push(`| ${calls.resolved} | ${calls.external} | ${calls.dynamic} | ${calls.unresolved} |`, "");

  out.push("## Дірки за видами", "");
  out.push("| Вид | Кількість |", "|---|---:|");
  for (const [kind, n] of holes.byKind) out.push(`| ${code(kind)} | ${n} |`);
  out.push("");
  out.push(`## Дірки за причинами (top-${holes.topReasons.length} з ${holes.total})`, "");
  out.push("Імена в зворотних лапках зведено до `X`.", "");
  out.push("| # | Причина | Кількість |", "|---:|---|---:|");
  holes.topReasons.forEach(([reason, n], i) => out.push(`| ${i + 1} | ${reason.replace(/\|/g, "\\|")} | ${n} |`));
  out.push("");

  out.push("## Точки входу за видами", "");
  if (metrics.entries === null) out.push("n/a — у знімку немає `entries` (тікет 09).", "");
  else if (metrics.entries.length === 0) out.push("`entries` порожній.", "");
  else {
    out.push("| Вид | Кількість |", "|---|---:|");
    for (const [kind, n] of metrics.entries) out.push(`| ${code(kind)} | ${n} |`);
    out.push("");
  }

  out.push("## Події", "");
  out.push(metrics.events.length === 0 ? "n/a — у знімку немає вузлів `event.*` (тікет 08)." : `${metrics.events.length} вузлів: ${metrics.events.map(code).join(", ")}.`, "");

  out.push("## Чернетки `draft flow --mode algo`", "");
  if (metrics.drafts.length === 0) out.push("немає.", "");
  else {
    out.push("| Тригер | Кроків (разом із тригером) |", "|---|---:|");
    for (const d of metrics.drafts) out.push(`| ${code(d.trigger)} | ${d.steps.length} |`);
    out.push("");
  }

  if (metrics.golden) {
    const g = metrics.golden;
    out.push(`## Золотий список для ${code(g.flow)}`, "");
    out.push(`found **${g.found}/${g.total}** у чернетці; бракує: ${g.ids.filter((x) => !x.inFlow).map((x) => code(x.id)).join(", ") || "нічого"}.`, "");
    out.push("| ID | У карті | У цій чернетці | В інших чернетках |", "|---|---|---|---|");
    for (const x of g.ids) {
      const others = x.inDrafts.filter((t) => t !== g.flow).map(code).join(", ") || "—";
      out.push(`| ${code(x.id)} | ${yes(x.inMap)} | ${yes(x.inFlow)} | ${others} |`);
    }
    out.push("");
    if (g.events.length > 0) {
      out.push("| Подія | ID у знімку | У чернетці |", "|---|---|---|");
      for (const e of g.events) out.push(`| ${code(e.name)} | ${e.id === null ? "n/a (тікет 08)" : code(e.id)} | ${yes(e.inFlow)} |`);
      out.push("");
    }
  }

  if (options.run && options.run.length > 0) {
    out.push("## Цього запуску", "");
    out.push("Змінюється між запусками; решта звіту — ні.", "");
    out.push("| Що | Значення |", "|---|---|");
    for (const [label, value] of options.run) out.push(`| ${label} | ${value} |`);
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** One line for a bench table: `resolved 17.7 % (4892/27703) | holes 22438 | entries n/a | drafts 1/65`. */
export function summaryLine(metrics) {
  const parts = [`resolved ${metrics.calls.resolvedShare} % (${metrics.calls.resolved}/${metrics.calls.total})`, `holes ${metrics.holes.total}`];
  parts.push(metrics.entries === null ? "entries n/a" : `entries ${metrics.entries.reduce((a, [, n]) => a + n, 0)}`);
  if (metrics.drafts.length > 0) parts.push(`drafts ${metrics.drafts.map((d) => d.steps.length).join("/")}`);
  if (metrics.golden) parts.push(`golden ${metrics.golden.found}/${metrics.golden.total}`);
  return parts.join(" | ");
}
