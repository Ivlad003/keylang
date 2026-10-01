// The end-to-end cycle of ticket 38, shared by the terminal and the web
// tests: a supported source without keylang.json → init → a check field in
// keylang.json → a new feature spec with a `planned` fn → save, check,
// feature → spec-to-code (template) → the proposals list and MERGE → a
// complete code proposal from an outside author merged → map → feature done.
// Driven by keys and the screen only, so one driver runs on any transport.

import { KEY } from "./tui-fixture.ts";

/** One module, `app.order`, with the existing `checkout`; `refund` is only planned. */
export const CYCLE_FILES: Record<string, string> = {
  "src/app/order.ts": "export function checkout(): void {}\n",
};

/** Typed into keylang.json after `{`: the tests are reported apart from readiness. */
export const CYCLE_CONFIG_LINE = '  "check": { "tests": ".keylang/reports/*.json" },\n';

/** Typed into the new feature buffer after its heading. */
export const CYCLE_FEATURE_TEXT = [
  "",
  "# flow refund",
  "",
  "Refund a paid order.",
  "",
  "- planned fn app.order.refund () → void",
  "- trigger app.order.checkout",
  "  - step app.order.refund",
  '    - test tests/refund.test.ts "refund"',
  "",
].join("\n");

/** src/app/order.ts once the template of refund is merged: the stub, and checkout still not calling it. */
export const CYCLE_TEMPLATE_CODE = 'export function checkout(): void {}\n\nexport function refund(): void {\n  throw new Error("not implemented: app.order.refund");\n}\n';

/**
 * The outside author's complete proposal for src/app/order.ts: checkout
 * calls refund. A stand-in for a harness, not a run of one; void signatures
 * and a call inside one module keep rules and contracts out of the gap.
 */
export const CYCLE_AUTHOR_CODE = 'export function checkout(): void {\n  refund();\n}\n\nexport function refund(): void {\n  throw new Error("not implemented: app.order.refund");\n}\n';

export interface CycleScreen {
  input(keys: string): void;
  text(): string;
  lines(): string[];
}

/** The points where a caller compares the repository with the CLI, or acts as the outside author. */
export type CycleStage = "init" | "config" | "unsaved" | "saved" | "check" | "gaps" | "proposed" | "template" | "gap" | "author" | "merged" | "map" | "done";

