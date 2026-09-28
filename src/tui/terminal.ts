// `keylang` in a terminal: raw stdin, the alternate screen, SGR mouse, and
// `$VISUAL` / `$EDITOR` for jumps into code. The screen is restored on every
// exit path, including a crash.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { App } from "./app.ts";
import { SnapshotWorker } from "./background.ts";
import { analyze } from "../analyze.ts";
import { ENTER, LEAVE } from "./screen.ts";

/** How to open `file` at `line` with the configured editor, or null without one. */
export function editorCommand(env: NodeJS.ProcessEnv, file: string, line: number): { command: string; args: string[]; wait: boolean } | null {
  const configured = (env.VISUAL ?? env.EDITOR ?? "").trim();
  if (configured === "") return null;
  const [command, ...extra] = splitCommand(configured);
  if (!command) return null;
  const name = basename(command);
  // GUI editors take `-g file:line` and return at once; terminal editors take `+line file` and own the screen.
  if (/^(code|code-insiders|codium|cursor|windsurf)$/.test(name)) return { command: command!, args: [...extra, "-g", `${file}:${line}`], wait: false };
  if (/^(subl|zed)$/.test(name)) return { command: command!, args: [...extra, `${file}:${line}`], wait: false };
  return { command: command!, args: [...extra, `+${line}`, file], wait: true };
}

/**
 * Words of a `$EDITOR` value the way a shell splits them: quotes and
 * backslashes keep spaces (`"/opt/My Editor/bin/edit" -w`). An unquoted value
 * that names an existing file is one word, so a path with spaces works as is.
 */
export function splitCommand(value: string, exists: (path: string) => boolean = existsSync): string[] {
  if (!/["'\\]/.test(value) && exists(value)) return [value];
  const words: string[] = [];
  let word: string | null = null;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < value.length) word += value[++i]!;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      word ??= "";
    } else if (ch === "\\" && i + 1 < value.length) word = (word ?? "") + value[++i]!;
    else if (/\s/.test(ch)) {
      if (word !== null) words.push(word);
      word = null;
    } else word = (word ?? "") + ch;
  }
  if (word !== null) words.push(word);
  return words;
}

/** Exit codes after a signal follow the shell: 128 + its number. */
const SIGNAL_NUMBER: Partial<Record<NodeJS.Signals, number>> = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGTERM: 15 };

export async function runTerminal(root: string): Promise<number> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const worker = new SnapshotWorker();
  let finish: (code: number) => void = () => {};
  const done = new Promise<number>((resolve) => (finish = resolve));
  const restore = (): void => {
    stdout.write(LEAVE);
    if (stdin.isTTY) stdin.setRawMode(false);
  };
  const app = new App({
    root,
    cols: stdout.columns ?? 80,
    rows: stdout.rows ?? 24,
    analyzer: (request) => analyze({ ...request, generate: worker.generate }),
    onQuit: () => finish(0),
  });
  const onData = (chunk: string): void => app.input(chunk);
  const onResize = (): void => app.resize(stdout.columns ?? 80, stdout.rows ?? 24);
  const onCrash = (error: unknown): void => {
    restore();
    process.stderr.write(`keylang: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(2);
  };
  const openEditor = async (abs: string, line: number): Promise<void> => {
    const command = editorCommand(process.env, abs, line);
    if (!command) return;
    if (!command.wait) {
      spawn(command.command, command.args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
      return;
    }
    // Removing the listener is not enough: a flowing stdin keeps reading and
    // would take keys meant for the editor. Paused, it leaves the TTY alone.
    stdin.off("data", onData);
    stdin.pause();
    restore();
    editing = true;
    await new Promise<void>((resolve) => {
      const child = spawn(command.command, command.args, { stdio: "inherit" });
      child.on("exit", () => resolve());
      child.on("error", () => resolve());
    });
    editing = false;
    if (finished) return;
    enter();
    stdin.on("data", onData);
    stdin.resume();
  };
  const enter = (): void => {
    if (stdin.isTTY) stdin.setRawMode(true);
    stdout.write(ENTER);
  };
  // A signal must not leave the terminal in raw mode on the alternate screen.
  const onTerminate = (signal: NodeJS.Signals): void => {
    restore();
    worker.close();
    process.exit(128 + (SIGNAL_NUMBER[signal] ?? 15));
  };
  const onStop = (): void => {
    restore();
    process.once("SIGCONT", onContinue);
    process.kill(process.pid, "SIGSTOP");
  };
  const onContinue = (): void => {
    if (editing || finished) return;
    enter();
    app.redraw();
  };
  let editing = false;
  let finished = false;
  stdin.setEncoding("utf8");
  enter();
  process.on("uncaughtException", onCrash);
  process.on("unhandledRejection", onCrash);
  process.on("SIGTERM", onTerminate);
  process.on("SIGHUP", onTerminate);
  process.on("SIGQUIT", onTerminate);
  process.on("SIGINT", onTerminate);
  process.on("SIGTSTP", onStop);
  stdin.on("data", onData);
  stdout.on("resize", onResize);
  stdin.resume();
  app.attach({ kind: "terminal", write: (ansi) => stdout.write(ansi), ...(editorCommand(process.env, "", 1) ? { openEditor } : {}) }, stdout.columns ?? 80, stdout.rows ?? 24);
  const code = await done;
  finished = true;
  process.off("SIGTERM", onTerminate);
  process.off("SIGHUP", onTerminate);
  process.off("SIGQUIT", onTerminate);
  process.off("SIGINT", onTerminate);
  process.off("SIGTSTP", onStop);
  process.off("SIGCONT", onContinue);
  stdin.off("data", onData);
  stdout.off("resize", onResize);
  process.off("uncaughtException", onCrash);
  process.off("unhandledRejection", onCrash);
  stdin.pause();
  restore();
  worker.close();
  return code;
}
