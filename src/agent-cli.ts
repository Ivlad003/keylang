// An agent CLI as a text model (ADR 0009): `cli:claude`, `cli:codex`,
// `cli:opencode`, `cli:cursor` or a command defined in
// `~/.config/keylang/agents.json`. One request is one run of the CLI in
// "answer only" form: no project hooks, MCP servers or instructions where the
// CLI can turn them off, write tools off, `cwd = PWD = root` and
// `KEYLANG_NESTED=1` in its environment. The prompt goes on stdin (Cursor:
// argv). The run is its own process group: an early answer, a cancel or a
// timeout kills the whole group, and keylang's exit kills every live one.
//
// The effective agent: `KEYLANG_AGENT` > agents.json "use" > keylang.json
// `agent`. This module never imports `llm.ts` (no-cycles): `llm.ts` wraps it.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { AGENT_CLI_PRESETS, AGENT_FORMS, isAgent } from "./config.ts";

type Env = Readonly<Record<string, string | undefined>>;
type Preset = (typeof AGENT_CLI_PRESETS)[number];

/** A user's own CLI: `command[0]` is the binary; `{prompt_file}` and `{model}` are placeholders. A preset name takes only `bin`. */
export type CliDefinition = { command: string[] } | { bin: string };

/** `~/.config/keylang/agents.json`, validated. */
export interface AgentSettings {
  use: string | null;
  clis: Record<string, CliDefinition>;
}

/** Where the effective agent came from. */
export type AgentSource = "KEYLANG_AGENT" | "agents.json" | "keylang.json";

export interface CliRequest {
  system: string;
  prompt: string;
}

/** `ms`: the call's bound; `fromVariable`: the bound is `KEYLANG_LLM_TIMEOUT_MS`, which the timeout message then names. */
export interface CliCallOptions {
  signal?: AbortSignal;
  ms: number;
  fromVariable: boolean;
}

export interface CliClient {
  /** `cli:claude:opus`. */
  agent: string;
  /** The model after the name, or "" for the CLI's own default. */
  model: string;
  /** The binary that runs. */
  bin: string;
  complete(request: CliRequest, options: CliCallOptions): Promise<string>;
}

/** The caller cancelled the run; `llm.ts` turns it into `LlmCancelled`. */
export class CliCancelled extends Error {
  constructor(agent: string) {
    super(`${agent}: cancelled`);
    this.name = "CliCancelled";
  }
}

const PLACEHOLDERS = new Set(["{prompt_file}", "{model}"]);
/** Linux `MAX_ARG_STRLEN` is 128 KiB per argument: Cursor's prompt is one. */
const CURSOR_PROMPT_LIMIT = 120 * 1024;
const OUTPUT_LIMIT = 16 * 1024 * 1024;
const STDERR_TAIL = 4096;
const KILL_GRACE_MS = 2000;
const VERSION_TIMEOUT_MS = 5000;
const CURSOR_VERSION = /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]{7,}/;

export function agentsFile(home: string): string {
  return join(home, ".config/keylang/agents.json");
}

/** agents.json, validated; an absent file is empty settings. Errors name the file and the field. */
export function readAgentSettings(home: string): AgentSettings {
  const file = agentsFile(home);
  if (!existsSync(file)) return { use: null, clis: {} };
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`${file}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseAgentSettings(file, value);
}

/** The settings of an agents.json already parsed as JSON. */
export function parseAgentSettings(file: string, value: unknown): AgentSettings {
  const shown = (v: unknown): string => JSON.stringify(v) ?? String(v);
  if (!isObject(value)) throw new Error(`${file}: must be a JSON object, got ${shown(value)}`);
  const settings: AgentSettings = { use: null, clis: {} };
  for (const [key, v] of Object.entries(value)) {
    if (key === "use") {
      if (typeof v !== "string" || !isAgent(v)) throw new Error(`${file}: \`use\` must be ${AGENT_FORMS}, got ${shown(v)}`);
      settings.use = v;
    } else if (key === "clis") {
      if (!isObject(v)) throw new Error(`${file}: \`clis\` must be an object of name → { "command": [...] } or { "bin": "..." }, got ${shown(v)}`);
      for (const [name, def] of Object.entries(v)) settings.clis[name] = cliDefinition(file, name, def);
    } else throw new Error(`${file}: unknown field \`${key}\` (known: use, clis)`);
  }
  return settings;
}

