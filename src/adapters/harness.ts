// Harness adapters: one pure merge from the files on disk and the selected
// harnesses to the next text. Markdown keeps a marked block; JSON and TOML
// replace only the `keylang` key. I/O stays in the CLI.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { allCrlf } from "../safe-write.ts";

/** Files `init` / `agents` may create or edit. The CLI reads each one before planning. */
export const HARNESS_PATHS = [
  "AGENTS.md",
  "CLAUDE.md",
  ".mcp.json",
  ".cursor/mcp.json",
  ".codex/config.toml",
  "opencode.json",
  "opencode.jsonc",
  ".agents/skills/keylang-feature/SKILL.md",
  ".claude/skills/keylang-feature/SKILL.md",
  ".claude/settings.json",
  ".codex/hooks.json",
] as const;

/** The skill shipped in the package. The same relative path works from `src/adapters` and from `dist/adapters`. */
export function skillFile(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../resources/keylang-feature/SKILL.md");
}

export const HARNESS_NAMES = ["claude", "codex", "opencode", "cursor"] as const;
export type HarnessName = (typeof HARNESS_NAMES)[number];

export const MARK_BEGIN = "<!-- keylang:begin -->";
export const MARK_END = "<!-- keylang:end -->";

/** Codex's per-file instruction budget is 32 KiB; this block stays under 4 KiB. */
const BLOCK_LIMIT = 4096;

const DENY_RULES = ["Edit(keylang/rules.md)", "Write(keylang/rules.md)", "Edit(keylang/rules.baseline.md)", "Write(keylang/rules.baseline.md)"];

const SKILL_AGENTS = ".agents/skills/keylang-feature/SKILL.md";
const SKILL_CLAUDE = ".claude/skills/keylang-feature/SKILL.md";

export interface HarnessSelection {
  harnesses: readonly HarnessName[];
  /** False only for `--agents=none`: no instruction block and no adapter files. */
  instructions: boolean;
}

export interface HarnessFile {
  path: string;
  /** Null when the file should be absent. */
  text: string | null;
}

export interface HarnessPlan {
  files: HarnessFile[];
  error: { file: string; message: string } | null;
}

/** `--agents=<list>`. `none` is the empty selection. An unknown name throws and lists the allowed names. */
export function parseAgents(value: string): HarnessSelection {
  const names = value.split(",").map((part) => part.trim()).filter((part) => part !== "");
  const allowed = `${HARNESS_NAMES.join(", ")}, or none`;
  if (names.length === 0) throw new Error(`--agents needs a name; expected ${allowed}`);
  if (names.includes("none")) {
    if (names.length > 1) throw new Error(`--agents=none cannot be combined with other names; expected ${allowed}`);
    return { harnesses: [], instructions: false };
  }
  const unknown = names.find((name) => !HARNESS_NAMES.includes(name as HarnessName));
  if (unknown !== undefined) throw new Error(`unknown agent \`${unknown}\`; expected ${allowed}`);
  return { harnesses: HARNESS_NAMES.filter((name) => names.includes(name)), instructions: true };
}

/** What is on disk for harness detection. `list` returns child names, or null when the path is not a directory. */
export interface HarnessProbe {
  exists: (path: string) => boolean;
  list: (path: string) => string[] | null;
}

/**
 * Directories and files that mean a harness is already in use. Order matches
 * `HARNESS_NAMES`. `.claude/skills/keylang-feature` is the copy `agents`
 * writes for every harness, so that tree alone is not Claude.
 */
export function detectHarnesses(probe: HarnessProbe): HarnessName[] {
  const found: HarnessName[] = [];
  if (claudePresent(probe)) found.push("claude");
  if (probe.exists(".codex")) found.push("codex");
  if (probe.exists("opencode.json") || probe.exists("opencode.jsonc")) found.push("opencode");
  if (probe.exists(".cursor")) found.push("cursor");
  return found;
}

const CLAUDE_SKILL = ".claude/skills/keylang-feature";

function claudePresent(probe: HarnessProbe): boolean {
  const top = probe.list(".claude");
  if (top === null) return false;
  if (top.length === 0) return true;
  return claudeHasUserFile(probe, ".claude");
}

