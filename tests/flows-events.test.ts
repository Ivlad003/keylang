// Events in flows (ADR 0023 п. 1, business-flows/16) through the real CLI:
// `emits event events.<name>` under a step is checked against the dispatches
// the step's code reaches (ok, fail as an absence, unverified for a computed
// name or a dispatch `--static shape` does not follow), and `trigger event
// <id>` is the flow of the event's subscribers. An unknown event is K204, a
// fn after `trigger event` K205; a name without `events.` stays prose. Two
// languages: a Magento-shaped PHP repository (a literal `dispatch` and an
// `events.xml` observer) and a Django one (a signal's `send()` and its
// `@receiver`); `fmt`, `flows discover`, the gutter and the diagram.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { analyze } from "../src/analyze.ts";
import { renderBpmn } from "../src/bpmn-export.ts";
import { checkResults } from "../src/check-results.ts";
import { diagramOf } from "../src/diagram.ts";
import { evidenceOf } from "../src/tui/evidence.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";
import { DJANGO } from "./fixtures-python-web.ts";

const lines = (...rows: string[]): string => `${rows.join("\n")}\n`;

/**
 * One Magento module: `OrderService::place` saves through `save`, which
 * dispatches `order_placed` by a literal; `refund` dispatches a computed
 * name; `cancel` dispatches nothing. `events.xml` subscribes `Mailer`.
 */
const MAGENTO: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["php"], layers: { sales: ["app/code/Shop/Sales/**"] } }),
  "app/code/Shop/Sales/registration.php": lines(
    "<?php",
    "\\Magento\\Framework\\Component\\ComponentRegistrar::register(",
    "    \\Magento\\Framework\\Component\\ComponentRegistrar::MODULE,",
    "    'Shop_Sales',",
    "    __DIR__",
    ");",
  ),
  "app/code/Shop/Sales/etc/events.xml": lines(
    '<?xml version="1.0"?>',
    '<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '    <event name="order_placed">',
    '        <observer name="mail_customer" instance="Shop\\Sales\\Observer\\Mailer"/>',
    "    </event>",
    "</config>",
  ),
  "app/code/Shop/Sales/Model/OrderService.php": lines(
    "<?php",
    "namespace Shop\\Sales\\Model;",
    "",
    "use Magento\\Framework\\Event\\ManagerInterface;",
    "",
    "class OrderService",
    "{",
    "    public function __construct(private ManagerInterface $events)",
    "    {",
    "    }",
    "",
    "    public function place(array $order): array",
    "    {",
    "        return $this->save($order);",
    "    }",
    "",
    "    public function save(array $order): array",
    "    {",
    "        $this->events->dispatch('order_placed', ['order' => $order]);",
    "        return $order;",
    "    }",
    "",
    "    public function refund(array $order): array",
    "    {",
    "        $this->events->dispatch('order_' . $order['state'], ['order' => $order]);",
    "        return $order;",
    "    }",
    "",
    "    public function cancel(array $order): array",
    "    {",
    "        return $order;",
    "    }",
    "}",
  ),
  "app/code/Shop/Sales/Observer/Mailer.php": lines(
    "<?php",
    "namespace Shop\\Sales\\Observer;",
    "",
    "use Magento\\Framework\\Event\\ObserverInterface;",
    "",
    "class Mailer implements ObserverInterface",
    "{",
    "    public function execute($observer): void",
    "    {",
    "        $this->send();",
    "    }",
    "",
    "    public function send(): void",
    "    {",
    "    }",
    "}",
  ),
};

const SERVICE = "sales.Model.OrderService.OrderService";
const MAILER = "sales.Observer.Mailer.Mailer";

const MAGENTO_FLOWS = lines(
  "# flow place",
  "",
  `- trigger ${SERVICE}.place`,
  `- step ${SERVICE}.save`,
  "  - emits event events.order_placed",
  "  - emits event order.created",
  "",
  "# flow cancel",
  "",
  `- trigger ${SERVICE}.cancel`,
  "  - emits event events.order_placed",
  "",
  "# flow refund",
  "",
  `- trigger ${SERVICE}.refund`,
  "  - emits event events.order_placed",
  "",
  "# flow mail",
  "",
  "- trigger event events.order_placed",
  `- step ${MAILER}.execute`,
  `- step ${MAILER}.send`,
  `- step ${SERVICE}.cancel`,
);

