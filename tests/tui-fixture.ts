// Shared by the TUI and web tests: the checkout repository of design §3.4
// with a configured but absent trace, the bytes a terminal sends, and a home
// directory of the test's own.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stringWidth } from "../src/tui/width.ts";

// A session reads the clip's place from `~/.config/keylang/tui.json` and a
// drag writes it (ADR 0021): no test reads or writes the developer's own. The
// process's HOME — for a session made without one, a `keylang web` it
// spawns, the CLI — is a temporary directory, removed when the process exits.
const HOMES = mkdtempSync(join(tmpdir(), "keylang-home-"));
process.on("exit", () => rmSync(HOMES, { recursive: true, force: true }));
process.env.HOME = join(HOMES, "process");
mkdirSync(process.env.HOME);
let homes = 0;

/** A home of a session's own, made when something is written there: no other session reads its tui.json. */
export function tempHome(): string {
  return join(HOMES, `session-${++homes}`);
}

export const CHECKOUT_FILES: Record<string, string> = {
  "src/domain/order.ts": "export function create(): void {}\n",
  "src/infrastructure/store.ts": "export function save(): void {}\n",
  "src/application/purchase.ts": [
    'import { create } from "../domain/order.ts";',
    'import { save } from "../infrastructure/store.ts";',
    "export function buy(): void {",
    "  create();",
    "  save();",
    "}",
    "",
  ].join("\n"),
  "src/presentation/terminal.ts": 'import { buy } from "../application/purchase.ts";\nexport function checkout(): void {\n  buy();\n}\n',
};

export const CHECKOUT_FLOW = [
  "# flow checkout",
  "",
  "Checkout from the terminal.",
  "",
  "- trigger presentation.terminal.checkout",
  "- step application.purchase.buy",
  "  - step domain.order.create",
  "  - step infrastructure.store.save",
  "",
].join("\n");

/** A temp repository with the checkout code, its flow, and a configured (absent) trace. */
export function checkoutRepo(t: { after: (f: () => void) => void }, specs: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-tui-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const layers = { domain: ["src/domain/**"], application: ["src/application/**"], infrastructure: ["src/infrastructure/**"], presentation: ["src/presentation/**"] };
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers, check: { trace: ".keylang/trace/*.jsonl" } }, null, 2)}\n`);
  const files = { ...CHECKOUT_FILES, "keylang/flows/checkout.md": CHECKOUT_FLOW, "keylang/rules.md": "# rules\n\n- layers domain < infrastructure < application < presentation\n", ...specs };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

export const KEY = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  end: "\x1b[F",
  enter: "\r",
  altEnter: "\x1b\r",
  ctrlO: "\x0f",
  ctrlS: "\x13",
  ctrlG: "\x07",
  ctrlSpace: "\x00",
  ctrlP: "\x10",
  f5: "\x1b[15~",
  f6: "\x1b[17~",
  f7: "\x1b[18~",
  tab: "\t",
  shiftDown: "\x1b[1;2B",
};

export function mouseMove(x: number, y: number): string {
  return `\x1b[<35;${x + 1};${y + 1}M`;
}

export function click(x: number, y: number): string {
  return `\x1b[<0;${x + 1};${y + 1}M\x1b[<0;${x + 1};${y + 1}m`;
}

/** The left button pressed at `from`, moved with it held (bit 32) to `to`, and released there: SGR, cells from 0. */
export function drag(from: { x: number; y: number }, to: { x: number; y: number }): string {
  return `\x1b[<0;${from.x + 1};${from.y + 1}M\x1b[<32;${to.x + 1};${to.y + 1}M\x1b[<0;${to.x + 1};${to.y + 1}m`;
}

/** Cell position of the first occurrence of `text` on screen (ASCII rows). */
export function locate(lines: readonly string[], text: string): { x: number; y: number } {
  for (let y = 0; y < lines.length; y++) {
    const at = lines[y]!.indexOf(text);
    if (at !== -1) return { x: stringWidth(lines[y]!.slice(0, at)), y };
  }
  throw new Error(`not on screen: ${text}\n${lines.join("\n")}`);
}

