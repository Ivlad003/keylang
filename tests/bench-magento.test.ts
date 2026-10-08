// The report formatter of the Magento bench (business-flows ticket 03) on a
// tiny in-repo fixture: no network, no clone. Checks the Markdown shape, the
// golden-list verdicts and that two renderings of the same snapshot are
// identical whatever the order of the coverage records.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { collectMetrics, draftSteps, formatReport, normaliseReason, summaryLine } from "../bench/lib/metrics.mjs";
import { benchConfig, parseArgs, reportHeader, WIDE_SPARSE_PATTERNS } from "../bench/magento/run.mjs";

const fixture = join(import.meta.dirname, "fixtures", "bench-magento");
const expect = JSON.parse(readFileSync(join(import.meta.dirname, "..", "bench", "magento", "expect.json"), "utf8"));
const loadSnapshot = (): { coverage: unknown[] } & Record<string, unknown> => JSON.parse(readFileSync(join(fixture, "index.json"), "utf8"));

const placeOrder = `# flow placeOrder

- trigger quote.Model.QuoteManagement.QuoteManagement.placeOrder <!-- keylang:algo unresolved: this.cartMutex.execute (app/code/Magento/Quote/Model/QuoteManagement.php:402) -->
`;
const submitQuote = `# flow submitQuote

- trigger quote.Model.QuoteManagement.QuoteManagement.submitQuote
  - step quote.Model.SubmitQuoteValidator.SubmitQuoteValidator.validateQuote <!-- keylang:algo unresolved: x (a.php:1) -->
`;
const drafts = [
  { trigger: "quote.Model.QuoteManagement.QuoteManagement.placeOrder", text: placeOrder },
  { trigger: "quote.Model.QuoteManagement.QuoteManagement.submitQuote", text: submitQuote },
];

test("bench-magento: reasons and draft steps normalise", () => {
  assert.equal(normaliseReason("call through `super` of `TabWrapper`"), "call through `X` of `X`");
  assert.equal(normaliseReason("an include of a path computed at run time"), "an include of a path computed at run time");
  assert.deepEqual(draftSteps(submitQuote), ["quote.Model.QuoteManagement.QuoteManagement.submitQuote", "quote.Model.SubmitQuoteValidator.SubmitQuoteValidator.validateQuote"]);
  assert.deepEqual(draftSteps("# flow x\n\n- trigger a.b\n"), ["a.b"]);
});

test("bench-magento: metrics of the fixture snapshot", () => {
  const m = collectMetrics(loadSnapshot(), { drafts, expect });
  assert.deepEqual(m.calls, { resolved: 2, unresolved: 1, dynamic: 3, external: 1, total: 7, resolvedShare: "28.6" });
  assert.deepEqual(m.holes.byKind, [["dynamic-call", 3], ["outside-file", 1], ["unresolved-call", 1], ["unresolved-import", 1]]);
  // Holes only (`outside-file` is not one); the two `dispatch` records share a row.
  assert.deepEqual(m.holes.topReasons, [
    ["dynamic-call: call through an interface `X`", 2],
    ["dynamic-call: call through `X` of `X`", 1],
    ["unresolved-call: unresolved call `X`", 1],
    ["unresolved-import: unresolved import `X`", 1],
  ]);
  assert.equal(m.holes.total, 5);
  assert.equal(m.entries, null);
  assert.deepEqual(m.events, []);
  assert.deepEqual(m.drafts.map((d) => d.steps.length), [1, 2]);
  assert.ok(m.golden);
  assert.equal(m.golden.found, 0);
  assert.equal(m.golden.total, 6);
  const validate = m.golden.ids.find((g) => g.id.endsWith("validateQuote"));
  assert.deepEqual(validate, { id: "quote.Model.SubmitQuoteValidator.SubmitQuoteValidator.validateQuote", inMap: true, inFlow: false, inDrafts: ["quote.Model.QuoteManagement.QuoteManagement.submitQuote"] });
  assert.equal(m.golden.ids.find((g) => g.id.endsWith("validateOrder"))?.inMap, false);
  assert.deepEqual(m.golden.events, [
    { name: "events.checkout_submit_before", id: null, inFlow: false },
    { name: "events.checkout_submit_all_after", id: null, inFlow: false },
  ]);
  assert.equal(summaryLine(m), "resolved 28.6 % (2/7) | holes 5 | entries n/a | drafts 1/2 | golden 0/6");
});

