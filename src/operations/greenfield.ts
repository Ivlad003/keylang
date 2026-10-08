// «Створити специфікацію» of `keylang web --new` (business-flows/29): the
// drawing of a new project as its first files. Nothing exists yet, so this is
// the one place keylang writes keylang.json itself — and only here: into a
// project without keylang.json, only files that do not exist (a link, even
// a dangling one, counts as one), every file through the write protocol of
// `safe-write.ts`, all checked before the first is written. Any target
// already there: nothing is written and the answer names it (`conflict`).
// A project that has keylang.json goes the way of every drawing: proposals
// (`diagram-propose.ts`).

import { lstatSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { CONFIG_FILE } from "../config.ts";
import { errorText } from "../diag.ts";
import { parseEditorModel } from "../diagram-proposal.ts";
import { GREENFIELD_LANGUAGES, greenfieldPlan, type GreenfieldPlan } from "../greenfield.ts";
import { safeWriteAll, targetProblem } from "../safe-write.ts";
import { FEATURE_SLUG } from "./feature.ts";

/** The spec directory of a project without keylang.json: the default `dir`. */
export const GREENFIELD_SPEC_DIR = "keylang";

/** The longest idea the dialog sends. */
export const MAX_IDEA = 20000;

export interface GreenfieldRequest {
  /** The project root (absolute). */
  root: string;
  /** `window.keylangEditor.currentModel()`, as JSON. */
  model: unknown;
  /** Keys of `GREENFIELD_LANGUAGES`: typescript, python, php, rust. */
  languages: unknown;
  /** The idea, prose for `keylang/README.md`. */
  idea?: unknown;
}

export interface GreenfieldResult {
  exitCode: 0 | 1 | 2;
  status: "written" | "conflict" | "invalid" | "failed";
  error: string | null;
  /** Written (or, on a conflict, the ones in the way), relative to the root. */
  files: string[];
  layers: string[];
  features: GreenfieldPlan["features"];
  notes: string[];
  /** The commands that come next. */
  next: string[];
}

function result(status: GreenfieldResult["status"], exitCode: 0 | 1 | 2, error: string | null, files: string[] = []): GreenfieldResult {
  return { exitCode, status, error, files, layers: [], features: [], notes: [], next: [] };
}

function exists(abs: string): boolean {
  try {
    lstatSync(abs);
    return true;
  } catch {
    return false;
  }
}

/** Whether a new project may be drawn here: the root has no keylang.json (not even a link of that name). */
export function greenfieldAvailability(root: string): { available: boolean; reason: string | null } {
  if (exists(join(root, CONFIG_FILE))) return { available: false, reason: `${CONFIG_FILE} is there: the project exists; draw on a view and «Запропонувати зміни»` };
  return { available: true, reason: null };
}

/** Why `path` cannot be a new file of the project, or null: it exists, a link included, or a file stands where a directory of it goes. */
function newFileProblem(root: string, path: string): string | null {
  if (exists(join(root, path))) return "already exists";
  const place = targetProblem(root, path);
  if (place !== null) return place;
  for (let dir = dirname(path); dir !== "." && dir !== ""; dir = dirname(dir)) {
    let entry;
    try {
      entry = statSync(join(root, dir));
    } catch {
      continue;
    }
    if (!entry.isDirectory()) return `${dir} is not a directory`;
  }
  return null;
}

/**
 * The drawing as the first files of the project. 2: the request is not one
 * (no lane, no language, a shape outside every lane); 1: the project has
 * keylang.json or a target is already there — nothing written; 0: written.
 */
export function runGreenfield(request: GreenfieldRequest): GreenfieldResult {
  const { root } = request;
  if (!isAbsolute(root)) return result("invalid", 2, "greenfield: root must be an absolute path");
  try {
    if (!statSync(root).isDirectory()) return result("invalid", 2, `${root}: not a directory`);
  } catch (error) {
    return result("failed", 2, errorText(error));
  }
  const available = greenfieldAvailability(root);
  if (!available.available) return result("conflict", 1, available.reason, [CONFIG_FILE]);
  const model = parseEditorModel(request.model);
  if (typeof model === "string") return result("invalid", 2, model);
  if (!Array.isArray(request.languages) || !request.languages.every((name) => typeof name === "string")) return result("invalid", 2, `languages: an array of ${Object.keys(GREENFIELD_LANGUAGES).join(", ")}`);
  const idea = request.idea ?? "";
  if (typeof idea !== "string") return result("invalid", 2, "idea: text");
  if (idea.length > MAX_IDEA) return result("invalid", 2, `idea: at most ${MAX_IDEA} characters`);
  const plan = greenfieldPlan({ model, languages: request.languages as string[], idea, specDir: GREENFIELD_SPEC_DIR });
  if (typeof plan === "string") return result("invalid", 2, plan);
  const badSlug = plan.features.find((feature) => !FEATURE_SLUG.test(feature.slug));
  if (badSlug) return result("invalid", 2, `process \`${badSlug.slug}\`: a feature's name is Latin letters, digits, . _ or - — rename its trigger (the last part of its ID names the process)`);
  // Every target checked before the first write: one in the way, and nothing is written.
  const blocked = plan.files.map((file) => ({ path: file.path, problem: newFileProblem(root, file.path) })).filter((file) => file.problem !== null);
  if (blocked.length > 0) {
    return result("conflict", 1, `nothing written: ${blocked.map((file) => `${file.path}: ${file.problem}`).join("; ")}`, blocked.map((file) => file.path));
  }
  try {
    safeWriteAll(root, plan.files.map((file) => ({ path: file.path, text: file.text, options: { expect: null } })));
  } catch (error) {
    return result("failed", 2, errorText(error));
  }
  return {
    exitCode: 0,
    status: "written",
    error: null,
    files: plan.files.map((file) => file.path),
    layers: plan.layers,
    features: plan.features,
    notes: plan.notes,
    next: ["keylang agents --agents=claude", ...plan.features.map((feature) => `keylang feature ${feature.slug}`), "keylang map", "keylang check"],
  };
}
