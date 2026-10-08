// The entry explorer and the diagrams over real event nodes (ADR 0022 п. 6,
// business-flows/08, 20, 22): `eventsOf` lists what the Magento adapter
// found in `tests/fixtures/magento-shop` — who publishes each event and who
// subscribes — `callsOf` opens an event as a node between its dispatchers
// and its observers, and the event view of `diagramOf` draws them.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyze, type Analysis } from "../src/analyze.ts";
import { diagramOf } from "../src/diagram.ts";
import { callsOf, eventsOf } from "../src/explorer.ts";
import { root } from "./cli-helpers.ts";

async function shop(t: { after: (f: () => void) => void }): Promise<Analysis> {
  const dir = mkdtempSync(join(tmpdir(), "keylang-explorer-events-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/magento-shop"), dir, { recursive: true });
  return analyze({ root: dir });
}

test("explorer: eventsOf lists the events with their publishers and subscribers; callsOf opens an event between them", async (t) => {
  const analysis = await shop(t);
  const listed = eventsOf(analysis.snapshot);
  assert.equal(listed.reason, undefined);
  assert.deepEqual(listed.events, [
    { id: "events.checkout_submit_all_after", file: "app/code/Shop/Checkout/Model/QuoteManagement.php", line: 42, publishers: 1, subscribers: 1 },
    { id: "events.checkout_submit_before", file: "app/code/Shop/Checkout/Model/QuoteManagement.php", line: 36, publishers: 1, subscribers: 2 },
    { id: "events.sales-order-place_after", file: "app/code/Shop/Promo/etc/adminhtml/events.xml", line: 7, publishers: 0, subscribers: 0 },
  ]);
  const event = callsOf(analysis.snapshot!, "events.checkout_submit_all_after");
  assert.equal(event.node?.kind, "event");
  assert.deepEqual(event.callees.map((c) => [c.id, c.via, c.site, c.entries]), [["checkout.Observer.NotifyCustomer.NotifyCustomer.execute", "observer", "app/code/Shop/Checkout/etc/events.xml:4:9", [{ kind: "observer", label: "checkout_submit_all_after (notify_customer)" }]]]);
  assert.deepEqual(event.callers.map((c) => [c.id, c.via, c.at.line]), [["checkout.Model.QuoteManagement.QuoteManagement.submit", "dispatch", 42]]);
  // The dispatcher shows the event among its callees, and the dispatch of a computed name among its holes.
  const submit = callsOf(analysis.snapshot!, "checkout.Model.QuoteManagement.QuoteManagement.submit");
  assert.deepEqual(submit.callees.filter((c) => c.kind === "event").map((c) => c.id), ["events.checkout_submit_before", "events.checkout_submit_all_after"]);
  assert.ok(submit.holes.some((h) => h.kind === "dynamic-event" && h.at.line === 43), JSON.stringify(submit.holes));
  // Up from an observer, through the event, to the entry points above the dispatcher.
  const observer = callsOf(analysis.snapshot!, "checkout.Observer.NotifyCustomer.NotifyCustomer.execute");
  assert.deepEqual(observer.callers.map((c) => [c.id, c.via]), [["events.checkout_submit_all_after", "observer"]]);
  assert.deepEqual(observer.reachedFrom.map((r) => [r.kind, r.steps]), [["observer", 0]]);
});

test("diagram: the event view draws the dispatchers, the event and its observers in their lanes", async (t) => {
  const analysis = await shop(t);
  const d = diagramOf({ snapshot: analysis.snapshot, spec: analysis.spec, results: [], view: { kind: "event", name: "events.checkout_submit_before" } });
  assert.equal(d.reason, undefined);
  assert.deepEqual(
    d.nodes.map((n) => [n.id, n.kind, n.group]),
    [
      ["fn:checkout.Model.QuoteManagement.QuoteManagement.submit", "fn", "checkout"],
      ["event:events.checkout_submit_before", "event", "events"],
      ["fn:checkout.Observer.FrontendGuard.FrontendGuard.guard", "fn", "checkout"],
      ["fn:promo.Observer.AuditSubmit.AuditSubmit.execute", "fn", "promo"],
    ],
  );
  assert.deepEqual(d.groups.map((g) => g.id), ["checkout", "promo", "events"]);
  // Left to right: the dispatcher, the event, the observers.
  const x = (id: string): number => d.nodes.find((n) => n.id === id)!.x;
  assert.ok(x("fn:checkout.Model.QuoteManagement.QuoteManagement.submit") < x("event:events.checkout_submit_before"));
  assert.ok(x("event:events.checkout_submit_before") < x("fn:promo.Observer.AuditSubmit.AuditSubmit.execute"));
  // By the literal too; an event nobody dispatches nor observes says so.
  assert.equal(diagramOf({ snapshot: analysis.snapshot, spec: analysis.spec, results: [], view: { kind: "event", name: "sales.order.place_after" } }).reason, "`events.sales-order-place_after` has neither a dispatch nor an observer keylang read");
});