function cliDefinition(file: string, name: string, def: unknown): CliDefinition {
  const shown = (v: unknown): string => JSON.stringify(v) ?? String(v);
  const field = `clis.${name}`;
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`${file}: \`${field}\`: a name is lowercase letters, digits and \`-\`, starting with a letter`);
  if (!isObject(def)) throw new Error(`${file}: \`${field}\` must be { "command": [...] } or { "bin": "..." }, got ${shown(def)}`);
  const preset = (AGENT_CLI_PRESETS as readonly string[]).includes(name);
  for (const key of Object.keys(def)) {
    if (key !== "command" && key !== "bin") throw new Error(`${file}: unknown field \`${field}.${key}\``);
  }
  if (def.bin !== undefined) {
    if (def.command !== undefined) throw new Error(`${file}: \`${field}\` takes \`command\` or \`bin\`, not both`);
    if (typeof def.bin !== "string" || def.bin === "") throw new Error(`${file}: \`${field}.bin\` must be a path or a name on PATH, got ${shown(def.bin)}`);
    return { bin: def.bin };
  }
  if (preset) throw new Error(`${file}: \`${field}\`: a preset takes only \`bin\``);
  const command = def.command;
  if (!Array.isArray(command) || command.length === 0 || !command.every((part) => typeof part === "string")) {
    throw new Error(`${file}: \`${field}.command\` must be a non-empty array of strings, got ${shown(command)}`);
  }
  const parts = command as string[];
  if (parts[0] === "") throw new Error(`${file}: \`${field}.command[0]\` must name the binary`);
  parts.forEach((part, i) => {
    for (const placeholder of part.match(/\{[^{}]*\}/g) ?? []) {
      if (!PLACEHOLDERS.has(placeholder)) throw new Error(`${file}: \`${field}.command[${i}]\`: unknown placeholder \`${placeholder}\` (use {prompt_file}, {model}, or stdin)`);
    }
  });
  if (parts[0]!.includes("{")) throw new Error(`${file}: \`${field}.command[0]\` is the binary, not a placeholder`);
  return { command: parts };
}

/**
 * The agent in effect and where it came from: `KEYLANG_AGENT` (an empty
 * variable is unset), else agents.json "use", else keylang.json `agent`.
 * An invalid variable or agents.json throws, naming it.
 */
export function resolveAgent(configAgent: string | null, env: Env, home: string): { agent: string | null; source: AgentSource | null } {
  const fromEnv = env.KEYLANG_AGENT;
  if (fromEnv !== undefined && fromEnv !== "") {
    if (!isAgent(fromEnv)) throw new Error(`KEYLANG_AGENT must be ${AGENT_FORMS}, got ${JSON.stringify(fromEnv)}`);
    return { agent: fromEnv, source: "KEYLANG_AGENT" };
  }
  const settings = readAgentSettings(home);
  if (settings.use !== null) return { agent: settings.use, source: "agents.json" };
  return configAgent === null ? { agent: null, source: null } : { agent: configAgent, source: "keylang.json" };
}

/**
 * The effective agent for deciding whether to ask at all (ghost, forms): a
 * broken setting counts as an agent, so the request that follows reports it.
 */
export function selectedAgent(configAgent: string | null, env: Env = process.env, home: string = homedir()): string | null {
  try {
    return resolveAgent(configAgent, env, home).agent;
  } catch {
    return configAgent ?? env.KEYLANG_AGENT ?? "cli:?";
  }
}

