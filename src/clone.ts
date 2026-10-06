// `keylang clone <source>`: a repository someone names by URL (or a local
// path) becomes a shallow clone in keylang's cache, which `init`, `map` and
// `explain` then work on like any checkout. Git runs as an argument array,
// never through a shell, with its credential prompt off so a private URL fails
// instead of waiting for a password nobody can type.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { gitUnavailable } from "./git-changes.ts";
import { writeAtomic } from "./safe-write.ts";

/** What to clone and where it sits under the cache root. */
export interface RepoSource {
  /** What git clones: the URL as given, or an absolute local path. */
  url: string;
  /** Path segments under the cache root: host and path for a URL, `local/<name>-<hash>` for a path. */
  key: string[];
}

/** How far `clone --explain` goes past the map. */
export type CloneExplain = "map-only" | "map-and-ai" | "all";

export const CLONE_EXPLAIN_MODES: readonly CloneExplain[] = ["map-only", "map-and-ai", "all"];

export function isCloneExplain(text: string): text is CloneExplain {
  return (CLONE_EXPLAIN_MODES as readonly string[]).includes(text);
}

/** Marks a directory keylang cloned: only such a directory is ever reset to the remote. */
export const CLONE_MARKER = ".keylang/clone.json";

const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;
const SCP_LIKE = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/;

/**
 * Reads a clone source: an `http(s)://`, `ssh://`, `git://` or `file://` URL,
 * the scp form `git@host:owner/repo.git`, or a path to a local repository.
 * The key never holds credentials, `..` or characters a file name cannot carry.
 */
export function parseRepoSource(text: string, cwd: string): RepoSource | { error: string } {
  const source = text.trim();
  if (source === "") return { error: "clone: a repository URL or path is required" };
  if (source.startsWith("-")) return { error: `clone: \`${source}\` is not a repository URL` };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) return fromUrl(source);
  const local = resolve(cwd, source);
  if (existsSync(local)) {
    if (!statSync(local).isDirectory()) return { error: `clone: ${source} is not a directory` };
    const hash = createHash("sha256").update(local).digest("hex").slice(0, 8);
    return { url: local, key: ["local", `${placeable(basename(local)) ?? "repo"}-${hash}`] };
  }
  const scp = SCP_LIKE.exec(source);
  if (scp !== null) return keyed(source, scp[1]!, scp[2]!);
  return { error: `clone: \`${source}\` is neither a URL nor an existing directory` };
}

function fromUrl(source: string): RepoSource | { error: string } {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return { error: `clone: \`${source}\` is not a valid URL` };
  }
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (scheme === "file") return parseRepoSource(decodeURIComponent(url.pathname), "/");
  if (!["https", "http", "ssh", "git"].includes(scheme)) return { error: `clone: the ${scheme}:// scheme is not supported; use https, ssh, git or file` };
  const host = url.port === "" ? url.hostname : `${url.hostname}_${url.port}`;
  return keyed(source, host, decodeURIComponent(url.pathname));
}

function keyed(url: string, host: string, path: string): RepoSource | { error: string } {
  const segments = path.split("/").filter((segment) => segment !== "");
  const last = segments.pop()?.replace(/\.git$/, "");
  if (last === undefined || last === "") return { error: `clone: \`${url}\` names no repository` };
  const key = [host.toLowerCase(), ...segments, last];
  const bad = key.find((segment) => placeable(segment) === undefined);
  if (bad !== undefined) return { error: `clone: \`${bad}\` in \`${url}\` cannot be a directory name; pass --dir` };
  return { url, key };
}

function placeable(segment: string): string | undefined {
  return SAFE_SEGMENT.test(segment) && segment !== "." && segment !== ".." ? segment : undefined;
}

/** `$XDG_CACHE_HOME/keylang/repos`, else `~/.cache/keylang/repos`. */
export function cloneCacheRoot(env: Readonly<Record<string, string | undefined>>, home: string): string {
  const cache = env.XDG_CACHE_HOME !== undefined && env.XDG_CACHE_HOME !== "" ? env.XDG_CACHE_HOME : join(home, ".cache");
  return join(cache, "keylang", "repos");
}

export interface CloneSync {
  action: "cloned" | "updated";
  dir: string;
}

/**
 * Clones `source` into `dir`, or brings a clone keylang made there up to the
 * remote's default branch. A directory keylang did not clone is never touched:
 * the reset would drop its work.
 */
export function syncClone(source: RepoSource, dir: string): CloneSync {
  if (!existsSync(dir) || (statSync(dir).isDirectory() && readdirSync(dir).length === 0)) {
    mkdirSync(dirname(dir), { recursive: true });
    git(dirname(dir), ["clone", "--quiet", "--depth", "1", "--", source.url, dir]);
    writeAtomic(join(dir, CLONE_MARKER), `${JSON.stringify({ url: source.url, key: source.key }, null, 2)}\n`);
    return { action: "cloned", dir };
  }
  const cloned = readMarker(dir);
  if (cloned === undefined) throw new Error(`clone: ${dir} exists and keylang did not clone it; pass another --dir`);
  // The same repository spelled another way (`.git`, scp form, ssh) has the same key; fetch goes to the first URL's origin.
  if (cloned.key.join("/") !== source.key.join("/")) throw new Error(`clone: ${dir} is a clone of ${cloned.url}, not ${source.url}; pass another --dir`);
  git(dir, ["fetch", "--quiet", "--depth", "1", "origin", "HEAD"]);
  git(dir, ["reset", "--quiet", "--hard", "FETCH_HEAD"]);
  return { action: "updated", dir };
}

function readMarker(dir: string): { url: string; key: string[] } | undefined {
  const marker = join(dir, CLONE_MARKER);
  if (!existsSync(marker)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(marker, "utf8"));
    if (typeof parsed !== "object" || parsed === null || !("url" in parsed) || typeof parsed.url !== "string") return undefined;
    const key = "key" in parsed && Array.isArray(parsed.key) && parsed.key.every((segment) => typeof segment === "string") ? (parsed.key as string[]) : undefined;
    return { url: parsed.url, key: key ?? [parsed.url] };
  } catch {
    // An unreadable marker is no proof keylang made the directory.
  }
  return undefined;
}

function git(cwd: string, args: string[]): void {
  // `ext::` would run a command named in the URL; a URL from outside must never do that.
  const out = spawnSync("git", ["-c", "protocol.ext.allow=never", ...args], {
    cwd,
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (out.error) throw new Error(gitUnavailable("clone", out.error));
  if (out.status !== 0) throw new Error(`clone: git ${args[0]}: ${out.stderr.trim().split("\n").at(-1) ?? `exit ${out.status}`}`);
}

/**
 * Turns on the explained map (`"explain": {"map": true}`) in the clone's
 * keylang.json; the rest of the file stays. Returns an error to name, or null.
 */
export function enableExplainedMap(root: string): string | null {
  const file = join(root, "keylang.json");
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return `keylang.json: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) return "keylang.json: not a JSON object";
  const record = config as Record<string, unknown>;
  const explain = record.explain;
  if (explain !== undefined && (typeof explain !== "object" || explain === null || Array.isArray(explain))) return "keylang.json: `explain` is not an object";
  if ((explain as Record<string, unknown> | undefined)?.map === true) return null;
  record.explain = { ...(explain as Record<string, unknown> | undefined), map: true };
  writeAtomic(file, `${JSON.stringify(record, null, 2)}\n`);
  return null;
}
