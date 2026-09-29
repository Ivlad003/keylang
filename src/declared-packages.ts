// Packages a repository declares, as `external.<segment>` ids. A rule may name
// one before any file imports it. Python manifests are not read: a package
// known only from an import disappears with that file.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { layerName } from "./config.ts";

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
    if (posix === "package.json" || posix.endsWith("/package.json")) addPackages(readText(abs), add);
    else if (posix === "Cargo.toml" || posix.endsWith("/Cargo.toml")) addCrates(readText(abs), add);
  }
  return ids;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`. Not `node_modules`. */
function addPackages(text: string | null, add: (pkg: string) => void): void {
  if (text === null) return;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return;
  }
  if (!isRecord(value)) return;
  for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const table = value[key];
    if (!isRecord(table)) continue;
    for (const name of Object.keys(table)) add(name);
  }
}

/** `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, and the same under `[target.*]`. */
function addCrates(text: string | null, add: (pkg: string) => void): void {
  if (text === null) return;
  let value: unknown;
  try {
    value = parseToml(text);
  } catch {
    return;
  }
  if (!isRecord(value) || !isRecord(value.package)) return;
  const targets = isRecord(value.target) ? Object.values(value.target).filter(isRecord) : [];
  const tables = [value, ...targets].flatMap((table) => [table.dependencies, table["dev-dependencies"], table["build-dependencies"]]);
  for (const table of tables) {
    if (!isRecord(table)) continue;
    for (const [key, dep] of Object.entries(table)) {
      const renamed = isRecord(dep) && typeof dep.package === "string" ? dep.package : key;
      add(renamed);
    }
  }
}
