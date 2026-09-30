// What a buffer's text gives: its parsed spec, its lines, and each line cut
// into clusters with their widths. `setText` is the one way a session changes
// a buffer's text: it bumps `version`, so work that finishes later (a ghost
// line, speech, a draft) can tell whether the text it was made for is still
// there. Lines and their layouts are cached per text: a key costs one pass
// over the line it changes, not a pass per column (review 2026-09-28).

import { extname } from "node:path";
import type { Document } from "../ir.ts";
import { parse } from "../parser.ts";
import type { Buffer } from "./state.ts";
import { layoutLine, type LineLayout } from "./width.ts";

/** The parsed spec of a buffer; `keylang.json` is plain text. */
export function docOf(path: string, text: string): Document | null {
  return extname(path) === ".md" ? parse(path, text) : null;
}

/** A buffer for `path` with `text` (already `\n`-ended) as both its text and what is saved. */
export function newBuffer(path: string, text: string, eol: Buffer["eol"], disk: string | null): Buffer {
  const doc = docOf(path, text);
  return { path, text, saved: text, readOnly: doc !== null && doc.generated !== null, eol, disk, newFile: false, overwrite: false, doc, undo: [], version: 0 };
}

/** A new specification with `text` and no file on disk: unsaved until its first save, even when `text` is empty. */
export function newFileBuffer(path: string, text: string): Buffer {
  return { ...newBuffer(path, text, "\n", null), saved: "", newFile: true };
}

/** Unsaved: the text differs from the disk, or there is no file yet. */
export function isDirty(buffer: Buffer): boolean {
  return buffer.newFile || buffer.text !== buffer.saved;
}

export function setText(buffer: Buffer, text: string): void {
  buffer.text = text;
  buffer.doc = docOf(buffer.path, text);
  buffer.version++;
}

interface Cached {
  text: string;
  lines: string[];
  layouts: Map<number, LineLayout>;
}

const cache = new WeakMap<Buffer, Cached>();

function cached(buffer: Buffer): Cached {
  const entry = cache.get(buffer);
  // The same string is compared by reference first: an unchanged buffer costs nothing here.
  if (entry && entry.text === buffer.text) return entry;
  const fresh = { text: buffer.text, lines: buffer.text.split("\n"), layouts: new Map<number, LineLayout>() };
  cache.set(buffer, fresh);
  return fresh;
}

export function bufferLines(buffer: Buffer): readonly string[] {
  return cached(buffer).lines;
}

/** The layout of line `index` (0-based); a line past the end is empty. */
export function lineLayout(buffer: Buffer, index: number): LineLayout {
  const entry = cached(buffer);
  let layout = entry.layouts.get(index);
  if (!layout) {
    layout = layoutLine(entry.lines[index] ?? "");
    // A long session scrolls through many lines; the cache holds the recent ones.
    if (entry.layouts.size > 512) entry.layouts.clear();
    entry.layouts.set(index, layout);
  }
  return layout;
}