/** A file under `.claude` that is not the keylang skill copy. */
function claudeHasUserFile(probe: HarnessProbe, dir: string): boolean {
  const names = probe.list(dir);
  if (names === null) return false;
  for (const name of names) {
    const path = `${dir}/${name}`;
    if (path === CLAUDE_SKILL || path.startsWith(`${CLAUDE_SKILL}/`)) continue;
    const children = probe.list(path);
    if (children === null) return true;
    if (claudeHasUserFile(probe, path)) return true;
  }
  return false;
}

/** The instruction body between the markers, without a trailing newline. */
export function agentsBody(): string {
  return [
    "keylang is the spec; you write the code.",
    "",
    "Feature cycle:",
    "1. Write `keylang/features/<slug>.md` with `planned` declarations and flows.",
    "2. Call `validate_spec` on that text, then `scaffold` for each planned fn (template only).",
    "3. Implement the code with your own edits.",
    "4. Call `feature_status` or `keylang feature <slug>` until done, then drop `planned` when K202 says it is implemented.",
    "Done: every `planned` is implemented (K202, not K201), every flow step is static ok, and no rule fails. Tests and trace do not block.",
    "",
    "MCP: `context`, `validate_spec`, `scaffold`, `feature_status`, `search`, `node`, `code`, `flows`, `check`, `explain`. Only `apply_diff` writes, and only a proposal.",
    "",
    "Change `keylang/rules.md` and `keylang/rules.baseline.md` only through a proposal (`apply_diff`).",
    "",
    "CLI when MCP is off: `keylang feature <slug> --format json`, `keylang check`, `keylang spec-to-code <id> --print`, `keylang baseline`.",
    "",
    "`.codex/` applies only in a trusted project; each hook there is approved on its own. This file is the fallback.",
  ].join("\n");
}

/** `npx -y keylang@<version> mcp`, split the way MCP configs store a command. */
export function mcpCommand(version: string): { command: string; args: string[] } {
  return { command: "npx", args: ["-y", `keylang@${version}`, "mcp"] };
}

/** What the Stop hook runs. */
export function hookCommand(version: string): string {
  return `npx -y keylang@${version} hook stop`;
}

/**
 * Desired text of every harness file this selection owns. `files` holds the
 * current text, null when the file is absent. The first broken marker or
 * invalid JSON/TOML is `error` and `files` is empty: the caller writes nothing.
 */
