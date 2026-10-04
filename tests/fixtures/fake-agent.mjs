// A stand-in for an agent CLI (claude, codex, opencode, cursor-agent, agent
// or a user's own command), run by `/bin/sh` wrappers from
// `tests/agent-fixture.ts`. No model, no network: it logs what it got and
// answers in the output format of the CLI it plays.
//
// FAKE_AGENT_AS       the CLI it plays (set by the wrapper)
// FAKE_AGENT_LOG      directory for `<n>.json` (the call) and `<n>.pid`
// FAKE_AGENT_MODES    comma list, one mode per call (the last one repeats):
//                     ok | slow (answers after 400 ms) | empty | fail |
//                     error-result | hang | linger
// FAKE_AGENT_REPLY    the answer text
// FAKE_AGENT_VERSION  what `--version` prints
// FAKE_AGENT_MODEL    claude: the model its result's `modelUsage` names (beside a smaller side model)

import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync, closeSync } from "node:fs";
import { join } from "node:path";

const as = process.env.FAKE_AGENT_AS ?? "custom";
const args = process.argv.slice(2);
const DEFAULT_VERSIONS = { claude: "2.1.289 (Claude Code)", codex: "codex-cli 0.155.1", opencode: "v2.0.20", "cursor-agent": "2026.09.28-64d2043", agent: "2026.09.28-64d2043" };

if (args[0] === "--version") {
  process.stdout.write(`${process.env.FAKE_AGENT_VERSION ?? DEFAULT_VERSIONS[as] ?? "1.0.0"}\n`);
  process.exit(0);
}

const log = process.env.FAKE_AGENT_LOG;
// The call number: the first `<n>.json` this process creates.
let n = 1;
let fd;
for (;;) {
  try {
    fd = openSync(join(log, `${n}.json`), "wx");
    break;
  } catch {
    n++;
  }
}
const modes = (process.env.FAKE_AGENT_MODES ?? "ok").split(",");
const mode = modes[n - 1] ?? modes.at(-1);
const reply = process.env.FAKE_AGENT_REPLY ?? "fake answer";

// Cursor gets its prompt as the last argument and stdin left open: never wait for it.
const stdin = as === "cursor-agent" || as === "agent" ? Promise.resolve("") : readStdin();
const promptFileArg = args.find((arg) => arg.endsWith("prompt.txt"));

stdin.then((input) => {
  const call = {
    as,
    args,
    stdin: input,
    started: Date.now(),
    cwd: process.cwd(),
    promptFile: promptFileArg && existsSync(promptFileArg) ? readFileSync(promptFileArg, "utf8") : null,
    env: Object.fromEntries(["PWD", "NO_COLOR", "KEYLANG_NESTED", "DISABLE_AUTOUPDATER", "OPENCODE_CONFIG_CONTENT", "OPENCODE_DISABLE_PROJECT_CONFIG", "OPENCODE_DISABLE_AUTOUPDATE"].map((name) => [name, process.env[name] ?? null])),
  };
  writeFileSync(fd, JSON.stringify(call));
  closeSync(fd);
  run();
});

function run() {
  if (mode === "hang") {
    hold();
    return;
  }
  if (mode === "fail") {
    process.stderr.write("boom\n");
    process.exit(3);
  }
  // A lingering CLI has its grandchild before it answers: the answer gets its group killed at once.
  if (mode === "linger") hold();
  const done = () => {
    writeFileSync(join(log, `${n}.done`), String(Date.now()));
    answer(mode === "empty" ? "" : reply, mode === "error-result");
  };
  if (mode === "slow") setTimeout(done, 400);
  else done();
}

/** A grandchild in the same process group, both pids logged, and this process never exits by itself. */
function hold() {
  const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  writeFileSync(join(log, `${n}.pid`), `${process.pid} ${grandchild.pid}`);
  setInterval(() => {}, 1000);
}

function answer(text, isError) {
  switch (as) {
    case "claude":
    case "cursor-agent":
    case "agent":
      process.stdout.write(`${JSON.stringify({ type: "system", subtype: "init" })}\n`);
      process.stdout.write(`${JSON.stringify({ type: "result", subtype: isError ? "error_during_execution" : "success", is_error: isError, result: isError ? "rate limited" : text, ...usage() })}\n`);
      return;
    case "codex": {
      const out = args[args.indexOf("-o") + 1];
      if (isError) {
        process.stderr.write("rate limited\n");
        process.exit(1);
      }
      writeFileSync(out, text);
      process.stdout.write("codex log line\n");
      return;
    }
    case "opencode":
      if (isError) {
        process.stdout.write(`${JSON.stringify({ type: "error", error: { name: "APIError", data: { message: "rate limited" } } })}\n`);
        process.exit(1);
      }
      process.stdout.write(`${JSON.stringify({ type: "step_start", part: {} })}\n`);
      process.stdout.write(`${JSON.stringify({ type: "text", part: { text: "thinking aloud" } })}\n`);
      process.stdout.write(`${JSON.stringify({ type: "step_start", part: {} })}\n`);
      process.stdout.write(`${JSON.stringify({ type: "text", part: { text } })}\n`);
      process.stdout.write(`${JSON.stringify({ type: "step_finish", part: {} })}\n`);
      return;
    default:
      if (isError) process.exit(1);
      process.stdout.write(`${text}\n`);
  }
}

/** Claude Code's `modelUsage`: the answering model wrote more output than the side model. */
function usage() {
  const model = process.env.FAKE_AGENT_MODEL;
  if (as !== "claude" || !model) return {};
  return { modelUsage: { "claude-haiku-5": { inputTokens: 50, outputTokens: 3 }, [model]: { inputTokens: 900, outputTokens: 60 } } };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}