/** `cli:opencode:anthropic/claude-sonnet-5` → name and model (the model keeps its colons). */
export function parseCliAgent(agent: string): { name: string; model: string } {
  const rest = agent.slice("cli:".length);
  const colon = rest.indexOf(":");
  return colon < 0 ? { name: rest, model: "" } : { name: rest.slice(0, colon), model: rest.slice(colon + 1) };
}

/** What `cliClient` runs: a preset with its binary, or a user's command. */
type Runner = { preset: Preset; bin: string } | { command: string[] };

/**
 * A client for a `cli:` agent, or why there is none (a missing binary, a
 * Grok `agent` where Cursor's was expected): only a PATH scan and, for an
 * `agent` binary, one memoized `--version`. Invalid agents.json throws.
 */
export function cliClient(agent: string, options: { root: string; env: Env; home: string }): { client: CliClient } | { missing: string } {
  const { name, model } = parseCliAgent(agent);
  const settings = readAgentSettings(options.home);
  const defined = settings.clis[name];
  const preset = (AGENT_CLI_PRESETS as readonly string[]).includes(name) ? (name as Preset) : null;
  let runner: Runner;
  if (preset === null) {
    if (defined === undefined || !("command" in defined)) return { missing: `agent \`${agent}\`: no CLI \`${name}\`: the presets are ${AGENT_CLI_PRESETS.join(", ")}; define others in ${agentsFile(options.home)} ("clis": {"${name}": {"command": [...]}})` };
    const bin = findBinary(defined.command[0]!, options.env);
    if (bin === null) return { missing: `agent \`${agent}\`: \`${defined.command[0]}\` (${agentsFile(options.home)} \`clis.${name}.command[0]\`) is not on PATH` };
    runner = { command: [bin, ...defined.command.slice(1)] };
  } else {
    const found = presetBinary(preset, defined !== undefined && "bin" in defined ? defined.bin : null, options.env, options.home);
    if ("missing" in found) return { missing: `agent \`${agent}\`: ${found.missing}` };
    runner = { preset, bin: found.bin };
  }
  const bin = "bin" in runner ? runner.bin : runner.command[0]!;
  return {
    client: {
      agent,
      model,
      bin,
      complete: (request, call) => completeWith(agent, runner, model, request, options, call),
    },
  };
}

const INSTALL: Record<Preset, string> = {
  claude: "install Claude Code (https://claude.com/claude-code)",
  codex: "install Codex CLI (https://github.com/openai/codex)",
  opencode: "install opencode (https://opencode.ai)",
  cursor: "install the Cursor CLI (https://cursor.com/cli)",
};

/** The binary of a preset: `bin` from agents.json, else its name on PATH; Cursor's is `cursor-agent`, or `agent` when its version is Cursor's. */
function presetBinary(preset: Preset, bin: string | null, env: Env, home: string): { bin: string } | { missing: string } {
  if (bin !== null) {
    const found = findBinary(bin, env);
    return found === null ? { missing: `\`${bin}\` (${agentsFile(home)} \`clis.${preset}.bin\`) is not an executable file` } : { bin: found };
  }
  if (preset !== "cursor") {
    const found = findBinary(preset, env);
    return found === null ? { missing: `\`${preset}\` is not on PATH; ${INSTALL[preset]} or change \`agent\`` } : { bin: found };
  }
  const cursorAgent = findBinary("cursor-agent", env);
  if (cursorAgent !== null) return { bin: cursorAgent };
  const agentBin = findBinary("agent", env);
  if (agentBin === null) return { missing: `neither \`cursor-agent\` nor \`agent\` is on PATH; ${INSTALL.cursor} or change \`agent\`` };
  const version = binaryVersion(agentBin, env);
  if (version !== null && CURSOR_VERSION.test(version)) return { bin: agentBin };
  return { missing: `\`agent\` on PATH (${agentBin}) is \`${version ?? "no version"}\`, not the Cursor CLI; ${INSTALL.cursor}, put cursor-agent on PATH, or set "clis": {"cursor": {"bin": …}} in ${agentsFile(home)}` };
}