interface Row {
  criterion: string;
  area: string;
  verdict: string;
  evidence: string;
  file: string;
  line: number;
}

function repo(t: { after: (fn: () => void) => void }, files: Record<string, string>, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-events-");
  writeTree(dir, { ...files, ...extra });
  const mapped = keylang(dir, ["map"]);
  assert.equal(mapped.status, 0, mapped.stderr);
  return dir;
}

function rows(dir: string, args: string[] = []): Row[] {
  const o = keylang(dir, ["check", "--format", "json", ...args]);
  assert.ok(o.stdout.startsWith("{"), o.stdout + o.stderr);
  return (JSON.parse(o.stdout) as { results: Row[] }).results;
}

const at = (all: Row[], file: string, line: number, criterion: string): Row[] => all.filter((r) => r.file === file && r.line === line && r.criterion === criterion);

/** The one row of a criterion on a line, its evidence without the `<verdict> <area>: ` every message starts with. */
function one(all: Row[], file: string, line: number, criterion: string): Row {
  const found = at(all, file, line, criterion);
  assert.equal(found.length, 1, `${file}:${line} ${criterion}: ${JSON.stringify(all.filter((r) => r.file === file), null, 1)}`);
  const row = found[0]!;
  const lead = `${row.verdict} ${row.area}: `;
  return { ...row, evidence: row.evidence.startsWith(lead) ? row.evidence.slice(lead.length) : row.evidence };
}

// ---------- Magento: emits ----------

test("magento: `emits event` is ok on a literal dispatch in the step's code, fail when the code read in full has none, unverified for a computed name", (t) => {
  const dir = repo(t, MAGENTO, { "keylang/flows/orders.md": MAGENTO_FLOWS });
  const all = rows(dir);
  const file = "keylang/flows/orders.md";
  const ok = one(all, file, 5, "static");
  assert.equal(ok.verdict, "ok", ok.evidence);
  assert.equal(ok.area, "emits events.order_placed");
  assert.match(ok.evidence, new RegExp(`called from ${SERVICE.replace(/\./g, "\\.")}\\.save through the dispatch \`this\\.events\\.dispatch\` at app/code/Shop/Sales/Model/OrderService\\.php:19:9`));
  const absent = one(all, file, 11, "static");
  assert.equal(absent.verdict, "fail", absent.evidence);
  assert.match(absent.evidence, /^absence: no dispatch of `events\.order_placed` in the code sales\.Model\.OrderService\.OrderService\.cancel reaches/);
  const computed = one(all, file, 16, "static");
  assert.equal(computed.verdict, "unverified", computed.evidence);
  assert.match(computed.evidence, /dispatch of an event whose name is computed at run time: `'order_' \. \$order\['state'\]` at app\/code\/Shop\/Sales\/Model\/OrderService\.php:25 may publish it/);
  // A name without `events.` is prose, as before: no verdict on its line, no K-code.
  assert.deepEqual(all.filter((r) => r.file === file && r.line === 6), []);
});

test("magento: `--static shape` does not follow a dispatch, so `emits event` is unverified there and names the dispatch", (t) => {
  const dir = repo(t, MAGENTO, { "keylang/flows/orders.md": MAGENTO_FLOWS });
  const shaped = one(rows(dir, ["--static", "shape"]), "keylang/flows/orders.md", 5, "static");
  assert.equal(shaped.verdict, "unverified");
  assert.match(shaped.evidence, /the dispatch `this\.events\.dispatch` \(not followed in static mode shape, set by --static\)/);
});

// ---------- Magento: trigger event ----------

