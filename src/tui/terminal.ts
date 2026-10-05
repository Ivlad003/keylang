// `keylang` in a terminal: raw stdin, the alternate screen, SGR mouse, and
// `$VISUAL` / `$EDITOR` for jumps into code. The screen is restored on every
// exit path, including a crash, and `runTerminal` then returns a contract
// exit code to `main` (0 for a quit or a signal, 2 for a crash); it never
// ends the process itself. While the screen belongs to someone else — a
// terminal `$EDITOR`, or the shell after `Ctrl+Z` — the session's surface is
// detached, so neither a finished analysis nor a resize draws over it.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { App, type AppOptions, type Surface } from "./app.ts";
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

/** The terminal's input: a TTY in raw mode, or a stand-in in a test. */
export interface TerminalInput {
  readonly isTTY?: boolean;
  setRawMode?(raw: boolean): unknown;
  setEncoding(encoding: BufferEncoding): unknown;
  on(event: "data", listener: (chunk: string) => void): unknown;
  off(event: "data", listener: (chunk: string) => void): unknown;
  pause(): unknown;
  resume(): unknown;
}

export interface TerminalOutput {
  readonly columns?: number;
  readonly rows?: number;
  write(text: string): unknown;
  on(event: "resize", listener: () => void): unknown;
  off(event: "resize", listener: () => void): unknown;
}

export type TerminalSignal = "SIGTERM" | "SIGHUP" | "SIGINT" | "SIGQUIT" | "SIGTSTP" | "SIGCONT";

/** What the terminal session needs from its process; `processHost()` is the real one. */
export interface TerminalHost {
  stdin: TerminalInput;
  stdout: TerminalOutput;
  stderr(text: string): void;
  env: NodeJS.ProcessEnv;
  /** Delivers signals and crashes (an uncaught exception or rejection) until the returned function is called. */
  listen(onSignal: (signal: TerminalSignal) => void, onCrash: (error: unknown) => void): () => void;
  /** Stops the process until SIGCONT: what `Ctrl+Z` does once the screen is restored. */
  suspend(): void;
}

/** Whether the platform has job control: a stopped process the shell resumes with `fg`. */
const JOB_CONTROL = process.platform !== "win32";

const SIGNALS: readonly TerminalSignal[] = ["SIGTERM", "SIGHUP", "SIGINT", "SIGQUIT", "SIGTSTP", "SIGCONT"];

export function processHost(): TerminalHost {
  return {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: (text) => process.stderr.write(text),
    env: process.env,
    listen: (onSignal, onCrash) => {
      for (const signal of SIGNALS) process.on(signal, onSignal);
      process.on("uncaughtException", onCrash);
      process.on("unhandledRejection", onCrash);
      return () => {
        for (const signal of SIGNALS) process.off(signal, onSignal);
        process.off("uncaughtException", onCrash);
        process.off("unhandledRejection", onCrash);
      };
    },
    // The whole process group stops, as a shell's Ctrl+Z stops a job: under `npx` the parent stops too, so
    // the shell sees the job stopped and offers `fg`, instead of waiting on a parent that still runs.
    suspend: () => process.kill(0, "SIGSTOP"),
  };
}

/** `session`: the operation runner or worker the session uses instead of its own (tests hold an operation with it). */
export async function runTerminal(root: string, host: TerminalHost = processHost(), session: Pick<AppOptions, "operations" | "operationWorker"> = {}): Promise<number> {
  const { stdin, stdout } = host;
  const worker = new SnapshotWorker();
  let finish: (code: number) => void = () => {};
  const done = new Promise<number>((resolve) => (finish = resolve));
  let finished = false;
  const end = (code: number): void => {
    if (finished) return;
    finished = true;
    finish(code);
  };
  const size = (): [number, number] => [stdout.columns ?? 80, stdout.rows ?? 24];
  const app = new App({
    root,
    cols: size()[0],
    rows: size()[1],
    analyzer: (request) => analyze({ ...request, generate: worker.generate }),
    onQuit: () => end(0),
    ...session,
  });
  const onData = (chunk: string): void => app.input(chunk);
  const onResize = (): void => app.resize(...size());

  /** Whether the TUI has the screen: raw mode, the alternate screen, the mouse. */
  let shown = false;
  const enter = (): void => {
    if (stdin.isTTY) stdin.setRawMode?.(true);
    stdout.write(ENTER);
    shown = true;
  };
  const leave = (): void => {
    if (!shown) return;
    stdout.write(LEAVE);
    if (stdin.isTTY) stdin.setRawMode?.(false);
    shown = false;
  };
  // `$EDITOR` or a stop has the screen: nothing is read (a flowing stdin would take the editor's keys)
  // and nothing is drawn; taking it back repaints the whole frame at the current size.
  let away: "editor" | "stopped" | null = null;
  const handOver = (reason: "editor" | "stopped"): void => {
    away = reason;
    app.detach();
    stdin.off("data", onData);
    stdin.pause();
    leave();
  };
  const takeBack = (): void => {
    away = null;
    enter();
    stdin.on("data", onData);
    stdin.resume();
    app.attach(surface, ...size());
  };
  const openEditor = async (abs: string, line: number): Promise<void> => {
    const command = editorCommand(host.env, abs, line);
    if (!command) return;
    if (!command.wait) {
      spawn(command.command, command.args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
      return;
    }
    if (away !== null || finished) return;
    handOver("editor");
    await new Promise<void>((resolve) => {
      const child = spawn(command.command, command.args, { stdio: "inherit" });
      child.on("exit", () => resolve());
      child.on("error", () => resolve());
    });
    if (finished || away !== "editor") return;
    takeBack();
  };
  /** Ctrl+Z (a key in raw mode) or SIGTSTP: the screen goes back to the shell and keylang stops until SIGCONT. */
  const stop = (): void => {
    // With the editor in front, it stops along with keylang and the screen is the editor's to restore.
    if (away === null) handOver("stopped");
    host.suspend();
  };
  const surface: Surface = { write: (ansi) => stdout.write(ansi), ...(editorCommand(host.env, "", 1) ? { openEditor } : {}), ...(JOB_CONTROL ? { suspend: stop } : {}) };

  const onSignal = (signal: TerminalSignal): void => {
    if (signal === "SIGTSTP") return stop();
    if (signal === "SIGCONT") {
      if (away === "stopped" && !finished) takeBack();
      return;
    }
    // Ctrl+C and Ctrl+\ typed in the editor reach this process too: they belong to the editor.
    if (away === "editor" && (signal === "SIGINT" || signal === "SIGQUIT")) return;
    // A deliberate stop (kill, a closed terminal): the screen is restored below and the session ends like `q`.
    end(0);
  };
  const onCrash = (error: unknown): void => {
    // Leave first, so the message lands on the normal screen, not on the alternate one that disappears.
    leave();
    host.stderr(`keylang: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    end(2);
  };

  stdin.setEncoding("utf8");
  enter();
  const unlisten = host.listen(onSignal, onCrash);
  stdin.on("data", onData);
  stdout.on("resize", onResize);
  stdin.resume();
  app.attach(surface, ...size());
  const code = await done;
  unlisten();
  stdin.off("data", onData);
  stdout.off("resize", onResize);
  stdin.pause();
  app.close();
  leave();
  worker.close();
  return code;
}