const versions = new Map<string, string | null>();

/** The first line of `<bin> --version`, at most 5 s, memoized per process; null when it gives none. */
function binaryVersion(bin: string, env: Env): string | null {
  if (versions.has(bin)) return versions.get(bin)!;
  const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: VERSION_TIMEOUT_MS, env: { ...env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  const line = r.status === 0 ? (r.stdout.trim().split("\n")[0]?.trim() ?? "") : "";
  const version = line === "" ? null : line;
  versions.set(bin, version);
  return version;
}

/** `2.1.289 (Claude Code)` → `2.1.289`; `codex-cli 0.155.1` → `0.155.1`; a Cursor build keeps its hash. */
export function shortVersion(line: string): string {
  return /\d+\.\d+(?:\.\d+)?(?:-[0-9a-f]{7,})?/.exec(line)?.[0] ?? line;
}

/** The version of a binary for doctor, asynchronously (5 s cap, never a login or status command). */
export function cliVersion(bin: string, env: Env = process.env): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["--version"], { env: { ...env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), VERSION_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const line = out.trim().split("\n")[0]?.trim() ?? "";
      resolve(code === 0 && line !== "" ? shortVersion(line) : null);
    });
  });
}

/** A preset as doctor sees it: its binary (null: none usable) and that binary's version (null: it gave none). */
export interface AgentCliProbe {
  name: Preset;
  bin: string | null;
  version: string | null;
}

/** Every preset, probed in parallel with `--version` only: offline, never a login or status command. */
export async function probeAgentClis(env: Env = process.env, home: string = homedir()): Promise<AgentCliProbe[]> {
  let settings: AgentSettings = { use: null, clis: {} };
  try {
    settings = readAgentSettings(home);
  } catch {
    // doctor's agent line reports a broken agents.json; the presets are still listed.
  }
  return Promise.all(
    AGENT_CLI_PRESETS.map(async (name) => {
      const defined = settings.clis[name];
      const found = presetBinary(name, defined !== undefined && "bin" in defined ? defined.bin : null, env, home);
      if ("missing" in found) return { name, bin: null, version: null };
      return { name, bin: found.bin, version: await cliVersion(found.bin, env) };
    }),
  );
}

/** A name on PATH or a path, if it is an executable file. */
export function findBinary(name: string, env: Env): string | null {
  if (name.includes("/")) return executable(name) ? name : null;
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (dir === "" || !isAbsolute(dir)) continue;
    const candidate = join(dir, name);
    if (executable(candidate)) return candidate;
  }
  return null;
}

function executable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// ---------- invocation (pure) ----------

/** How the answer is read: a `type:"result"` JSON line, Codex's `-o` file, opencode's NDJSON events, or stdout. */
export type AnswerKind = "result-json" | "file" | "opencode-events" | "stdout";

export interface Invocation {
  bin: string;
  args: string[];
  /** Written to stdin and closed; null keeps stdin open and unwritten (Cursor). */
  stdin: string | null;
  env: Record<string, string | undefined>;
  answer: AnswerKind;
  /** Files written (mode 0600) before the run; the answer file for `file`. */
  files: { path: string; text: string }[];
  answerFile: string | null;
}

const PREAMBLE = "Answer with text only. Do not run tools or commands and do not edit files.";

