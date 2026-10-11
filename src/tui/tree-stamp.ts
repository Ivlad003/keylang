// The state of what an analysis read, as one string: the size and
// modification time of each file it read (sources, specs, keylang.json, the
// manifests, test reports and traces) and of each directory they lie in — a
// file added or removed changes its directory's time. Equal stamps mean the
// analysis would come out the same, so `keylang web` answers from the one it
// has instead of analysing again: a stamp costs milliseconds, an analysis
// seconds. Nothing outside these paths (`dist/`, other worktrees) is walked.
//
// Layer: TUI/web. `web.ts` calls `inputsOf` once per analysis and `stampOf` per request.

import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Analysis } from "../analyze.ts";
import { CONFIG_FILE, evidenceFiles } from "../config.ts";
import { schemaFiles } from "../schema-discover.ts";

/** Manifests an analysis reads at the root for declared packages. */
const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "composer.json", "Cargo.toml"];

/** The files an analysis read, relative to the root, and their directories. */
export function inputsOf(done: Analysis): string[] {
  // The fixed inputs: the config, the root manifests and the spec directory itself.
  const files = new Set<string>([CONFIG_FILE, ...MANIFESTS, done.config.dir]);

  // The sources and specs the snapshot was built from.
  for (const file of done.snapshot?.manifest.files ?? []) files.add(file.path);

  for (const doc of done.docs) files.add(doc.path);

  // The schemas the system of the code reads its tables from.
  for (const file of schemaFiles(done)) files.add(file);
  // The briefs the explained map is written from.
  const briefs = `${done.config.dir}/explain/brief`;

  try {
    for (const name of readdirSync(join(done.config.root, briefs))) files.add(`${briefs}/${name}`);
  } catch {
    // No briefs.
  }

  // Test reports and traces named in keylang.json.
  for (const field of ["tests", "trace"] as const) {
    try {
      for (const file of evidenceFiles(done.config, field) ?? []) files.add(file);
    } catch {
      // A missing report is a state of the analysis, not of the stamp.
    }
  }

  // Add every ancestor directory, so a file created or deleted beside an input
  // changes the stamp through its directory's mtime. Sorted, so the hash is stable.
  const all = new Set<string>(["."]);

  for (const file of files) {
    all.add(file);

    for (let dir = dirname(file); dir !== "." && dir !== "/" && !all.has(dir); dir = dirname(dir)) all.add(dir);
  }

  return [...all].sort();
}

/** A sha256 over the size and mtime of each input under `root`; a missing path hashes as `-`, so its appearance changes the stamp too. */
export function stampOf(root: string, inputs: readonly string[]): string {
  const hash = createHash("sha256");

  for (const path of inputs) {
    try {
      const stat = statSync(join(root, path));
      hash.update(`${path}\0${stat.size}\0${stat.mtimeMs}\n`);
    } catch {
      hash.update(`${path}\0-\n`);
    }
  }

  return hash.digest("hex");
}
