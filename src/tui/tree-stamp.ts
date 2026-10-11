// The state of what an analysis read, as one string: the size and
// modification time of each file it read (sources, specs, keylang.json, the
// manifests, test reports and traces) and of each directory they lie in — a
// file added or removed changes its directory's time. Equal stamps mean the
// analysis would come out the same, so `keylang web` answers from the one it
// has instead of analysing again: a stamp costs milliseconds, an analysis
// seconds. Nothing outside these paths (`dist/`, other worktrees) is walked.

import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Analysis } from "../analyze.ts";
import { CONFIG_FILE, evidenceFiles } from "../config.ts";

/** Manifests an analysis reads at the root for declared packages. */
const MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "composer.json", "Cargo.toml"];

/** The files an analysis read, relative to the root, and their directories. */
export function inputsOf(done: Analysis): string[] {
  const files = new Set<string>([CONFIG_FILE, ...MANIFESTS, done.config.dir]);
  for (const file of done.snapshot?.manifest.files ?? []) files.add(file.path);
  for (const doc of done.docs) files.add(doc.path);
  // The briefs the explained map is written from.
  const briefs = `${done.config.dir}/explain/brief`;
  try {
    for (const name of readdirSync(join(done.config.root, briefs))) files.add(`${briefs}/${name}`);
  } catch {
    // No briefs.
  }
  for (const field of ["tests", "trace"] as const) {
    try {
      for (const file of evidenceFiles(done.config, field) ?? []) files.add(file);
    } catch {
      // A missing report is a state of the analysis, not of the stamp.
    }
  }
  const all = new Set<string>(["."]);
  for (const file of files) {
    all.add(file);
    for (let dir = dirname(file); dir !== "." && dir !== "/" && !all.has(dir); dir = dirname(dir)) all.add(dir);
  }
  return [...all].sort();
}

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
