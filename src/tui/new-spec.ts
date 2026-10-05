// A new hand-written specification (design §2.8): its kinds, the default
// path and the first text of each, and where a new file may go. The rules
// are the proposal rules: a Markdown file under the spec directory, not the
// generated map, the explained map or the store of saved explanations, no
// generated file, no directory, no link out of it. The session checks a
// path when the form is accepted and again at the first save.

import { basename, posix, win32 } from "node:path";
import { isSegment } from "../parser.ts";
import { proposalProblem } from "../proposals.ts";
import type { SpecKind } from "./state.ts";

/** The kinds in the order the form lists them, with their item text. */
export const SPEC_KINDS: readonly { kind: SpecKind; label: string }[] = [
  { kind: "flow", label: "flow      # flow <name>" },
  { kind: "rules", label: "rules     # rules" },
  { kind: "wiring", label: "wiring    # wiring" },
  { kind: "feature", label: "feature   ## <title>, prose" },
  { kind: "blank", label: "blank     empty Markdown" },
];

/** The path the form starts with: under the spec directory (`specDir`, relative and POSIX; "" is the root). */
export function defaultSpecPath(kind: SpecKind, specDir: string): string {
  const base = specDir === "" ? "" : `${specDir}/`;
  switch (kind) {
    case "flow":
      return `${base}flows/`;
    case "rules":
      return `${base}rules.md`;
    case "wiring":
      return `${base}wiring.md`;
    case "feature":
      return `${base}features/`;
    case "blank":
      return base;
  }
}

/** The flow name a path suggests: its file name without `.md`, when that is a valid name; else "". */
export function suggestedFlowName(path: string): string {
  const name = basename(path, ".md");
  return isSegment(name) ? name : "";
}

/** Why `name` cannot be a flow name, or null. The heading grammar takes one segment (format §Appendix A). */
export function flowNameProblem(name: string): string | null {
  if (name === "") return "a flow needs a name";
  return isSegment(name) ? null : `\`${name}\` is not a flow name: a letter or _ first, then letters, digits, _ or -`;
}

/**
 * The first text of a new file: only the heading its kind needs, no invented
 * IDs or planned nodes. `name` is the flow name (flow) or the title (feature).
 */
export function specTemplate(kind: SpecKind, name: string): string {
  switch (kind) {
    case "flow":
      return `# flow ${name}\n`;
    case "rules":
      return "# rules\n";
    case "wiring":
      return "# wiring\n";
    case "feature":
      return `## ${name}\n`;
    case "blank":
      return "";
  }
}

/**
 * Why `path` (relative to `root`, POSIX) cannot hold a new or opened
 * specification, or null. `specDir` is relative to the root and POSIX;
 * `generated` says whether the analysis knows the path as a generated
 * document. An existing file is no problem here: the form opens it.
 */
export function newSpecProblem(root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false): string | null {
  if (path === "") return "type a path";
  if (path.includes("\\") || posix.isAbsolute(path) || win32.isAbsolute(path)) return "not a plain relative path";
  if (!path.endsWith(".md")) return "not a Markdown spec: the path ends with .md";
  try {
    // The proposal gate already refuses the explained map, saved explanations and a directory at the path.
    return proposalProblem(root, specDir, path, generated)?.replace("a proposal changes specs only", "new specs go there") ?? null;
  } catch (error) {
    return `cannot be checked: ${error instanceof Error ? error.message : String(error)}`;
  }
}
