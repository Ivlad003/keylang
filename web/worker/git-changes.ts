// src/git-changes.ts as the worker bundles it (scripts/build-web.mjs puts this
// module in its place): the same functions, answered synchronously from what
// web/worker/git.ts prepared with isomorphic-git before the request, instead
// of the git CLI. A question nothing was prepared for is an error that says
// so, never an empty answer. The pure helpers are the module's own.

import type * as cli from "../../src/git-changes.ts";
import { preparedFor, type PreparedRef } from "./git.ts";

// The module itself (the build resolves this name to src/git-changes.ts): its helpers run no git.
export { changedPathSet, deletedModuleIds, diskCaseResolver, gitUnavailable, type ChangedFiles, type GitSummary } from "keylang-git-changes";

function state(root: string, label: string) {
  const found = preparedFor(root);
  if (found === null) throw new Error(`${label}: git was not read for this folder in the browser`);
  if (found.unavailable !== null) throw new Error(`${label}: ${found.unavailable}`);
  return found;
}

function refOf(root: string, ref: string, label: string): PreparedRef {
  if (ref.startsWith("-")) throw new Error(`${label}: \`${ref}\` is not a git ref`);
  const found = state(root, label).refs.get(ref);
  if (!found) throw new Error(`${label}: git was not read for \`${ref}\` in the browser`);
  return found;
}

export const gitSummary: typeof cli.gitSummary = (root, label) => state(root, label).summary!;

export const featureBaseOrigin: typeof cli.featureBaseOrigin = (root, label) => state(root, label).base!;

export const gitChangedFiles: typeof cli.gitChangedFiles = (root, ref, label = "check --changed") => {
  const changed = refOf(root, ref, label).changed;
  if (changed === null) throw new Error(`${label}: \`${ref}\` is not a commit`);
  return { paths: new Set(changed.paths), deleted: [...changed.deleted], unborn: changed.unborn };
};

export const gitFileAt: typeof cli.gitFileAt = (root, ref, path, label) => {
  const at = refOf(root, ref, label);
  if (at.changed === null) throw new Error(`${label}: \`${ref}\` is not a commit`);
  if (at.changed.unborn) return null;
  if (!at.files.has(path)) throw new Error(`${label}: git was not read for ${path} at \`${ref}\` in the browser`);
  return at.files.get(path)!;
};

export const gitSpecFilesAt: typeof cli.gitSpecFilesAt = (root, ref, dir, label, skip = () => false) => {
  const at = refOf(root, ref, label);
  if (at.changed === null) throw new Error(`${label}: \`${ref}\` is not a commit`);
  if (at.changed.unborn) return new Map();
  const files = at.specs.get(dir);
  if (!files) throw new Error(`${label}: git was not read for ${dir}/ at \`${ref}\` in the browser`);
  return new Map([...files].filter(([path]) => !skip(path)));
};

// What the read-only page never asks: the line ranges of `code-to-spec --since` and a feature's base report.
export const gitChangedLines: typeof cli.gitChangedLines = (_root, _ref, label = "code-to-spec --since") => {
  throw new Error(`${label}: not available in the browser`);
};

export const readFeatureBase: typeof cli.readFeatureBase = (_root, _path, _since, label) => {
  throw new Error(`${label}: not available in the browser`);
};