export function planHarness(input: { selection: HarnessSelection; version: string; skill: string; files: ReadonlyMap<string, string | null> }): HarnessPlan {
  const body = agentsBody();
  const block = `${MARK_BEGIN}\n${body}\n${MARK_END}\n`;
  if (Buffer.byteLength(block) > BLOCK_LIMIT) throw new Error(`AGENTS.md block is ${Buffer.byteLength(block)} bytes; the limit is ${BLOCK_LIMIT}`);
  const files: HarnessFile[] = [];
  const fail = (file: string, message: string): HarnessPlan => ({ files: [], error: { file, message } });
  const push = (path: string, result: { text: string | null } | { error: string }): HarnessPlan | null => {
    if ("error" in result) return fail(path, result.error);
    files.push({ path, text: result.text });
    return null;
  };

  const selected = new Set(input.selection.harnesses);
  const owned = input.selection.instructions && selected.size > 0;
  const agents = mergeMarked(input.files.get("AGENTS.md") ?? null, input.selection.instructions ? body : null);
  const stopped = push("AGENTS.md", agents);
  if (stopped) return stopped;

  if (input.selection.instructions && selected.has("claude")) {
    const claude = mergeClaude(input.files.get("CLAUDE.md") ?? null);
    const stoppedClaude = push("CLAUDE.md", claude);
    if (stoppedClaude) return stoppedClaude;
  } else if (!input.selection.instructions) {
    const claude = mergeMarked(input.files.get("CLAUDE.md") ?? null, null);
    const stoppedClaude = push("CLAUDE.md", claude);
    if (stoppedClaude) return stoppedClaude;
  }

  const mcp = (path: string, present: boolean): HarnessPlan | null => {
    if (!present && input.selection.instructions) return null;
    if (!present && !input.files.has(path) && (input.files.get(path) ?? null) === null) return null;
    return push(path, mergeMcpJson(input.files.get(path) ?? null, input.selection.instructions && present ? input.version : null));
  };
  // `present` is "this harness is selected". For `--agents=none`, strip a file that exists.
  const want = (name: HarnessName, path: string): boolean => (input.selection.instructions && selected.has(name)) || (!input.selection.instructions && input.files.get(path) != null);
  for (const [name, path] of [
    ["claude", ".mcp.json"],
    ["cursor", ".cursor/mcp.json"],
  ] as const) {
    if (!want(name, path)) continue;
    const result = mcp(path, selected.has(name));
    if (result) return result;
  }

  if (want("codex", ".codex/config.toml")) {
    const toml = mergeCodexToml(input.files.get(".codex/config.toml") ?? null, input.selection.instructions && selected.has("codex") ? input.version : null);
    const stoppedToml = push(".codex/config.toml", toml);
    if (stoppedToml) return stoppedToml;
  }

  const opencodePath = opencodeFile(input.files);
  if ((input.selection.instructions && selected.has("opencode")) || (!input.selection.instructions && input.files.get(opencodePath) != null)) {
    const open = mergeOpencode(input.files.get(opencodePath) ?? null, input.selection.instructions && selected.has("opencode") ? input.version : null);
    const stoppedOpen = push(opencodePath, open);
    if (stoppedOpen) return stoppedOpen;
  }

  if (owned) {
    const skill = input.skill.endsWith("\n") ? input.skill : `${input.skill}\n`;
    files.push({ path: SKILL_AGENTS, text: skill }, { path: SKILL_CLAUDE, text: skill });
  } else if (!input.selection.instructions) {
    if (input.files.get(SKILL_AGENTS) != null) files.push({ path: SKILL_AGENTS, text: null });
    if (input.files.get(SKILL_CLAUDE) != null) files.push({ path: SKILL_CLAUDE, text: null });
  }

  if (want("claude", ".claude/settings.json")) {
    const settings = mergeSettings(input.files.get(".claude/settings.json") ?? null, input.selection.instructions && selected.has("claude") ? input.version : null);
    const stoppedSettings = push(".claude/settings.json", settings);
    if (stoppedSettings) return stoppedSettings;
  }
  if (want("codex", ".codex/hooks.json")) {
    const hooks = mergeHooksFile(input.files.get(".codex/hooks.json") ?? null, input.selection.instructions && selected.has("codex") ? input.version : null);
    const stoppedHooks = push(".codex/hooks.json", hooks);
    if (stoppedHooks) return stoppedHooks;
  }
  return { files, error: null };
}

/**
 * Splice `body` between the markers. Text outside them is copied byte for byte.
 * `body` null removes the block. A begin without an end is an error.
 * The block uses CRLF when every newline of `existing` is CRLF.
 */
export function mergeMarked(existing: string | null, body: string | null): { text: string | null } | { error: string } {
  const nl: "\n" | "\r\n" = existing !== null && allCrlf(existing) ? "\r\n" : "\n";
  if (existing !== null) {
    const begin = existing.indexOf(MARK_BEGIN);
    const end = existing.indexOf(MARK_END);
    if (begin !== -1 && (end === -1 || end < begin)) return { error: "broken markers: begin without end" };
    if (end !== -1 && begin === -1) return { error: "broken markers: end without begin" };
    if (begin !== -1 && existing.indexOf(MARK_BEGIN, begin + MARK_BEGIN.length) !== -1) return { error: "broken markers: more than one begin" };
    if (begin !== -1 && end !== -1) {
      const head = existing.slice(0, begin);
      const tail = existing.slice(end + MARK_END.length);
      if (body === null) {
        const next = `${head}${tail}`;
        return { text: next.trim() === "" ? null : next };
      }
      return { text: `${head}${marked(body, nl)}${tail}` };
    }
  }
  if (body === null) return { text: existing && existing.trim() !== "" ? existing : null };
  const block = marked(body, nl);
  if (existing === null || existing === "") return { text: `${block}${nl}` };
  const sep = existing.endsWith("\n") ? "" : nl;
  return { text: `${existing}${sep}${block}${nl}` };
}

