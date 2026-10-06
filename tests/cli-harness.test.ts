// What keylang installs into a repository: `init` and `agents` (the managed
// AGENTS.md block, MCP servers, skills, Claude deny rules and hooks, Codex
// approval) and the git pre-commit hook of `hook install`.

import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { git, keylang, LAYERS, ORDER, PAY, root, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";

const VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;

test("init: managed AGENTS.md block keeps foreign CRLF text, is idempotent, and baseline adds no fail", (t) => {
  const foreign = "Чужий заголовок\r\n\r\nНе чіпати.\r\n";
  const make = (): string => {
    const dir = tempDir(t, "keylang-launch-");
    writeTree(dir, {
      "package.json": `${JSON.stringify({ name: "shop", private: true, dependencies: { stripe: "1.0.0" } })}\n`,
      "src/domain/order.ts": ORDER,
      "src/app/pay.ts": 'import { price } from "../domain/order.ts";\nimport Stripe from "stripe";\nexport function charge(): number {\n  return price() + (Stripe ? 1 : 0);\n}\n',
      "AGENTS.md": foreign,
    });
    mkdirSync(join(dir, ".claude"));
    return dir;
  };
  const run = (dir: string): string => {
    const init = keylang(dir, ["init"]);
    assert.equal(init.status, 0, init.stderr);
    const check = keylang(dir, ["check"]);
    assert.equal(check.status, 0, check.stdout);
    assert.doesNotMatch(check.stdout, /rules\.baseline\.md:\d+:\d+: K102/);
    const agents = keylang(dir, ["agents", "--check"]);
    assert.equal(agents.status, 0, agents.stdout);
    const block = readFileSync(join(dir, "AGENTS.md"), "utf8");
    assert.ok(block.startsWith(foreign), "foreign text is a byte prefix");
    assert.match(block, /<!-- keylang:begin -->/);
    assert.match(block, /<!-- keylang:end -->/);
    assert.ok(block.includes("\r\n"));
    assert.ok(Buffer.byteLength(block.slice(block.indexOf("<!-- keylang:begin -->"), block.indexOf("<!-- keylang:end -->") + "<!-- keylang:end -->".length)) <= 4096);
    return block;
  };
  const first = run(make());
  const secondDir = make();
  const once = run(secondDir);
  const again = keylang(secondDir, ["init"]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(join(secondDir, "AGENTS.md"), "utf8"), once);
  assert.equal(once.replace(/\r\n/g, "\n"), first.replace(/\r\n/g, "\n"));
});

test("agents: --agents=none writes no harness files; unknown name and broken markers write nothing", (t) => {
  const dir = tempDir(t, "keylang-none-");
  writeTree(dir, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  const none = keylang(dir, ["init", "--agents=none"]);
  assert.equal(none.status, 0, none.stderr);
  assert.equal(existsSync(join(dir, "AGENTS.md")), false);
  assert.equal(existsSync(join(dir, "CLAUDE.md")), false);
  assert.equal(existsSync(join(dir, ".mcp.json")), false);
  assert.equal(existsSync(join(dir, ".agents/skills/keylang-feature/SKILL.md")), false);
  assert.ok(existsSync(join(dir, "keylang.json")));
  assert.ok(existsSync(join(dir, "keylang/rules.baseline.md")));
  const check = keylang(dir, ["check"]);
  assert.equal(check.status, 0, check.stdout);

  const bad = tempDir(t, "keylang-agents-bad-");
  writeTree(bad, { "src/app/pay.ts": PAY });
  const before = treeBytes(bad);
  const unknown = keylang(bad, ["init", "--agents=nope"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /claude, codex, opencode, cursor, or none/);
  assert.deepEqual(treeBytes(bad), before);

  writeTree(bad, { "AGENTS.md": "<!-- keylang:begin -->\nнемає кінця\n" });
  const marked = readFileSync(join(bad, "AGENTS.md"), "utf8");
  const broken = keylang(bad, ["agents"]);
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /AGENTS\.md: broken markers/);
  assert.equal(readFileSync(join(bad, "AGENTS.md"), "utf8"), marked);
  assert.equal(existsSync(join(bad, "keylang.json")), false);
});

test("agents: MCP servers, skill copies, Claude deny and a stale --check that writes nothing", (t) => {
  const dir = tempDir(t, "keylang-mcp-cfg-");
  writeTree(dir, {
    "src/app/pay.ts": PAY,
    ".mcp.json": `${JSON.stringify({ mcpServers: { other: { command: "echo", args: ["hi"] } }, keep: true }, null, 2)}\n`,
    ".claude/settings.json": `${JSON.stringify({ permissions: { allow: ["Bash"], deny: ["Read(secret)"] }, hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "echo kept" }] }] } }, null, 2)}\n`,
    "opencode.json": `${JSON.stringify({ mcp: { other: { type: "local", command: ["echo"] } } }, null, 2)}\n`,
  });
  mkdirSync(join(dir, ".codex"));
  mkdirSync(join(dir, ".cursor"));
  const init = keylang(dir, ["init", "--agents=claude,codex,opencode,cursor"]);
  assert.equal(init.status, 0, init.stderr);
  const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")) as { keep: boolean; mcpServers: Record<string, { command: string; args?: string[] }> };
  assert.equal(mcp.keep, true);
  assert.deepEqual(mcp.mcpServers.other, { command: "echo", args: ["hi"] });
  assert.deepEqual(mcp.mcpServers.keylang, { command: "npx", args: ["-y", `keylang@${VERSION}`, "mcp"] });
  const cursor = JSON.parse(readFileSync(join(dir, ".cursor/mcp.json"), "utf8")) as { mcpServers: { keylang: { args: string[] } } };
  assert.deepEqual(cursor.mcpServers.keylang.args, ["-y", `keylang@${VERSION}`, "mcp"]);
  const toml = readFileSync(join(dir, ".codex/config.toml"), "utf8");
  assert.match(toml, /keylang@/);
  assert.match(toml, new RegExp(`keylang@${VERSION.replace(/\./g, "\\.")}`));
  const open = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8")) as { mcp: Record<string, { type?: string; command?: string[] }> };
  assert.deepEqual(open.mcp.other, { type: "local", command: ["echo"] });
  assert.equal(open.mcp.keylang?.type, "local");
  assert.deepEqual(open.mcp.keylang?.command, ["npx", "-y", `keylang@${VERSION}`, "mcp"]);
  const skillA = readFileSync(join(dir, ".agents/skills/keylang-feature/SKILL.md"), "utf8");
  const skillC = readFileSync(join(dir, ".claude/skills/keylang-feature/SKILL.md"), "utf8");
  assert.equal(skillA, skillC);
  assert.match(skillA, /^---\nname: keylang-feature\n/);
  assert.match(skillA, /^description: /m);
  assert.equal(statSync(join(dir, ".claude/skills/keylang-feature/SKILL.md")).isSymbolicLink(), false);
  const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8")) as {
    permissions: { allow: string[]; deny: string[] };
    hooks: { PostToolUse: unknown[]; Stop: { hooks: { command: string }[] }[] };
  };
  assert.deepEqual(settings.permissions.allow, ["Bash"]);
  for (const rule of ["Edit(keylang/rules.md)", "Write(keylang/rules.md)", "Edit(keylang/rules.baseline.md)", "Write(keylang/rules.baseline.md)", "Bash(* proposals accept *)", "Bash(* proposals reject *)"]) assert.ok(settings.permissions.deny.includes(rule), rule);
  assert.ok(settings.permissions.deny.includes("Read(secret)"));
  assert.equal(settings.hooks.PostToolUse.length, 1);
  assert.match(JSON.stringify(settings.hooks.Stop), new RegExp(`keylang@${VERSION.replace(/\./g, "\\.")} hook stop`));
  assert.match(readFileSync(join(dir, ".codex/hooks.json"), "utf8"), /hook stop/);
  const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.match(agentsMd, /trusted project/);
  // The CLI fallback is the command MCP and the hook pin: no global `keylang`, no unpinned `npx keylang`.
  const pinned = `npx -y keylang@${VERSION}`;
  for (const text of [agentsMd, skillA]) {
    for (const command of ["feature <slug> --format json", "check", "spec-to-code <id> --print", "baseline"]) assert.ok(text.includes(`\`${pinned} ${command}\``), `${pinned} ${command}`);
    assert.doesNotMatch(text, /`keylang (feature|check|spec-to-code|baseline)\b/);
    assert.doesNotMatch(text, /keylang@<version>/);
  }

  writeFileSync(join(dir, "AGENTS.md"), agentsMd.replaceAll(`keylang@${VERSION}`, "keylang@0.0.0"));
  const staleBlock = keylang(dir, ["agents", "--check"]);
  assert.equal(staleBlock.status, 1, staleBlock.stdout);
  assert.match(staleBlock.stdout, /AGENTS\.md: stale/);
  writeFileSync(join(dir, "AGENTS.md"), agentsMd);

  mcp.mcpServers.keylang.args = ["-y", "keylang@0.0.0", "mcp"];
  writeFileSync(join(dir, ".mcp.json"), `${JSON.stringify(mcp, null, 2)}\n`);
  writeFileSync(join(dir, ".claude/skills/keylang-feature/SKILL.md"), skillC.replace("keylang", "keylang-edited"));
  const held = treeBytes(dir);
  const stale = keylang(dir, ["agents", "--check"]);
  assert.equal(stale.status, 1, stale.stdout);
  assert.match(stale.stdout, /\.mcp\.json: stale/);
  assert.match(stale.stdout, /SKILL\.md: stale/);
  assert.deepEqual(treeBytes(dir), held);
  assert.equal(keylang(dir, ["agents", "--check", "--agents=none"]).status, 1);
});

test("agents: Codex MCP tools run in `codex exec` without a prompt (default_tools_approval_mode); the user's keys stay; --check wants the key", (t) => {
  const dir = tempDir(t, "keylang-codex-approve-");
  writeTree(dir, {
    "src/app/pay.ts": PAY,
    ".codex/config.toml": 'model = "o3"\n\n[mcp_servers.other]\ncommand = "echo"\n\n[mcp_servers.keylang]\ncommand = "old"\nstartup_timeout_sec = 30\n',
  });
  const init = keylang(dir, ["init", "--agents=codex"]);
  assert.equal(init.status, 0, init.stderr);
  const toml = readFileSync(join(dir, ".codex/config.toml"), "utf8");
  const table = toml.slice(toml.indexOf("[mcp_servers.keylang]"));
  assert.match(table, /^default_tools_approval_mode = "approve"$/m);
  assert.match(table, /^startup_timeout_sec = 30$/m);
  assert.match(table, /^command = "npx"$/m);
  assert.match(toml, /^model = "o3"$/m);
  assert.match(toml, /\[mcp_servers\.other\]\ncommand = "echo"/);
  assert.equal(keylang(dir, ["agents", "--check", "--agents=codex"]).status, 0);
  writeFileSync(join(dir, ".codex/config.toml"), toml.replace(/^default_tools_approval_mode = "approve"\n/m, ""));
  const held = treeBytes(dir);
  const stale = keylang(dir, ["agents", "--check", "--agents=codex"]);
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.match(stale.stdout, /\.codex\/config\.toml: stale/);
  assert.deepEqual(treeBytes(dir), held);
});

test("agents: invalid JSON or TOML exits 2 and writes nothing", (t) => {
  const dir = tempDir(t, "keylang-bad-json-");
  writeTree(dir, { "src/app/pay.ts": PAY, ".mcp.json": "{ not json\n", ".codex/config.toml": "mcp_servers = [\n" });
  mkdirSync(join(dir, ".claude"));
  const before = treeBytes(dir);
  const json = keylang(dir, ["agents", "--agents=claude"]);
  assert.equal(json.status, 2);
  assert.match(json.stderr, /\.mcp\.json: invalid JSON/);
  assert.deepEqual(treeBytes(dir), before);
  const toml = keylang(dir, ["agents", "--agents=codex"]);
  assert.equal(toml.status, 2);
  assert.match(toml.stderr, /\.codex\/config\.toml: invalid TOML/);
  assert.deepEqual(treeBytes(dir), before);
});

test("init: the keylang skill under .claude is not a Claude harness, so a second init adds no Claude adapters", (t) => {
  const dir = tempDir(t, "keylang-skill-claude-");
  writeTree(dir, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  mkdirSync(join(dir, ".cursor"));
  assert.equal(keylang(dir, ["init"]).status, 0);
  assert.equal(existsSync(join(dir, ".claude/skills/keylang-feature/SKILL.md")), true);
  assert.equal(existsSync(join(dir, "CLAUDE.md")), false);
  assert.equal(existsSync(join(dir, ".mcp.json")), false);
  assert.equal(existsSync(join(dir, ".claude/settings.json")), false);
  assert.equal(keylang(dir, ["init"]).status, 0);
  assert.equal(keylang(dir, ["agents"]).status, 0);
  assert.equal(existsSync(join(dir, "CLAUDE.md")), false);
  assert.equal(existsSync(join(dir, ".mcp.json")), false);
  assert.equal(existsSync(join(dir, ".claude/settings.json")), false);
  assert.ok(existsSync(join(dir, ".cursor/mcp.json")));
});

// DX commands (design §7.5): pre-commit hook.

test("hook install writes an executable pre-commit hook once, --check writes nothing, a foreign hook stays", (t) => {
  const dir = tempDir(t, "keylang-precommit-");
  writeTree(dir, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY });
  git(dir, ["init"]);
  const hook = join(dir, ".git/hooks/pre-commit");

  const missing = keylang(dir, ["hook", "install", "--check"]);
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stderr, /keylang hook install/);
  assert.equal(existsSync(hook), false);

  const first = keylang(dir, ["hook", "install"]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /\.git\/hooks\/pre-commit/);
  const text = readFileSync(hook, "utf8");
  assert.match(text, /^#!\/bin\/sh\n/);
  assert.match(text, new RegExp(`npx -y keylang@${VERSION.replace(/\./g, "\\.")} check --changed`));
  assert.notEqual(statSync(hook).mode & 0o111, 0);
  assert.equal(keylang(dir, ["hook", "install", "--check"]).status, 0);

  const again = keylang(dir, ["hook", "install"]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(hook, "utf8"), text);

  // A keylang hook of another version is rewritten in place; --check calls it stale.
  writeFileSync(hook, text.replace(`keylang@${VERSION}`, "keylang@0.0.1"));
  assert.equal(keylang(dir, ["hook", "install", "--check"]).status, 1);
  assert.equal(keylang(dir, ["hook", "install"]).status, 0);
  assert.equal(readFileSync(hook, "utf8"), text);

  // Not executable: --check fails and install restores the mode.
  chmodSync(hook, 0o644);
  assert.equal(keylang(dir, ["hook", "install", "--check"]).status, 1);
  assert.equal(keylang(dir, ["hook", "install"]).status, 0);
  assert.notEqual(statSync(hook).mode & 0o111, 0);

  const foreign = "#!/bin/sh\nnpm run lint\n";
  writeFileSync(hook, foreign);
  const refused = keylang(dir, ["hook", "install"]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /pre-commit/);
  assert.match(refused.stderr, /check --changed/);
  assert.equal(readFileSync(hook, "utf8"), foreign);
  assert.equal(keylang(dir, ["hook", "install", "--check"]).status, 1);
  assert.equal(readFileSync(hook, "utf8"), foreign);
});

test("hook install follows core.hooksPath and needs a git repository", (t) => {
  const dir = tempDir(t, "keylang-hookspath-");
  git(dir, ["init"]);
  git(dir, ["config", "core.hooksPath", ".githooks"]);
  const o = keylang(dir, ["hook", "install"]);
  assert.equal(o.status, 0, o.stderr);
  assert.ok(existsSync(join(dir, ".githooks/pre-commit")));
  assert.equal(existsSync(join(dir, ".git/hooks/pre-commit")), false);

  const bare = tempDir(t, "keylang-hook-nogit-");
  const none = keylang(bare, ["hook", "install"]);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /git/);
  assert.equal(keylang(bare, ["hook", "nope"]).status, 2);
});