test("magento: `trigger event` lists the subscribers with their config lines; its steps are checked from a subscriber, which the verdict names", (t) => {
  const dir = repo(t, MAGENTO, { "keylang/flows/orders.md": MAGENTO_FLOWS });
  const all = rows(dir);
  const file = "keylang/flows/orders.md";
  assert.equal(one(all, file, 20, "ID").verdict, "ok");
  const trigger = one(all, file, 20, "static");
  assert.equal(trigger.verdict, "ok", trigger.evidence);
  assert.equal(trigger.area, "event events.order_placed");
  assert.equal(trigger.evidence, `subscribers: \`${MAILER}.execute\` (app/code/Shop/Sales/etc/events.xml:4:9)`);
  const subscriber = one(all, file, 21, "static");
  assert.equal(subscriber.verdict, "ok", subscriber.evidence);
  assert.match(subscriber.evidence, /^a subscriber of `events\.order_placed` through the observer `mail_customer` [^\n]*in `app\/code\/Shop\/Sales\/etc\/events\.xml:4`/);
  const reached = one(all, file, 22, "static");
  assert.equal(reached.verdict, "ok", reached.evidence);
  assert.equal(reached.evidence, `subscriber \`${MAILER}.execute\` (app/code/Shop/Sales/etc/events.xml:4:9): called from ${MAILER}.execute`);
  const absent = one(all, file, 23, "static");
  assert.equal(absent.verdict, "fail", absent.evidence);
  assert.match(absent.evidence, new RegExp(`^absence: no subscriber of \`events\\.order_placed\` reaches it: no call path from \`${MAILER.replace(/\./g, "\\.")}\\.execute\``));
});

test("magento: an unknown event is K204 with the nearest event; a fn after `trigger event` is K205; `parse` gives neither", (t) => {
  const broken = lines(
    "# flow typo",
    "",
    "- trigger event events.order_placd",
    "",
    "# flow fn",
    "",
    `- trigger event ${SERVICE}.place`,
    "",
    "# flow emits",
    "",
    `- trigger ${SERVICE}.place`,
    "  - emits event events.order_place",
    "  - emits [events.nowhere](../map/events.md)",
  );
  const dir = repo(t, MAGENTO, { "keylang/flows/broken.md": broken });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /^keylang\/flows\/broken\.md:3:17: K204 unknown event `events\.order_placd` \(did you mean `events\.order_placed`\?\): no code keylang read dispatches it and no config observes it$/m);
  assert.match(o.stdout, new RegExp(`^keylang/flows/broken\\.md:7:17: K205 \`trigger event\` names \`${SERVICE.replace(/\./g, "\\.")}\\.place\`, a fn, not an event`, "m"));
  assert.match(o.stdout, /^keylang\/flows\/broken\.md:12:17: K204 unknown event `events\.order_place` \(did you mean `events\.order_placed`\?\)/m);
  assert.match(o.stdout, /^keylang\/flows\/broken\.md:13:12: K204 unknown event `events\.nowhere`: no code/m);
  // Not a dangling K001 as well, and no static verdict on a line that is a K-code already.
  assert.doesNotMatch(o.stdout, /K001/);
  assert.doesNotMatch(o.stdout, /broken\.md:(3|7|12|13):\d+: static/);
  const parsed = JSON.parse(keylang(dir, ["parse", "--json", "keylang/flows/broken.md"]).stdout) as { diagnostics: { code: string }[] }[];
  assert.deepEqual(parsed[0]!.diagnostics, []);
  for (const code of ["K204", "K205"]) {
    const explained = keylang(dir, ["explain", code]);
    assert.equal(explained.status, 0, explained.stderr);
    assert.match(explained.stdout, new RegExp(`^${code}: `));
  }
});

test("emits: the prose form is unchanged — a name without `events.` gets no verdict and no K-code, with or without a snapshot", (t) => {
  const dir = repo(t, MAGENTO, { "keylang/flows/prose.md": lines("# flow prose", "", `- trigger ${SERVICE}.place`, "  - emits event order.created", "  - emits order_placed", "- emits event checkout.done") });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 0, o.stdout);
  assert.doesNotMatch(o.stdout, /prose\.md:[456]:/);
});

// ---------- Django ----------

const DJANGO_FLOWS = lines(
  "# flow signals",
  "",
  "- trigger orders.views.order_list",
  "- step orders.services.place_order",
  "  - emits event events.order_placed",
  "  - emits event events.post_save",
  "",
  "# flow receipt",
  "",
  "- trigger event events.order_placed",
  "- step notify.handlers.email_customer",
  "- step orders.totals.total",
);

