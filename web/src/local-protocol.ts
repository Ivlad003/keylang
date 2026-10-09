// The messages between `app.html` (local.ts) and the analysis Worker
// (web/worker/analysis.ts). Types only: both sides import them.

export type ToWorker = { type: "load"; name: string; files: { path: string; data: ArrayBuffer }[] } | { type: "request"; id: number; path: string; query: string };

export type FromWorker =
  | { type: "progress"; text: string }
  | { type: "ready"; root: string; files: number; nodes: number; languages: string[] }
  | { type: "failed"; error: string }
  | { type: "reply"; id: number; reply: { status: number; type: string; text: string; file?: string } };