/** The process to run for one request; `tmp` is a private directory outside the repository. */
export function invocation(runner: Runner, model: string, request: CliRequest, root: string, env: Env, tmp: string): Invocation {
  const system = `${request.system}\n\n${PREAMBLE}`;
  const base = { ...env, PWD: root, NO_COLOR: "1", KEYLANG_NESTED: "1" };
  const modelArgs = model === "" ? [] : ["--model", model];
  if ("command" in runner) {
    const promptFile = join(tmp, "prompt.txt");
    const usesFile = runner.command.some((part) => part.includes("{prompt_file}"));
    const args = runner.command
      .slice(1)
      .filter((part) => model !== "" || !part.includes("{model}"))
      .map((part) => part.replaceAll("{model}", model).replaceAll("{prompt_file}", promptFile));
    const text = `${system}\n\n${request.prompt}`;
    return { bin: runner.command[0]!, args, stdin: usesFile ? "" : text, env: base, answer: "stdout", files: usesFile ? [{ path: promptFile, text }] : [], answerFile: null };
  }
  switch (runner.preset) {
    case "claude":
      return {
        bin: runner.bin,
        // `--tools` takes several values: an option always follows it, never the prompt.
        args: ["-p", "--output-format", "json", "--no-session-persistence", "--safe-mode", "--strict-mcp-config", "--permission-prompts", "none", "--disable-slash-commands", "--tools", "", "--system-prompt", system, ...modelArgs],
        stdin: request.prompt,
        env: { ...base, DISABLE_AUTOUPDATER: "1" },
        answer: "result-json",
        files: [],
        answerFile: null,
      };
    case "codex": {
      const last = join(tmp, "last.txt");
      const config = [
        'approval_policy="never"',
        // A JSON string is a TOML basic string once lone surrogates are gone.
        `developer_instructions=${JSON.stringify(wellFormed(system))}`,
        "features.hooks=false",
        "features.multi_agent=false",
        "features.apps=false",
        "features.plugins=false",
        "features.shell_tool=false",
        "features.unified_exec=false",
        "project_doc_max_bytes=0",
        'web_search="disabled"',
        "mcp_servers={}",
      ];
      return {
        bin: runner.bin,
        args: ["exec", "--sandbox", "read-only", "--ephemeral", "--skip-git-repo-check", "--color", "never", "--cd", root, ...config.flatMap((c) => ["-c", c]), ...(model === "" ? [] : ["-m", model]), "-o", last, "-"],
        stdin: request.prompt,
        env: base,
        answer: "file",
        files: [],
        answerFile: last,
      };
    }
    case "opencode":
      return {
        bin: runner.bin,
        args: ["run", "--standalone", "--format", "json", "--agent", "keylang", ...modelArgs],
        stdin: request.prompt,
        env: {
          ...base,
          OPENCODE_CONFIG_CONTENT: opencodeConfig(env.OPENCODE_CONFIG_CONTENT, system),
          OPENCODE_DISABLE_PROJECT_CONFIG: "1",
          OPENCODE_DISABLE_AUTOUPDATE: "1",
        },
        answer: "opencode-events",
        files: [],
        answerFile: null,
      };
    case "cursor":
      return {
        bin: runner.bin,
        args: ["-p", "--output-format", "json", "--mode", "ask", "--sandbox", "enabled", "--workspace", root, ...modelArgs, `${system}\n\n${request.prompt}`],
        stdin: null,
        env: base,
        answer: "result-json",
        files: [],
        answerFile: null,
      };
  }
}

/** The user's `OPENCODE_CONFIG_CONTENT` with keylang's agent on top: every permission denied. */
function opencodeConfig(existing: string | undefined, system: string): string {
  let config: Record<string, unknown> = {};
  if (existing !== undefined && existing !== "") {
    try {
      const parsed = JSON.parse(existing) as unknown;
      if (isObject(parsed)) config = parsed;
    } catch {
      // Not JSON: opencode would reject it too; keylang's agent replaces it.
    }
  }
  const agents = isObject(config.agent) ? config.agent : {};
  return JSON.stringify({ ...config, agent: { ...agents, keylang: { mode: "primary", prompt: system, permission: "deny" } } });
}

