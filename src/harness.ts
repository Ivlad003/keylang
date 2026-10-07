// Harness adapters: one pure merge from the files on disk and the selected
// harnesses to the next text. Markdown keeps a marked block; JSON replaces
// only the `keylang` key; TOML splices only the `[mcp_servers.keylang]`
// table, so comments and layout around it stay. `--agents=none` strips
// keylang's entries: a file without one is left byte for byte, and a file
// goes only when nothing but those entries was in it. Below, the two phases
// the shared `agents` operation runs: a plan read from the disk (nothing
// written), then a commit that checks the plan's inputs again and writes
// step by step.

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { CONFIG_FILE, parseConfig } from "./config.ts";
import { allCrlf, landing, targetProblem, writeAtomic, writeProblem } from "./safe-write.ts";

/** Files `init` / `agents` may create or edit. The plan reads each one before it is computed. */
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

/** The skill shipped in the package. The same relative path works from `src` and from `dist`. */
export function skillFile(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../resources/keylang-feature/SKILL.md");
}

export const HARNESS_NAMES = ["claude", "codex", "opencode", "cursor"] as const;
export type HarnessName = (typeof HARNESS_NAMES)[number];

export const MARK_BEGIN = "<!-- keylang:begin -->";
export const MARK_END = "<!-- keylang:end -->";

/** Codex's per-file instruction budget is 32 KiB; this block stays under 4 KiB. */
const BLOCK_LIMIT = 4096;

/** The spec directory when `keylang.json` names none (`dir`). */
const DEFAULT_SPEC_DIR = "keylang";

/**
 * Claude's Bash deny entries that keep an agent from accepting or rejecting a
 * proposal itself: a person decides it. `*` matches any text, so every form of
 * the call is covered (`npx -y keylang@x`, `keylang`, `node …/keylang.js`).
 */
const PROPOSAL_DENY = ["Bash(* proposals accept *)", "Bash(* proposals reject *)"];

/** Claude's deny entries that keep an agent from editing the rules of the spec directory `dir`, or deciding a proposal. */
function denyRules(dir: string): string[] {
  return [`Edit(${dir}/rules.md)`, `Write(${dir}/rules.md)`, `Edit(${dir}/rules.baseline.md)`, `Write(${dir}/rules.baseline.md)`, ...PROPOSAL_DENY];
}

/** The spec directory of `keylang.json` under `root` (`dir`, normalized), or `keylang` without the file. A broken file throws, naming the file and the field. */
function specDir(root: string): string {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return DEFAULT_SPEC_DIR;
  return parseConfig(file, readFileSync(file, "utf8")).dir ?? DEFAULT_SPEC_DIR;
}

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

/** The instruction body between the markers, without a trailing newline. The CLI fallback pins `version`; paths are under the spec directory `dir`. */
export function agentsBody(version: string, dir: string): string {
  const cli = cliCommand(version);
  return [
    "keylang is the spec; you write the code.",
    "",
    "Feature cycle:",
    `1. Write \`${dir}/features/<slug>.md\` with \`planned\` declarations and flows.`,
    "2. Call `validate_spec` on that text, then `scaffold` for each planned fn (template only).",
    "3. Implement the code with your own edits.",
    "4. Call `feature_status` (or the CLI `feature` below) until done, then drop `planned` when K202 says it is implemented.",
    "Done: every `planned` is implemented (K202, not K201), every flow step is static ok, and no rule fail of this change remains (an older fail elsewhere is a hint). Tests and trace do not block.",
    "",
    "A feature file; the ids only show the shape:",
    "",
    "```markdown",
    "# flow refund",
    "",
    "- planned fn app.orders.refund (order: Order) → Refund",
    "- trigger ui.cli.main",
    "  - step app.orders.refund",
    "- ? Can an operator refund part of an order?",
    "```",
    "",
    `Each \`step\` is a call from its parent: the step it is nested under, or the trigger. Copy ids from \`${dir}/map/*.md\` or MCP \`search\`; never shorten one. Renaming or moving a file changes its ids: \`${cli} map\` regenerates the map. \`- ? <question>\` records an open question for a person: the feature is not done while it is there, and only the person answers it.`,
    "",
    "MCP: `context`, `validate_spec`, `scaffold`, `feature_status`, `search`, `node`, `code`, `flows`, `check`, `explain`. Only `apply_diff` writes, and only a proposal.",
    "",
    `Change \`${dir}/rules.md\` and \`${dir}/rules.baseline.md\` only through a proposal (\`apply_diff\`).`,
    "",
    `CLI when MCP is off, pinned like the MCP server: \`${cli} feature <slug> --format json\`, \`${cli} check\`, \`${cli} spec-to-code <id> --print\`, \`${cli} baseline\`.`,
    "",
    "`.codex/` applies only in a trusted project; each hook there is approved on its own. This file is the fallback.",
  ].join("\n");
}