test("bench-magento: golden IDs found when the flow lists them; entries and events counted when present", () => {
  const snapshot = loadSnapshot();
  snapshot.entries = [{ kind: "webapi", id: "e1" }, { kind: "cron", id: "e2" }, { kind: "webapi", id: "e3" }];
  snapshot.nodes = { ...(snapshot.nodes as object), "events.checkout_submit_before": { kind: "event", layer: "events" } };
  const text = `# flow placeOrder\n\n- trigger quote.Model.QuoteManagement.QuoteManagement.placeOrder\n  - step quote.Model.QuoteManagement.QuoteManagement.placeOrderRun\n    - step quote.Model.QuoteManagement.QuoteManagement.submitQuote\n      - step events.checkout_submit_before\n`;
  const m = collectMetrics(snapshot, { drafts: [{ trigger: expect.flow, text }], expect });
  assert.deepEqual(m.entries, [["cron", 1], ["webapi", 2]]);
  assert.deepEqual(m.events, ["events.checkout_submit_before"]);
  assert.equal(m.golden?.found, 2);
  assert.deepEqual(m.golden?.events[0], { name: "events.checkout_submit_before", id: "events.checkout_submit_before", inFlow: true });
  const md = formatReport(m);
  assert.match(md, /\| `webapi` \| 2 \|/);
  assert.match(md, /found \*\*2\/6\*\* у чернетці; бракує: `quote\.Model\.SubmitQuoteValidator/);
  assert.match(md, /\| `events\.checkout_submit_before` \| `events\.checkout_submit_before` \| так \|/);
});

test("bench-magento: the Markdown report has every section and the run block last", () => {
  const m = collectMetrics(loadSnapshot(), { drafts, expect });
  const md = formatReport(m, { title: "Бенч Magento: базова лінія business-flows", intro: ["тег `2.4.9`"], run: [["Дата", "2026-10-07"], ["`map`", "5.3 с, maxRSS 610 МБ"]] });
  const headings = md.split("\n").filter((l) => l.startsWith("#"));
  assert.deepEqual(headings, [
    "# Бенч Magento: базова лінія business-flows",
    "## Розмір",
    "## Виклики",
    "## Дірки за видами",
    "## Дірки за причинами (top-4 з 5)",
    "## Точки входу за видами",
    "## Події",
    "## Чернетки `draft flow --mode algo`",
    "## Золотий список для `quote.Model.QuoteManagement.QuoteManagement.placeOrder`",
    "## Цього запуску",
  ]);
  assert.match(md, /Розв'язано \*\*28\.6 %\*\* \(2 з 7; ціль spec §6 — ≥ 60 %\)\./);
  assert.match(md, /\| 1 \| dynamic-call: call through an interface `X` \| 2 \|/);
  assert.match(md, /n\/a — у знімку немає `entries` \(тікет 09\)\./);
  assert.match(md, /n\/a — у знімку немає вузлів виду `event` \(`events\.\*`, тікет 08\)\./);
  assert.match(md, /\| `quote\.Model\.QuoteManagement\.QuoteManagement\.submitQuote` \| 2 \|/);
  assert.match(md, /\| `events\.checkout_submit_before` \| n\/a \(тікет 08\) \| — \|/);
  assert.match(md, /\| `map` \| 5\.3 с, maxRSS 610 МБ \|/);
  assert.ok(md.endsWith("|\n"), "ends with one newline");
  // Everything before the run block is the same whether or not a run block is given.
  const stable = md.slice(0, md.indexOf("## Цього запуску"));
  const without = formatReport(m, { title: "Бенч Magento: базова лінія business-flows", intro: ["тег `2.4.9`"] });
  assert.equal(without, stable.trimEnd() + "\n");
});

test("bench-magento: the report is deterministic across coverage order and repeated renders", () => {
  const a = loadSnapshot();
  const b = loadSnapshot();
  b.coverage = [...b.coverage].reverse();
  const render = (s: unknown): string => formatReport(collectMetrics(s, { drafts, expect }), { title: "t" });
  assert.equal(render(a), render(b));
  assert.equal(render(a), render(a));
});

test("bench-magento: `--wide` writes `results-wide.md`, keeps the five modules as layers and puts every other module and the Framework outside; the narrow run is the default", () => {
  const narrow = parseArgs([]);
  assert.equal(narrow.wide, false);
  assert.match(narrow.out, /bench\/magento\/results\.md$/);
  const wide = parseArgs(["--wide", "--repo", "/tmp/m2"]);
  assert.equal(wide.wide, true);
  assert.equal(wide.repo, "/tmp/m2");
  assert.match(wide.out, /bench\/magento\/results-wide\.md$/);
  assert.throws(() => parseArgs(["--deep"]), /unknown argument: --deep/);

  assert.deepEqual(benchConfig().outside, ["lib/internal/Magento/Framework/**"]);
  const config = benchConfig(["Store", "Checkout", "Backend", "Quote"]);
  assert.deepEqual(Object.keys(config.layers), ["checkout", "quote", "sales", "salesrule", "payment"]);
  // `outside` wins over a layer, so the five modules are never in it.
  assert.deepEqual(config.outside, ["app/code/Magento/Backend/**", "app/code/Magento/Store/**", "lib/internal/Magento/Framework/**"]);
  assert.deepEqual(config.exclude, ["**/Test/**"]);
  // Tests of the modules outside are not checked out; those of the five modules are, as in the narrow bench.
  assert.ok(WIDE_SPARSE_PATTERNS.includes("!/app/code/Magento/*/Test/"));
  assert.ok(WIDE_SPARSE_PATTERNS.includes("/app/code/Magento/Quote/Test/"));
  assert.ok(WIDE_SPARSE_PATTERNS.includes("/app/etc/di.xml"));

  const header = (isWide: boolean): { title: string; intro: string[] } =>
    reportHeader({ wide: isWide, sha: "755e34dd", outsideModules: 217, verdicts: { fail: 1, unverified: 0, ok: 2, warning: 0 }, coverage: 9, warnings: 3, drafts: [{ trigger: expect.flow, exit: 0, steps: 83 }] });
  const w = header(true);
  assert.equal(w.title, "Бенч Magento (широкий): business-flows");
  assert.match(w.intro[0] ?? "", /sparse-checkout `--wide`: модулі `Checkout`, `Quote`, `Sales`, `SalesRule`, `Payment` як шари; решта 217 модулів/);
  assert.match(w.intro[2] ?? "", /`node bench\/magento\/run\.mjs --wide \[--repo <клон>\]`.*\[results\.md\]\(results\.md\)/);
  const n = header(false);
  assert.equal(n.title, "Бенч Magento: базова лінія business-flows");
  assert.match(n.intro[0] ?? "", /`lib\/internal\/Magento\/Framework\/\{App,Event,Model,Api\}` як `outside`/);
  assert.doesNotMatch(n.intro[2] ?? "", /--wide/);
  // The same deterministic report as the narrow one, under the wide title and intro.
  const m = collectMetrics(loadSnapshot(), { drafts, expect });
  const md = formatReport(m, { ...w, run: [["Дата", "2026-10-08"]] });
  assert.ok(md.startsWith("# Бенч Magento (широкий): business-flows\n\n[magento/magento2]"));
  assert.equal(md, formatReport(m, { ...header(true), run: [["Дата", "2026-10-08"]] }));
  assert.match(md, /`check --format json`: 1 fail, 0 unverified, 2 ok, 0 warning; записів coverage 9\. `map`: 3 попереджень\./);
  assert.match(md, /кроків 83 \(разом із тригером\)/);
});
