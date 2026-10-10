// The messages between `app.html` (local.ts) and the analysis Worker
// (web/worker/analysis.ts). Types only: both sides import them.

/**
 * `files` are read; `unread` are in the folder but not read (binary, too large): git still needs to
 * know they exist, and whether they changed (by size and modification time, as git's stat check).
 * `mtime` is `File.lastModified`, ms.
 */
export type ToWorker =
  | { type: "load"; name: string; files: { path: string; data: ArrayBuffer; mtime: number }[]; unread: UnreadFile[] }
  | { type: "request"; id: number; path: string; query: string };

export interface UnreadFile {
  path: string;
  size: number;
  mtime: number;
  /** By its extension: a binary file, whose change `diff --unified=0` shows without a hunk. */
  binary: boolean;
}

export type FromWorker =
  | { type: "progress"; text: string }
  | { type: "ready"; root: string; files: number; nodes: number; languages: string[] }
  | { type: "failed"; error: string }
  | { type: "reply"; id: number; reply: { status: number; type: string; text: string; file?: string } };