export async function waitFor(check: () => boolean, what: string, screen?: CycleScreen, timeout = 15000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}${screen ? `\n${screen.text()}` : ""}`);
    await new Promise((done) => setTimeout(done, 20));
  }
}

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

function typeInto(screen: CycleScreen, text: string): void {
  for (const ch of text) screen.input(ch);
}

function paste(screen: CycleScreen, text: string): void {
  screen.input(`\x1b[200~${text}\x1b[201~`);
}

function palette(screen: CycleScreen, words: string): void {
  screen.input(KEY.ctrlP);
  typeInto(screen, words);
  screen.input(KEY.enter);
}

/** Esc alone: the decoder waits a moment for the rest of an escape sequence. */
async function esc(screen: CycleScreen): Promise<void> {
  screen.input("\x1b");
  await pause(60);
}

/** No analysis is running or waiting for the typing to settle, and the status line has its counts. */
const analysed = (screen: CycleScreen): boolean => !/updating|analyzing|outdated/.test(screen.lines().slice(-2).join("\n")) && /✗ \d+ /.test(screen.lines().at(-1) ?? "");

/** MERGE on `path`: accept every hunk, write it, wait for the merge to end. */
async function mergeAll(screen: CycleScreen, path: string): Promise<void> {
  await waitFor(() => screen.text().includes("MERGE") && screen.text().includes(path), `MERGE on ${path}`, screen);
  for (let i = 0; i < 8; i++) screen.input("a");
  screen.input("w");
  await waitFor(() => !/\bMERGE\b/.test(screen.lines()[0] ?? "") && analysed(screen), `the merge of ${path} written`, screen);
}

/** The feature form on the current feature file (its slug prefilled), Enter; waits for the outcome. */
async function feature(screen: CycleScreen, outcome: string): Promise<void> {
  palette(screen, "feature readiness");
  await waitFor(() => screen.text().includes("feature slug:"), "the feature form", screen);
  screen.input(KEY.enter);
  await waitFor(() => screen.text().includes(`feature refund: ${outcome}`), `feature refund: ${outcome}`, screen);
}

/**
 * The cycle by keys. `at` runs at each stage with the session idle; the
 * caller compares with the CLI there, and at "author" writes the outside
 * author's proposal. Returns nothing: callers read the screen and the disk.
 */
export async function refundCycle(screen: CycleScreen, at: (stage: CycleStage) => Promise<void> | void): Promise<void> {
  // init from the start screen: the form, Enter on Initialize.
  await waitFor(() => screen.text().includes("> Init: set up keylang in this repository"), "the start screen", screen);
  screen.input(KEY.enter);
  await waitFor(() => screen.text().includes("Initialize: write keylang.json"), "the init form", screen);
  screen.input(KEY.enter);
  await waitFor(() => screen.text().includes("init: set up: map, baseline, agents · code 0") && analysed(screen), "init", screen);
  await at("init");

  // keylang.json in the same editor: the check field after `{`, saved.
  palette(screen, "config");
  await waitFor(() => (screen.lines()[0] ?? "").includes("keylang.json"), "keylang.json open", screen);
  screen.input("i");
  screen.input(KEY.down);
  paste(screen, CYCLE_CONFIG_LINE);
  screen.input(KEY.ctrlS);
  await waitFor(() => screen.text().includes("keylang.json: saved") && analysed(screen), "keylang.json saved", screen);
  await esc(screen);
  await at("config");

  // A new feature: a buffer only, until Ctrl+S.
  palette(screen, "new specification");
  typeInto(screen, "feature");
  screen.input(KEY.enter);
  typeInto(screen, "refund.md");
  screen.input(KEY.enter);
  await waitFor(() => (screen.lines()[0] ?? "").includes("keylang/features/refund.md [+ new, not on disk]"), "the new feature buffer", screen);
  paste(screen, CYCLE_FEATURE_TEXT);
  await waitFor(() => analysed(screen), "the analysis of the unsaved buffer", screen);
  await at("unsaved");
  screen.input(KEY.ctrlS);
  await waitFor(() => screen.text().includes("keylang/features/refund.md: saved") && analysed(screen), "the feature saved", screen);
  await esc(screen);
  await at("saved");

  // The full check of the saved specs: nothing fails, the planned step is unverified.
  palette(screen, "keylang check");
  await waitFor(() => screen.text().includes("check paths:"), "the check form", screen);
  screen.input(KEY.enter);
  await waitFor(() => /check: 0 fail, \d+ unverified, \d+ ok · code 0/.test(screen.text()), "the check", screen);
  await at("check");

  // Feature: the planned fn and its step are gaps.
  await feature(screen, "2 gap(s) · code 1");
  await at("gaps");

  // F6 → the planned gap → g: spec-to-code for its ID, the template, as proposals.
  screen.input(KEY.f6);
  await waitFor(() => screen.text().includes("Feature · refund · saved state"), "the feature report", screen);
  screen.input(KEY.tab);
  await waitFor(() => screen.text().includes("planned app.order.refund: planned `app.order.refund` is not implemented"), "the planned gap selected", screen);
  screen.input("g");
  await waitFor(() => screen.text().includes("id:      app.order.refund"), "the spec-to-code form", screen);
  screen.input(KEY.enter);
  await waitFor(() => /spec-to-code: .*\.keylang\/proposals/.test(screen.text()) || /\bMERGE\b/.test(screen.lines()[0] ?? ""), "the proposals", screen);
  await at("proposed");
  // The code first, from the proposals list (MERGE opens itself only when nothing else is open).
  if (!/\bMERGE\b/.test(screen.lines()[0] ?? "")) {
    if (screen.text().includes("Spec to code")) await esc(screen);
    palette(screen, "proposals");
    await waitFor(() => screen.text().includes("2 proposal(s)"), "the proposals list", screen);
    screen.input(KEY.enter);
  }
  await mergeAll(screen, "src/app/order.ts");
  palette(screen, "proposals");
  await waitFor(() => screen.text().includes("1 proposal(s)"), "the test's proposal", screen);
  screen.input(KEY.enter);
  await mergeAll(screen, "tests/refund.test.ts");
  await at("template");

  // Feature again: refund is implemented, but nothing calls it from checkout — still a gap.
  palette(screen, "open keylang/features/refund.md");
  await feature(screen, "1 gap(s) · code 1");
  await at("gap");

  // The outside author's complete proposal, merged hunk by hunk.
  await at("author");
  palette(screen, "proposals");
  await waitFor(() => screen.text().includes("1 proposal(s)"), "the author's proposal", screen);
  screen.input(KEY.enter);
  await mergeAll(screen, "src/app/order.ts");
  await at("merged");

  // The map, written as a separate step; F5 never writes it.
  palette(screen, "map write");
  await waitFor(() => screen.text().includes("[Continue]"), "the map targets", screen);
  screen.input(KEY.enter);
  await waitFor(() => /map write: \d+ written · code 0/.test(screen.text()) && analysed(screen), "the map write", screen);
  await at("map");

  // Done by the readiness function; the tests are reported apart.
  palette(screen, "open keylang/features/refund.md");
  await feature(screen, "done · code 0");
  await at("done");
}