/** `npx -y keylang@<version> mcp`, split the way MCP configs store a command. */
export function mcpCommand(version: string): { command: string; args: string[] } {
  return { command: "npx", args: ["-y", `keylang@${version}`, "mcp"] };
}

/** The pinned CLI the fallback names: the same package and version as the MCP server, so it needs no global `keylang`. */
export function cliCommand(version: string): string {
  return `npx -y keylang@${version}`;
}

/**
 * The skill resource names the CLI as `npx -y keylang@<version>` and the
 * spec directory as `<dir>/`; the copy a harness gets pins the running
 * version and the repository's `dir`.
 */
export function pinSkill(skill: string, version: string, dir: string): string {
  return skill.replaceAll("keylang@<version>", `keylang@${version}`).replaceAll("<dir>/", `${dir}/`);
}

/** What the Stop hook runs. */
export function hookCommand(version: string): string {
  return `${cliCommand(version)} hook stop`;
}

/**
 * Desired text of every harness file this selection owns. `files` holds the
 * current text, null when the file is absent; `dir` is the spec directory the
 * instructions, the skill and the deny rules name. The first broken marker or
 * invalid JSON/TOML is `error` and `files` is empty: the caller writes nothing.
 */
export function planHarness(input: { selection: HarnessSelection; version: string; dir: string; skill: string; files: ReadonlyMap<string, string | null> }): HarnessPlan {
  const body = agentsBody(input.version, input.dir);
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
    const pinned = pinSkill(input.skill, input.version, input.dir);
    const skill = pinned.endsWith("\n") ? pinned : `${pinned}\n`;
    files.push({ path: SKILL_AGENTS, text: skill }, { path: SKILL_CLAUDE, text: skill });
  } else if (!input.selection.instructions) {
    if (input.files.get(SKILL_AGENTS) != null) files.push({ path: SKILL_AGENTS, text: null });
    if (input.files.get(SKILL_CLAUDE) != null) files.push({ path: SKILL_CLAUDE, text: null });
  }

  if (want("claude", ".claude/settings.json")) {
    const settings = mergeSettings(input.files.get(".claude/settings.json") ?? null, input.selection.instructions && selected.has("claude") ? input.version : null, input.dir);
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
  // No block to remove: the file, blank or not, is the person's and stays as it is.
  if (body === null) return { text: existing };
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

/**
 * `codex exec` runs with approval policy `never` and rejects every MCP call
 * that needs approval. keylang's tools only read, and `apply_diff` writes only
 * a proposal under `.keylang/proposals/`, so they are approved up front.
 */
const CODEX_TOOLS_APPROVAL = "approve";

/** The `[mcp_servers.keylang]` header line (a trailing comment allowed), a header of one of its sub-tables, and any table header. */
const CODEX_TABLE = /^[ \t]*\[[ \t]*mcp_servers[ \t]*\.[ \t]*keylang[ \t]*\][ \t]*(?:#.*)?$/;
const CODEX_SUBTABLE = /^[ \t]*\[[ \t]*mcp_servers[ \t]*\.[ \t]*keylang[ \t]*\./;
const TOML_HEADER = /^[ \t]*\[/;

/**
 * The whole file is parsed (invalid TOML is an error, and the entry's own
 * keys come from the parse), but only the lines of the `[mcp_servers.keylang]`
 * table — header to the next header, its sub-tables included — are replaced,
 * removed or appended, so the person's comments and layout stay. An entry
 * spelled another way (an inline table, dotted keys), or a splice that does
 * not parse back (an inline `mcp_servers` cannot take a table header), falls
 * back to re-serializing the file, as every edit did before.
 */
function mergeCodexToml(existing: string | null, version: string | null): { text: string | null } | { error: string } {
  const text = existing === null ? "" : existing.replace(/\r\n/g, "\n");
  let data: Record<string, unknown> = {};
  if (text.trim() !== "") {
    try {
      data = { ...(parseToml(text) as Record<string, unknown>) };
    } catch (error) {
      return { error: `invalid TOML (${error instanceof Error ? error.message : String(error)})` };
    }
  }
  const current = data.mcp_servers;
  if (current !== undefined && !isRecord(current)) return { error: "mcp_servers is not a table" };
  const own = isRecord(current) ? current.keylang : undefined;
  const lines = text.split("\n");
  const region = codexTableRegion(lines);
  if (version === null) {
    if (own === undefined) return { text: existing };
    if (region === null) return rewriteCodexToml(data, null);
    let kept = withoutLines(lines, region).join("\n");
    if (kept.trim() === "") return { text: null };
    if (text.endsWith("\n") && !kept.endsWith("\n")) kept = `${kept}\n`;
    return codexEntryIs(kept, undefined) ? { text: kept } : rewriteCodexToml(data, null);
  }
  // A person's own keys of the entry (a timeout, a per-tool mode) stay; the command and the mode are keylang's.
  const entry = { ...(isRecord(own) ? own : {}), ...mcpCommand(version), default_tools_approval_mode: CODEX_TOOLS_APPROVAL };
  const table = stringifyToml({ mcp_servers: { keylang: entry } }).replace(/\n$/, "");
  let next: string;
  if (region !== null) next = [...lines.slice(0, region.start), ...table.split("\n"), ...lines.slice(region.end)].join("\n");
  else if (own !== undefined) return rewriteCodexToml(data, entry);
  else {
    const body = text.replace(/\n*$/, "");
    next = body === "" ? table : `${body}\n\n${table}`;
  }
  if (!next.endsWith("\n")) next = `${next}\n`;
  return codexEntryIs(next, entry) ? { text: next } : rewriteCodexToml(data, entry);
}

/** Lines `[start, end)` of the `[mcp_servers.keylang]` table and its sub-tables, or null without the header. */
function codexTableRegion(lines: readonly string[]): { start: number; end: number } | null {
  const start = lines.findIndex((line) => CODEX_TABLE.test(line));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && (!TOML_HEADER.test(lines[end]!) || CODEX_SUBTABLE.test(lines[end]!))) end += 1;
  return { start, end };
}

/** The lines without `[start, end)`; a blank line the removal left doubled (or last) goes with them. */
function withoutLines(lines: readonly string[], region: { start: number; end: number }): string[] {
  const out = [...lines.slice(0, region.start), ...lines.slice(region.end)];
  let at = region.start;
  while (at > 0 && out[at - 1]!.trim() === "" && (at >= out.length || out[at]!.trim() === "")) {
    out.splice(at - 1, 1);
    at -= 1;
  }
  return out;
}

/** Whether `text` parses and its `mcp_servers.keylang` is exactly `entry` (undefined: absent). */
function codexEntryIs(text: string, entry: Record<string, unknown> | undefined): boolean {
  try {
    const parsed = parseToml(text) as Record<string, unknown>;
    const servers = parsed.mcp_servers;
    const found = isRecord(servers) ? servers.keylang : undefined;
    return JSON.stringify(found ?? null) === JSON.stringify(entry ?? null);
  } catch {
    return false;
  }
}

/** The whole file re-serialized with `entry` as the keylang server (null: without one); empty data is no file. */
function rewriteCodexToml(data: Record<string, unknown>, entry: Record<string, unknown> | null): { text: string | null } {
  const servers = { ...((data.mcp_servers as Record<string, unknown> | undefined) ?? {}) };
  if (entry === null) delete servers.keylang;
  else servers.keylang = entry;
  if (Object.keys(servers).length === 0) delete data.mcp_servers;
  else data.mcp_servers = servers;
  if (Object.keys(data).length === 0) return { text: null };
  const text = stringifyToml(data);
  return { text: text.endsWith("\n") ? text : `${text}\n` };
}

function mergeSettings(existing: string | null, version: string | null, dir: string): { text: string | null } | { error: string } {
  const parsed = parseObject(existing);
  if ("error" in parsed) return parsed;
  const data = parsed.value;
  if (version === null && !holdsKeylangSettings(data, dir)) return { text: existing };
  const denied = mergeDeny(data.permissions, version !== null, dir);
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
  if (version === null && !holdsOurHook(parsed.value.hooks)) return { text: existing };
  const hooks = mergeHooksValue(parsed.value.hooks, version);
  if ("error" in hooks) return hooks;
  if (hooks.value === undefined) delete parsed.value.hooks;
  else parsed.value.hooks = hooks.value;
  return finishJson(parsed.value);
}

/**
 * keylang's deny entries for the spec directory `dir` are added (`install`)
 * or removed. Its entries for the default directory are keylang's too: they
 * go once `dir` is another one, so a changed `dir` leaves no stale entry
 * behind. Any other entry is the person's and stays where it is.
 */
function mergeDeny(permissions: unknown, install: boolean, dir: string): { value: unknown } | { error: string } {
  if (permissions === undefined && !install) return { value: undefined };
  if (permissions !== undefined && !isRecord(permissions)) return { error: "permissions is not an object" };
  const perms: Record<string, unknown> = { ...(permissions ?? {}) };
  const deny = perms.deny;
  if (deny !== undefined && !Array.isArray(deny)) return { error: "permissions.deny is not an array" };
  if (deny !== undefined && deny.some((item) => typeof item !== "string")) return { error: "permissions.deny must be strings" };
  const own = denyRules(dir);
  const old = new Set([...own, ...denyRules(DEFAULT_SPEC_DIR)].filter((rule) => !install || !own.includes(rule)));
  const list = ((deny ?? []) as string[]).filter((item) => !old.has(item));
  if (install) for (const rule of own) if (!list.includes(rule)) list.push(rule);
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

/** Whether Claude's settings hold anything of keylang's: a deny rule of the spec directory `dir` (or of the default one), or the Stop hook. */
function holdsKeylangSettings(data: Record<string, unknown>, dir: string): boolean {
  const deny = isRecord(data.permissions) ? data.permissions.deny : undefined;
  const rules = new Set([...denyRules(dir), ...denyRules(DEFAULT_SPEC_DIR)]);
  if (Array.isArray(deny) && deny.some((item) => typeof item === "string" && rules.has(item))) return true;
  return holdsOurHook(data.hooks);
}

function holdsOurHook(hooks: unknown): boolean {
  const stop = isRecord(hooks) ? hooks.Stop : undefined;
  return Array.isArray(stop) && stop.some((group) => isRecord(group) && Array.isArray(group.hooks) && group.hooks.some((hook) => isRecord(hook) && typeof hook.command === "string" && isOurHook(hook.command)));
}

function mergeJsonKey(existing: string | null, path: readonly string[], server: unknown): { text: string | null } | { error: string } {
  const parsed = parseObject(existing);
  if ("error" in parsed) return parsed;
  const key = path[0]!;
  const current = parsed.value[key];
  // Nothing of keylang's to strip: the file is the person's and stays byte for byte.
  if (server === null && !(isRecord(current) && "keylang" in current)) return { text: existing };
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

// ---------- the plan and the commit of `keylang agents` ----------

/** Which harnesses: detected from the disk, none (strip keylang's files), or a named, non-empty list. */
export type HarnessChoice = "auto" | "none" | readonly HarnessName[];

/** `--agents=<list>` as a choice; left out, the harnesses are detected. Throws as `parseAgents` does. */
export function harnessChoice(flag: string | undefined): HarnessChoice {
  if (flag === undefined) return "auto";
  const selection = parseAgents(flag);
  return selection.instructions ? selection.harnesses : "none";
}

/** The version the MCP command and the Stop hook pin: the running keylang's `package.json`, from `src` and from `dist`. */
export function keylangVersion(): string {
  return (createRequire(import.meta.url)("../package.json") as { version: string }).version;
}

/** What a harness file is for, as a step before the write names it. */
export type HarnessCategory = "instructions" | "mcp" | "skill" | "settings" | "hooks";

export function harnessCategory(path: string): HarnessCategory {
  if (path === "AGENTS.md" || path === "CLAUDE.md") return "instructions";
  if (path === SKILL_AGENTS || path === SKILL_CLAUDE) return "skill";
  if (path === ".claude/settings.json") return "settings";
  if (path === ".codex/hooks.json") return "hooks";
  return "mcp";
}

/** The probe of the real disk: `.claude` and the other harness directories are directories; opencode is a file. */
export function diskProbe(root: string): HarnessProbe {
  return {
    exists: (path) => {
      try {
        const stat = statSync(join(root, path));
        return path.endsWith(".json") || path.endsWith(".jsonc") ? stat.isFile() : stat.isDirectory();
      } catch {
        return false;
      }
    },
    list: (path) => {
      try {
        return statSync(join(root, path)).isDirectory() ? readdirSync(join(root, path)) : null;
      } catch {
        return null;
      }
    },
  };
}

/** The selection a choice resolves to on this disk: `auto` keeps the instruction block even when nothing is detected; `none` has none. */
export function resolveChoice(choice: HarnessChoice, probe: HarnessProbe): HarnessSelection {
  if (choice === "auto") return { harnesses: detectHarnesses(probe), instructions: true };
  if (choice === "none") return { harnesses: [], instructions: false };
  if (choice.length === 0) throw new Error(`agents: name at least one harness; expected ${HARNESS_NAMES.join(", ")}, or none`);
  const unknown = choice.find((name) => !HARNESS_NAMES.includes(name));
  if (unknown !== undefined) throw new Error(`unknown agent \`${unknown}\`; expected ${HARNESS_NAMES.join(", ")}, or none`);
  return { harnesses: HARNESS_NAMES.filter((name) => choice.includes(name)), instructions: true };
}

/** One file of the plan: the text it should hold (null: absent) against what is there now. */
export interface HarnessTarget {
  path: string;
  category: HarnessCategory;
  /** `keep`: it already holds the text (CRLF read as LF); `write` / `remove`: the commit changes it. */
  action: "keep" | "write" | "remove";
  text: string | null;
}

/**
 * What `keylang agents` would do, computed before anything is written.
 * Internal to one operation — not a stored format.
 */
export interface AgentsPlan {
  root: string;
  choice: HarnessChoice;
  selection: HarnessSelection;
  version: string;
  /** The spec directory (`dir` of keylang.json) the instructions, the skill and the deny rules name. */
  dir: string;
  /** Every file the selection owns, in the adapter's order; empty with `error`. */
  targets: HarnessTarget[];
  /** A broken marker or invalid JSON/TOML: nothing may be written. */
  error: { file: string; message: string } | null;
  /** The text of every harness path the plan read (null: absent): the commit expects exactly these. */
  inputs: ReadonlyMap<string, string | null>;
}

/** Plans the harness files of `choice` against the disk under `root`. Reads, writes nothing; throws on a read error or a broken keylang.json. */
export function planAgents(root: string, choice: HarnessChoice): AgentsPlan {
  const selection = resolveChoice(choice, diskProbe(root));
  const dir = specDir(root);
  const inputs = readInputs(root);
  const skill = selection.instructions && selection.harnesses.length > 0 ? readFileSync(skillFile(), "utf8") : "";
  const version = keylangVersion();
  const plan = planHarness({ selection, version, dir, skill, files: inputs });
  const targets: HarnessTarget[] = [];
  for (const file of plan.files) {
    const current = inputs.get(file.path) ?? null;
    const same = current === null ? file.text === null : file.text !== null && current.replace(/\r\n/g, "\n") === file.text.replace(/\r\n/g, "\n");
    targets.push({ path: file.path, category: harnessCategory(file.path), action: same ? "keep" : file.text === null ? "remove" : "write", text: file.text });
  }
  return { root, choice, selection, version, dir, targets, error: plan.error, inputs };
}

function readInputs(root: string): Map<string, string | null> {
  return new Map<string, string | null>(HARNESS_PATHS.map((path) => [path, existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null]));
}

/**
 * Why the plan may not be committed now (`path: reason` lines; empty when it
 * may): every harness path must still hold the bytes the plan read,
 * keylang.json must still name the same spec directory, a target must pass
 * the repository's write rules (a removal too: the entry must be inside the
 * repository with links followed), and `auto` must still detect the same
 * harnesses.
 */
export function agentsPlanProblems(plan: AgentsPlan): string[] {
  const problems: string[] = [];
  const now = readInputs(plan.root);
  for (const path of HARNESS_PATHS) {
    const before = plan.inputs.get(path) ?? null;
    const after = now.get(path) ?? null;
    if (before === after) continue;
    problems.push(`${path}: ${before === null ? "created" : after === null ? "removed" : "changed"} on disk while the integrations were planned; nothing written`);
  }
  const dir = specDir(plan.root);
  if (dir !== plan.dir) problems.push(`${CONFIG_FILE}: \`dir\` changed on disk while the integrations were planned (${plan.dir} → ${dir}); nothing written`);
  if (problems.length > 0) return problems;
  for (const target of plan.targets) {
    if (target.action === "keep") continue;
    const problem = target.action === "write" ? writeProblem(plan.root, target.path, { expect: plan.inputs.get(target.path) ?? null }) : targetProblem(plan.root, target.path);
    if (problem !== null) problems.push(`${target.path}: ${problem}`);
  }
  if (plan.choice === "auto") {
    const detected = detectHarnesses(diskProbe(plan.root));
    if (detected.join(",") !== plan.selection.harnesses.join(",")) {
      problems.push(`auto: the detected harnesses changed (${plan.selection.harnesses.join(", ") || "none"} → ${detected.join(", ") || "none"}); nothing written`);
    }
  }
  return problems;
}

/** One file step of a commit, with what became of it. */
export interface HarnessStep {
  path: string;
  category: HarnessCategory;
  action: "write" | "remove";
  state: "completed" | "failed" | "not-attempted";
  error?: string;
}

/**
 * Writes and removes the changed targets one by one, in plan order. A write
 * is atomic at the target (a link inside the repository is followed; CRLF of
 * the old file kept); a removal removes the entry itself, and only when the
 * entry is inside the repository with links followed — a harness directory
 * linked out of it is never emptied. The first error stops: that step is
 * `failed`, the rest `not-attempted`, nothing is rolled back. The signal is
 * checked between steps.
 */
export async function commitAgents(
  plan: AgentsPlan,
  options: { signal?: AbortSignal; onStep?: (step: { path: string; action: "write" | "remove" }) => void } = {},
): Promise<{ steps: HarnessStep[]; outcome: "completed" | "failed" | "cancelled" }> {
  const changed = plan.targets.filter((target) => target.action !== "keep");
  const steps: HarnessStep[] = changed.map((target) => ({ path: target.path, category: target.category, action: target.action === "remove" ? "remove" : "write", state: "not-attempted" }));
  for (const [i, target] of changed.entries()) {
    // One turn of the event loop between steps: a cancel sent to a worker arrives here.
    await new Promise<void>((done) => setImmediate(done));
    if (options.signal?.aborted) return { steps, outcome: "cancelled" };
    const step = steps[i]!;
    options.onStep?.({ path: step.path, action: step.action });
    const abs = join(plan.root, target.path);
    try {
      if (target.text === null) {
        const problem = targetProblem(plan.root, target.path);
        if (problem !== null) throw new Error(problem);
        rmSync(abs, { force: true });
      } else {
        const at = landing(abs);
        if (at === null) throw new Error("leads through a loop of links");
        writeAtomic(at, target.text);
      }
      step.state = "completed";
    } catch (error) {
      step.state = "failed";
      step.error = error instanceof Error ? error.message : String(error);
      return { steps, outcome: "failed" };
    }
  }
  return { steps, outcome: "completed" };
}