function marked(body: string, nl: "\n" | "\r\n"): string {
  const inner = body.replace(/\r?\n/g, nl);
  return `${MARK_BEGIN}${nl}${inner}${nl}${MARK_END}`;
}

/**
 * `@AGENTS.md` lives in the managed block. A file that already says it
 * outside the block is left without a second copy (the block is removed).
 */
function mergeClaude(existing: string | null): { text: string | null } | { error: string } {
  const outside = outsideMarkers(existing);
  if (typeof outside !== "string") return outside;
  if (outside.includes("@AGENTS.md")) return mergeMarked(existing, null);
  return mergeMarked(existing, "@AGENTS.md");
}

function outsideMarkers(existing: string | null): string | { error: string } {
  if (existing === null) return "";
  const begin = existing.indexOf(MARK_BEGIN);
  const end = existing.indexOf(MARK_END);
  if (begin !== -1 && (end === -1 || end < begin)) return { error: "broken markers: begin without end" };
  if (end !== -1 && begin === -1) return { error: "broken markers: end without begin" };
  if (begin === -1) return existing;
  return `${existing.slice(0, begin)}${existing.slice(end + MARK_END.length)}`;
}

function mergeMcpJson(existing: string | null, version: string | null): { text: string | null } | { error: string } {
  return mergeJsonKey(existing, ["mcpServers"], version === null ? null : mcpCommand(version));
}

function mergeOpencode(existing: string | null, version: string | null): { text: string | null } | { error: string } {
  const server = version === null ? null : { type: "local", command: ["npx", "-y", `keylang@${version}`, "mcp"] };
  return mergeJsonKey(existing, ["mcp"], server);
}

function mergeCodexToml(existing: string | null, version: string | null): { text: string | null } | { error: string } {
  let data: Record<string, unknown> = {};
  if (existing !== null && existing.trim() !== "") {
    try {
      data = { ...(parseToml(existing) as Record<string, unknown>) };
    } catch (error) {
      return { error: `invalid TOML (${error instanceof Error ? error.message : String(error)})` };
    }
  }
  const current = data.mcp_servers;
  if (current !== undefined && !isRecord(current)) return { error: "mcp_servers is not a table" };
  const servers = { ...(current ?? {}) };
  if (version === null) delete servers.keylang;
  else servers.keylang = mcpCommand(version);
  if (Object.keys(servers).length === 0) delete data.mcp_servers;
  else data.mcp_servers = servers;
  if (Object.keys(data).length === 0) return { text: null };
  const text = stringifyToml(data);
  return { text: text.endsWith("\n") ? text : `${text}\n` };
}

function mergeSettings(existing: string | null, version: string | null): { text: string | null } | { error: string } {
  const parsed = parseObject(existing);
  if ("error" in parsed) return parsed;
  const data = parsed.value;
  const denied = mergeDeny(data.permissions, version !== null);
  if ("error" in denied) return denied;
  if (denied.value === undefined) delete data.permissions;
  else data.permissions = denied.value;
  const hooks = mergeHooksValue(data.hooks, version);
  if ("error" in hooks) return hooks;
  if (hooks.value === undefined) delete data.hooks;
  else data.hooks = hooks.value;
  return finishJson(data);
}

function mergeHooksFile(existing: string | null, version: string | null): { text: string | null } | { error: string } {
  const parsed = parseObject(existing);
  if ("error" in parsed) return parsed;
  const hooks = mergeHooksValue(parsed.value.hooks, version);
  if ("error" in hooks) return hooks;
  if (hooks.value === undefined) delete parsed.value.hooks;
  else parsed.value.hooks = hooks.value;
  return finishJson(parsed.value);
}