function wellFormed(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

/** A `{"type":"result"}` line of Claude Code or Cursor: the answer, an error, or null for any other line. */
export function parseResultLine(line: string): { text: string } | { error: string } | null {
  const value = parseJson(line.trim());
  if (!isObject(value) || value.type !== "result") return null;
  const result = typeof value.result === "string" ? value.result : "";
  if (value.is_error === true || (typeof value.subtype === "string" && value.subtype.startsWith("error"))) return { error: result || String(value.subtype ?? "error") };
  return { text: result };
}

/** opencode's NDJSON: the text parts after the last step start, or the first error. */
export function parseOpencodeEvents(output: string): { text: string } | { error: string } {
  let parts: string[] = [];
  for (const line of output.split("\n")) {
    const event = parseJson(line.trim());
    if (!isObject(event)) continue;
    if (event.type === "error") {
      const error = isObject(event.error) ? event.error : {};
      const data = isObject(error.data) ? error.data : {};
      const message = typeof error.message === "string" ? error.message : typeof data.message === "string" ? data.message : JSON.stringify(event.error);
      return { error: message };
    }
    if (event.type === "step_start") parts = [];
    if (event.type === "text" && isObject(event.part) && typeof event.part.text === "string") parts.push(event.part.text);
  }
  return { text: parts.join("") };
}

// ---------- running (I/O) ----------

async function completeWith(agent: string, runner: Runner, model: string, request: CliRequest, options: { root: string; env: Env }, call: CliCallOptions): Promise<string> {
  if (call.signal?.aborted) throw new CliCancelled(agent);
  const tmp = mkdtempSync(join(tmpdir(), "keylang-agent-"));
  try {
    const inv = invocation(runner, model, request, options.root, options.env, tmp);
    const prompt = inv.args.at(-1) ?? "";
    if ("preset" in runner && runner.preset === "cursor" && Buffer.byteLength(prompt) > CURSOR_PROMPT_LIMIT) {
      throw new Error(`${agent}: the prompt is ${Buffer.byteLength(prompt)} bytes; Cursor takes it as one argument, at most ${CURSOR_PROMPT_LIMIT}; use another agent CLI`);
    }
    for (const file of inv.files) writeFileSync(file.path, file.text, { mode: 0o600 });
    const run = await runInvocation(agent, inv, options.root, call);
    const answer = readAnswer(agent, inv, run);
    if (answer.trim() === "") throw new Error(`${agent} answered without text`);
    return answer.trim();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

interface RunResult {
  stdout: string;
  /** An early `type:"result"` line already parsed. */
  result: { text: string } | { error: string } | null;
}

function readAnswer(agent: string, inv: Invocation, run: RunResult): string {
  switch (inv.answer) {
    case "result-json": {
      const result = run.result ?? lastResult(run.stdout);
      if (result === null) throw new Error(`${agent} answered without text`);
      if ("error" in result) throw new Error(`${agent}: ${result.error}`);
      return result.text;
    }
    case "file":
      return inv.answerFile !== null && existsSync(inv.answerFile) ? readFileSync(inv.answerFile, "utf8") : "";
    case "opencode-events": {
      const events = parseOpencodeEvents(run.stdout);
      if ("error" in events) throw new Error(`${agent}: ${events.error}`);
      return events.text;
    }
    case "stdout":
      return run.stdout;
  }
}

function lastResult(stdout: string): { text: string } | { error: string } | null {
  let found: { text: string } | { error: string } | null = null;
  for (const line of stdout.split("\n")) found = parseResultLine(line) ?? found;
  return found;
}

/** Process groups of runs still alive: killed when keylang exits. */
const liveGroups = new Set<number>();
let exitHooked = false;

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(process.platform === "win32" ? pid : -pid, signal);
  } catch {
    // ESRCH: the group is gone already.
  }
}

/** Once: keylang's exit kills every live group; a fatal signal with no handler of its own kills them first and is raised again. */
function hookExit(): void {
  if (!exitHooked) {
    exitHooked = true;
    process.on("exit", () => {
      for (const pid of liveGroups) killGroup(pid, "SIGKILL");
    });
  }
  // A detached run gets no Ctrl+C from the terminal: without this, an interrupted `explain --llm` would leave it running.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    if (process.listenerCount(sig) > 0) continue;
    const onSignal = (): void => {
      for (const pid of liveGroups) killGroup(pid, "SIGKILL");
      liveGroups.clear();
      process.kill(process.pid, sig);
    };
    process.once(sig, onSignal);
  }
}

