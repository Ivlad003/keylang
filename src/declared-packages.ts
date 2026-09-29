// Packages a repository declares, as `external.<segment>` ids. A rule may name
// one before any file imports it. Python manifests are not read: a package
// known only from an import disappears with that file.
// A missing manifest is skipped. One that cannot be read, or whose JSON or
// TOML is invalid, is an error that names the file and the field.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { layerName } from "./config.ts";

const PACKAGE_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
const CRATE_FIELDS = ["dependencies", "dev-dependencies", "build-dependencies"] as const;

/** `external.<segment>` for every package declared in a JS or Rust manifest under `root`. */
export function declaredExternalIds(root: string): ReadonlySet<string> {
  const ids = new Set<string>();
  const add = (pkg: string): void => {
    if (pkg === "") return;
    ids.add(`external.${layerName(pkg.replace(/^@/, "").replace("/", "-"))}`);
  };
  let paths: string[] = [];
  try {
    paths = readdirSync(root, { recursive: true, encoding: "utf8" });
  } catch {
    return ids;
  }
  for (const rel of paths) {
    const posix = rel.split("\\").join("/");
    const parts = posix.split("/");
    // A manifest inside a dependency tree declares that package's own dependencies, not this repo's.
    if (parts.includes("node_modules") || parts.includes(".git") || parts.includes("target")) continue;
    const abs = join(root, rel);
    if (posix === "package.json" || posix.endsWith("/package.json")) addPackages(posix, readText(abs, posix), add);
    else if (posix === "Cargo.toml" || posix.endsWith("/Cargo.toml")) addCrates(posix, readText(abs, posix), add);
  }
  return ids;
}

/** The file is there but cannot be read. That is not the same error as invalid contents. */
function readText(path: string, rel: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    throw new Error(`${rel}: cannot read${code === "" ? "" : ` (${code})`}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function table(rel: string, field: string, value: unknown, kind: "object" | "table"): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${rel}: \`${field}\` must be ${kind === "object" ? "an object" : "a table"}, got ${JSON.stringify(value)}`);
  return value;
}

/** `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`. Not `node_modules`. */
function addPackages(rel: string, text: string, add: (pkg: string) => void): void {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${rel}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${rel}: the document must be an object, got ${JSON.stringify(value)}`);
  for (const key of PACKAGE_FIELDS) {
    const names = table(rel, key, key in value ? value[key] : undefined, "object");
    if (names === undefined) continue;
    for (const name of Object.keys(names)) add(name);
  }
}

/** `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, and the same under `[target.*]`. */
function addCrates(rel: string, text: string, add: (pkg: string) => void): void {
  let value: unknown;
  try {
    value = parseToml(text);
  } catch (error) {
    throw new Error(`${rel}: invalid TOML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${rel}: the document must be a table, got ${JSON.stringify(value)}`);
  // A workspace file without `[package]` is not a crate manifest.
  if (!isRecord(value.package)) return;
  const targets = table(rel, "target", "target" in value ? value.target : undefined, "table");
  const nested = targets === undefined ? [] : Object.entries(targets).flatMap(([name, item]) => {
    const crate = table(rel, `target.${name}`, item, "table");
    return crate === undefined ? [] : crateTables(rel, crate, `target.${name}.`);
  });
  for (const names of [...crateTables(rel, value, ""), ...nested]) {
    for (const [key, dep] of Object.entries(names)) {
      const renamed = isRecord(dep) && typeof dep.package === "string" ? dep.package : key;
      add(renamed);
    }
  }
}

function crateTables(rel: string, source: Record<string, unknown>, prefix: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const key of CRATE_FIELDS) {
    const names = table(rel, `${prefix}${key}`, key in source ? source[key] : undefined, "table");
    if (names !== undefined) out.push(names);
  }
  return out;
}
