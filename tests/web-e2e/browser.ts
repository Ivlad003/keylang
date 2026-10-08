// Shared by the browser tests of `keylang web` (`npm run test:web`): the
// Chromium to launch, a real `keylang web --port 0` in a repository, and the
// console errors, CSP violations and failed requests of a page.

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright-core";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bin = join(root, "bin/keylang.js");

/** The browser to launch: an executable, `{}` for Playwright's own, or null when there is none. */
export function browserOptions(): { executablePath?: string } | null {
  const candidates = [process.env["KEYLANG_CHROMIUM"], "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];
  for (const path of candidates) if (path && existsSync(path) && statSync(path).isFile()) return { executablePath: path };
  return process.env["PLAYWRIGHT_BROWSERS_PATH"] ? {} : null;
}

export async function startWeb(t: { after: (f: () => void | Promise<void>) => void }, cwd: string): Promise<URL> {
  const child = spawn(process.execPath, [bin, "web", "--port", "0"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((done) => child.once("exit", done));
    }
  });
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  const start = Date.now();
  while (!/keylang web: (\S+)/.test(out)) {
    if (Date.now() - start > 20000) throw new Error(`keylang web printed no URL: ${out}`);
    await new Promise((done) => setTimeout(done, 50));
  }
  return new URL(/keylang web: (\S+)/.exec(out)![1]!);
}

/** Console errors and CSP violations of a page, as they happen. */
export function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || /Content Security Policy|Refused to/.test(message.text())) problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  return problems;
}