function runInvocation(agent: string, inv: Invocation, root: string, call: CliCallOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    hookExit();
    let child: ChildProcess;
    try {
      child = spawn(inv.bin, inv.args, { cwd: root, env: inv.env, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
    } catch (error) {
      reject(new Error(`${agent}: cannot run ${inv.bin}: ${error instanceof Error ? error.message : String(error)}`));
      return;
    }
    const pid = child.pid;
    if (pid !== undefined) liveGroups.add(pid);
    let settled = false;
    let stdout = "";
    let stdoutBytes = 0;
    let stderr = "";
    let pending = "";
    let killTimer: NodeJS.Timeout | null = null;
    const stopGroup = (): void => {
      if (pid === undefined) return;
      killGroup(pid, "SIGTERM");
      killTimer ??= setTimeout(() => {
        killGroup(pid, "SIGKILL");
        liveGroups.delete(pid);
      }, KILL_GRACE_MS);
      killTimer.unref();
    };
    const finish = (outcome: { ok: RunResult } | { error: Error }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      call.signal?.removeEventListener("abort", onAbort);
      if ("ok" in outcome) resolve(outcome.ok);
      else reject(outcome.error);
    };
    const deadline = setTimeout(() => {
      stopGroup();
      finish({ error: new Error(`${agent}: no answer within ${call.ms} ms${call.fromVariable ? " (KEYLANG_LLM_TIMEOUT_MS)" : ""}`) });
    }, call.ms);
    deadline.unref();
    const onAbort = (): void => {
      stopGroup();
      finish({ error: new CliCancelled(agent) });
    };
    call.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdin!.on("error", () => {
      // EPIPE: a CLI that exits without reading its stdin.
    });
    if (inv.stdin !== null) child.stdin!.end(inv.stdin);
    child.stdout!.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > OUTPUT_LIMIT) {
        stopGroup();
        finish({ error: new Error(`${agent}: more than ${OUTPUT_LIMIT} bytes of output`) });
        return;
      }
      const text = chunk.toString();
      stdout += text;
      if (inv.answer !== "result-json") return;
      // The result line ends the call: a CLI that lingers after it (Cursor) is killed.
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const line of lines) {
        const result = parseResultLine(line);
        if (result === null) continue;
        stopGroup();
        finish({ ok: { stdout, result } });
        return;
      }
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (pid !== undefined) liveGroups.delete(pid);
      finish({ error: new Error(`${agent}: cannot run ${inv.bin}: ${error.code ?? error.message}`) });
    });
    child.on("close", (code, signal) => {
      if (pid !== undefined) {
        // Whatever the run left behind in its group goes with it.
        killGroup(pid, "SIGTERM");
        if (killTimer === null) liveGroups.delete(pid);
      }
      if (settled) return;
      if (code === 0) {
        finish({ ok: { stdout, result: null } });
        return;
      }
      const tail = stripAnsi(stderr).trim().split("\n").slice(-3).join(" ").slice(-300);
      const why = signal !== null ? `was killed by ${signal}` : `exited with code ${code}`;
      finish({ error: new Error(`${agent}: ${why}${tail === "" ? "" : `: ${tail}`}`) });
    });
  });
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

function parseJson(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
