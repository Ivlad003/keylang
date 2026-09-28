// Executable prototype of ADR 0003: what the generated `wire()` does, written
// by hand. Run: node examples/wiring-lifecycle/demo.ts
// Each scenario prints the events; the ADR quotes this output.

import { plan } from "./plan.ts";

const log: string[] = [];

interface Disposable {
  dispose?(): void | Promise<void>;
}

// Factories: plain functions of named dependencies; async ones initialize before returning.
const createDb = async (): Promise<{ query(q: string): string } & Disposable> => {
  log.push("init db");
  await Promise.resolve();
  return { query: (q) => `rows(${q})`, dispose: () => void log.push("dispose db") };
};
const createStore = ({ db }: { db: { query(q: string): string } }): { save(): string } & Disposable => {
  log.push("init store");
  return { save: () => db.query("insert"), dispose: () => void log.push("dispose store") };
};
const createPurchase = ({ store }: { store: { save(): string } }): { buy(): string } => {
  log.push("init purchase");
  return { buy: () => store.save() };
};
const failingPayments = async (): Promise<never> => {
  log.push("init payments (fails)");
  throw new Error("payments: no API key");
};

async function disposeAll(disposers: (() => void | Promise<void>)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const dispose of disposers.reverse()) {
    try {
      await dispose();
    } catch (e) {
      errors.push(e);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "wire: dispose failed");
}

/** The shape `keylang wire` generates: dependencies first, awaited one by one, disposers kept in init order. */
async function wire(options: { failPayments?: boolean } = {}) {
  const disposers: (() => void | Promise<void>)[] = [];
  const track = <T extends Disposable>(value: T): T => {
    if (typeof value.dispose === "function") disposers.push(() => value.dispose!());
    return value;
  };
  try {
    const db = track(await createDb());
    const store = track(await createStore({ db }));
    if (options.failPayments) track(await failingPayments());
    const purchase = track(await createPurchase({ store }));
    return { purchase, dispose: () => disposeAll(disposers) };
  } catch (error) {
    // A failed init leaves nothing half-open: what was built is disposed, newest first.
    await disposeAll(disposers);
    throw error;
  }
}

async function scenario(name: string, run: () => Promise<void>): Promise<void> {
  log.length = 0;
  try {
    await run();
  } catch (e) {
    log.push(`error: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`${name}: ${log.join(" → ")}`);
}

const graph = [
  { id: "purchase", deps: { store: "store" } },
  { id: "store", deps: { db: "db" } },
  { id: "db", deps: {} },
];
console.log(`order: ${JSON.stringify(plan(graph))}`);
console.log(`cycle: ${JSON.stringify(plan([{ id: "a", deps: { b: "b" } }, { id: "b", deps: { a: "a" } }]))}`);

await scenario("lifecycle", async () => {
  const app = await wire();
  log.push(app.purchase.buy());
  await app.dispose();
});
await scenario("init failure", async () => {
  await wire({ failPayments: true });
});