/** A fn nothing calls and nothing reads as a value: a step no receiver can reach is a confirmed absence. */
const TOTALS = { "orders/totals.py": lines("def total():", "    return 1") };

test("django: a signal is an event — `send()` proves `emits event`, a signal the code never sends fails, `--static shape` leaves it unverified", (t) => {
  const dir = repo(t, DJANGO, { ...TOTALS, "keylang/flows/events.md": DJANGO_FLOWS });
  const file = "keylang/flows/events.md";
  const all = rows(dir);
  const sent = one(all, file, 5, "static");
  assert.equal(sent.verdict, "ok", sent.evidence);
  assert.equal(sent.evidence, "called from orders.services.place_order through the dispatch `order_placed.send` at orders/services.py:7:5");
  const never = one(all, file, 6, "static");
  assert.equal(never.verdict, "fail", never.evidence);
  assert.match(never.evidence, /^absence: no dispatch of `events\.post_save` in the code orders\.services\.place_order reaches/);
  const shaped = one(rows(dir, ["--static", "shape"]), file, 5, "static");
  assert.equal(shaped.verdict, "unverified");
  assert.match(shaped.evidence, /the dispatch `order_placed\.send` \(not followed in static mode shape, set by --static\)/);
});

test("django: `trigger event` on a signal lists its receivers; a step no receiver reaches fails", (t) => {
  const dir = repo(t, DJANGO, { ...TOTALS, "keylang/flows/events.md": DJANGO_FLOWS });
  const file = "keylang/flows/events.md";
  const all = rows(dir);
  const trigger = one(all, file, 10, "static");
  assert.equal(trigger.verdict, "ok", trigger.evidence);
  assert.equal(trigger.evidence, "subscribers: `notify.handlers.email_customer` (notify/handlers.py:15:1)");
  const receiver = one(all, file, 11, "static");
  assert.equal(receiver.verdict, "ok", receiver.evidence);
  assert.equal(receiver.evidence, "a subscriber of `events.order_placed` through the receiver of the signal `order_placed` in `notify/handlers.py:15`");
  const absent = one(all, file, 12, "static");
  assert.equal(absent.verdict, "fail", absent.evidence);
  assert.match(absent.evidence, /^absence: no subscriber of `events\.order_placed` reaches it: no call path from `notify\.handlers\.email_customer`/);
  // The map prints the signals in the generated group `events`.
  const events = readFileSync(join(dir, "keylang/map/events.md"), "utf8");
  assert.match(events, /- event \[order_placed\]\([^)]*services\.py#L7\) <!-- dispatched by: orders\.services\.place_order -->\n {4}- calls notify\.handlers\.email_customer/);
  assert.match(events, /- event \[post_save\]\([^)]*handlers\.py#L12\) <!-- dispatched by no code keylang read -->/);
});

// ---------- fmt ----------

test("fmt: `trigger event` and `emits event` have one canonical spelling, and a second fmt changes nothing", (t) => {
  const messy = lines("#   flow   mail", "", "-   trigger   event    events.order_placed", `-  step   ${MAILER}.execute`, "  - emits    event   events.order_placed", "  -   emits   order.created");
  const canonical = lines("# flow mail", "", "- trigger event events.order_placed", `- step ${MAILER}.execute`, "  - emits event events.order_placed", "  - emits order.created");
  const dir = repo(t, MAGENTO, { "keylang/flows/mail.md": messy });
  const path = "keylang/flows/mail.md";
  const before = rows(dir).filter((r) => r.file === path).map((r) => `${r.criterion} ${r.area} ${r.verdict}`);
  assert.equal(keylang(dir, ["fmt", "--check", path]).status, 1);
  const first = keylang(dir, ["fmt", path]);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(readFileSync(join(dir, path), "utf8"), canonical);
  assert.equal(keylang(dir, ["fmt", "--check", path]).status, 0);
  keylang(dir, ["fmt", path]);
  assert.equal(readFileSync(join(dir, path), "utf8"), canonical);
  // The verdicts do not change with the spelling.
  assert.deepEqual(rows(dir).filter((r) => r.file === path).map((r) => `${r.criterion} ${r.area} ${r.verdict}`), before);
});

// ---------- flows discover ----------

test("flows discover: an observer whose event the snapshot knows becomes `trigger event`, with the observer as its first step (Magento and Django)", (t) => {
  const magento = repo(t, MAGENTO);
  const m = keylang(magento, ["flows", "discover", "--print"]);
  assert.equal(m.status, 0, m.stderr);
  assert.match(m.stdout, new RegExp(`^- trigger event events\\.order_placed\\n {2}- step ${MAILER.replace(/\./g, "\\.")}\\.execute <!-- keylang:algo via observer app/code/Shop/Sales/etc/events\\.xml:4:9 -->\\n {4}- step ${MAILER.replace(/\./g, "\\.")}\\.send\\n`, "m"));
  // The draft is one `check` accepts: adopted, every line is ok.
  const adopted = m.stdout.split(/(?=^# flow )/m).find((part) => part.includes("- trigger event events.order_placed"))!;
  writeTree(magento, { "keylang/flows/mail.md": adopted });
  const statics = rows(magento).filter((r) => r.file === "keylang/flows/mail.md" && r.criterion === "static");
  assert.deepEqual(statics.map((r) => `${r.line} ${r.verdict}`), ["5 ok", "6 ok", "7 ok"]);
  // Once written, the observer counts as specified: discover no longer drafts it.
  const again = keylang(magento, ["flows", "discover", "--print"]);
  assert.doesNotMatch(again.stdout, /trigger event events\.order_placed/);

  const django = repo(t, DJANGO);
  const d = keylang(django, ["flows", "discover", "--print"]);
  assert.equal(d.status, 0, d.stderr);
  assert.match(d.stdout, /^- trigger event events\.order_placed\n {2}- step notify\.handlers\.email_customer <!-- keylang:algo via observer notify\/handlers\.py:15:1 -->\n/m);
  assert.match(d.stdout, /^- trigger event events\.post_save\n {2}- step notify\.handlers\.audit /m);
});

// ---------- gutter and diagram ----------

test("gutter: an `emits event` line and a `trigger event` line carry their static mark; a prose `emits` line carries none", async (t) => {
  const dir = repo(t, MAGENTO, { "keylang/flows/orders.md": MAGENTO_FLOWS });
  const analysis = await analyze({ root: dir });
  const marks = evidenceOf(analysis, "keylang/flows/orders.md");
  assert.equal(marks.get(5)?.mark, "ok");
  assert.equal(marks.get(6), undefined);
  assert.equal(marks.get(11)?.mark, "fail");
  assert.equal(marks.get(16)?.mark, "unverified");
  assert.equal(marks.get(20)?.mark, "ok");
});

test("diagram: `emits event` is an event node that points at the event; `trigger event` starts on its signal in BPMN", async (t) => {
  const dir = repo(t, MAGENTO, { "keylang/flows/orders.md": MAGENTO_FLOWS });
  const analysis = await analyze({ root: dir });
  const results = checkResults(analysis.verdicts, analysis.snapshot?.snapshotId ?? null, analysis.diagnostics);
  const place = diagramOf({ snapshot: analysis.snapshot, spec: analysis.spec, results, view: { kind: "flow", name: "place" } });
  const emitted = place.nodes.find((node) => node.id === "emits:5");
  assert.equal(emitted?.kind, "event");
  assert.equal(emitted?.ref?.id, "events.order_placed");
  assert.equal(emitted?.verdict, "ok");
  const input = { snapshot: analysis.snapshot, spec: analysis.spec, results, view: { kind: "flow" as const, name: "mail" } };
  const mail = diagramOf(input);
  assert.equal(mail.nodes.find((node) => node.id === "trigger:20")?.kind, "start");
  const xml = renderBpmn(input, "mail");
  assert.match(xml, /<bpmn:signal id="[^"]+" name="events\.order_placed" \/>/);
  assert.match(xml, /<bpmn:startEvent [^>]*name="events\.order_placed"[^>]*>\s*<bpmn:signalEventDefinition [^>]*signalRef=/);
});