function mergeDeny(permissions: unknown, install: boolean): { value: unknown } | { error: string } {
  if (permissions === undefined && !install) return { value: undefined };
  if (permissions !== undefined && !isRecord(permissions)) return { error: "permissions is not an object" };
  const perms: Record<string, unknown> = { ...(permissions ?? {}) };
  const deny = perms.deny;
  if (deny !== undefined && !Array.isArray(deny)) return { error: "permissions.deny is not an array" };
  if (deny !== undefined && deny.some((item) => typeof item !== "string")) return { error: "permissions.deny must be strings" };
  const list = ((deny ?? []) as string[]).filter((item) => install || !DENY_RULES.includes(item));
  if (install) for (const rule of DENY_RULES) if (!list.includes(rule)) list.push(rule);
  if (list.length === 0) delete perms.deny;
  else perms.deny = list;
  return { value: Object.keys(perms).length === 0 ? undefined : perms };
}

function mergeHooksValue(hooks: unknown, version: string | null): { value: unknown } | { error: string } {
  if (hooks === undefined && version === null) return { value: undefined };
  if (hooks !== undefined && !isRecord(hooks)) return { error: "hooks is not an object" };
  const value: Record<string, unknown> = { ...(hooks ?? {}) };
  const stop = value.Stop;
  if (stop !== undefined && !Array.isArray(stop)) return { error: "hooks.Stop is not an array" };
  const groups = ((stop ?? []) as unknown[]).map((group) => rewriteGroup(group, version));
  const bad = groups.find((group): group is { error: string } => "error" in group);
  if (bad) return bad;
  let next = groups as Record<string, unknown>[];
  if (version !== null && !next.some((group) => JSON.stringify(group).includes(hookCommand(version)))) {
    next = [...next, { hooks: [{ type: "command", command: hookCommand(version) }] }];
  }
  next = next.filter((group) => !emptyGroup(group));
  if (next.length === 0) delete value.Stop;
  else value.Stop = next;
  return { value: Object.keys(value).length === 0 ? undefined : value };
}

function rewriteGroup(group: unknown, version: string | null): Record<string, unknown> | { error: string } {
  if (!isRecord(group)) return { error: "hooks.Stop entry is not an object" };
  const list = group.hooks;
  if (list === undefined) return { ...group };
  if (!Array.isArray(list)) return { error: "hooks.Stop hooks is not an array" };
  const hooks = [];
  for (const hook of list) {
    if (!isRecord(hook)) return { error: "hook is not an object" };
    if (typeof hook.command === "string" && isOurHook(hook.command)) {
      if (version === null) continue;
      hooks.push({ ...hook, command: hookCommand(version) });
    } else hooks.push(hook);
  }
  return { ...group, hooks };
}

function emptyGroup(group: Record<string, unknown>): boolean {
  return Array.isArray(group.hooks) && group.hooks.length === 0 && Object.keys(group).every((key) => key === "hooks" || key === "matcher");
}

function isOurHook(command: string): boolean {
  return /keylang(?:@\S+)? hook stop/.test(command);
}

function mergeJsonKey(existing: string | null, path: readonly string[], server: unknown): { text: string | null } | { error: string } {
  const parsed = parseObject(existing);
  if ("error" in parsed) return parsed;
  const key = path[0]!;
  const current = parsed.value[key];
  if (current !== undefined && !isRecord(current)) return { error: `${key} is not an object` };
  const table: Record<string, unknown> = { ...(current ?? {}) };
  if (server === null) delete table.keylang;
  else table.keylang = server;
  if (Object.keys(table).length === 0) delete parsed.value[key];
  else parsed.value[key] = table;
  return finishJson(parsed.value);
}

function parseObject(existing: string | null): { value: Record<string, unknown> } | { error: string } {
  if (existing === null || existing.trim() === "") return { value: {} };
  try {
    const value: unknown = JSON.parse(existing);
    if (!isRecord(value)) return { error: "expected a JSON object" };
    return { value: { ...value } };
  } catch (error) {
    return { error: `invalid JSON (${error instanceof Error ? error.message : String(error)})` };
  }
}

function finishJson(data: Record<string, unknown>): { text: string | null } {
  if (Object.keys(data).length === 0) return { text: null };
  return { text: `${JSON.stringify(data, null, 2)}\n` };
}

function opencodeFile(files: ReadonlyMap<string, string | null>): string {
  if (files.get("opencode.json") != null) return "opencode.json";
  if (files.get("opencode.jsonc") != null) return "opencode.jsonc";
  return "opencode.json";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
