// The analysis in the browser (`app.html`): a Worker that runs keylang's own
// pipeline — `analyze`, then the read API — over a folder the person opened,
// held in memory by the `node:fs` shim. The page sends `load` with the files,
// then `request`s as it would send HTTP requests to `keylang web`; the worker
// answers each with what the server would. Nothing leaves the tab: no
// network but the worker's own assets (the grammar WASM files), no git, no
// model, and the files are read-only.

import { analyze, type Analysis } from "../../src/analyze.ts";
import { GRAMMARS, wasmFile } from "../../src/extract/grammars.ts";
import { createReadApi, type ReadApi } from "../../src/tui/read-api.ts";
import { prepareGit, setUnread } from "./git.ts";
import type { FromWorker, ToWorker } from "../src/local-protocol.ts";
import { mountDirectory, mountFile } from "./shims/fs.ts";
import { WEB_TREE_SITTER } from "./shims/module.ts";

declare const KEYLANG_RESOURCES: Record<string, string>;

declare const KEYLANG_WEB_TREE_SITTER_VERSION: string;

/** Where the bundle's modules live (`import.meta.url` is rewritten to paths under it): the grammars and resources go beside them. */
const PACKAGE = "/keylang";

const post = (message: FromWorker): void => self.postMessage(message);

/** The read API over the loaded analysis; `null` until a `load` has finished. */
let read: ReadApi | null = null;

/** The text a `failed` message carries: the stack when there is one, so the page can show where the analysis broke. */
function failureText(cause: unknown): string {
  return cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
}

/** The open folder's root and spec directory, for the git the «Зміни» tab asks. */
let opened: { root: string; specDir: string } | null = null;

/** Fetches one of the worker's own assets (a grammar WASM file, its manifest) relative to the worker script. */
async function fetchBytes(name: string): Promise<Uint8Array> {
  const response = await fetch(new URL(name, self.location.href));

  if (!response.ok) throw new Error(`cannot load ${name}: ${response.status}`);

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Mounts the runtime assets and the opened folder into the in-memory file
 * system, runs `analyze` over it once, and keeps a read API that answers every
 * later request from that one analysis.
 */
async function load(message: Extract<ToWorker, { type: "load" }>): Promise<void> {
  // Grammars first: the extractors load them from beside the bundle, as they would from the npm package.
  post({ type: "progress", text: "loading the grammars" });

  const grammars = await Promise.all(GRAMMARS.map(async (grammar) => [wasmFile(grammar), await fetchBytes(`wasm/${wasmFile(grammar)}`)] as const));

  for (const [file, bytes] of grammars) mountFile(`${PACKAGE}/src/wasm/${file}`, bytes);
  mountFile(`${PACKAGE}/src/wasm/grammars.json`, await fetchBytes("wasm/grammars.json"));

  for (const [name, text] of Object.entries(KEYLANG_RESOURCES)) mountFile(`${PACKAGE}/resources/${name}`, text);
  // The runtime's version is part of the snapshot ID, as on Node: the same code gives the same ID.
  mountFile(WEB_TREE_SITTER.replace(/[^/]+$/, "package.json"), JSON.stringify({ name: "web-tree-sitter", version: KEYLANG_WEB_TREE_SITTER_VERSION }));
  // `map.ts` hashes its extractor's code to key a fact cache, which the browser never keeps: an empty directory is enough.
  mountDirectory(`${PACKAGE}/src/extract`);

  // The folder goes under /repo/<name>, with path separators in the name flattened so it stays one segment.
  const root = `/repo/${message.name.replace(/[\\/]/g, "_") || "repository"}`;

  for (const file of message.files) mountFile(`${root}/${file.path}`, new Uint8Array(file.data), file.mtime);
  mountDirectory(root);
  setUnread(root, message.unread);
  post({ type: "progress", text: `analysing ${message.files.length} files` });

  // Nothing is persisted in the browser, so facts are neither saved nor reused; the folder is read-only and the analysis is final.
  const started = performance.now();
  const done: Analysis = await analyze({ root, persistFacts: false, saveFacts: false });
  read = createReadApi({ root, analysis: async () => done, analyze: async () => done, showRoot: false });
  opened = { root, specDir: done.config.dir };
  post({ type: "progress", text: `analysed in ${Math.round(performance.now() - started)} ms` });
  post({ type: "ready", root, files: message.files.length, nodes: Object.keys(done.snapshot?.nodes ?? {}).length, languages: [...done.config.languages] });
}

// One handler for both kinds of message: `load` (re)opens a folder, anything else is a request answered like the HTTP API.
self.addEventListener("message", (event) => {
  // SAFETY: the page's local.ts is the worker's only sender, and it posts `ToWorker` messages alone.
  const message = event.data as ToWorker;

  if (message.type === "load") {
    load(message).catch((cause: unknown) => post({ type: "failed", error: failureText(cause) }));

    return;
  }

  const api = read;

  // A request before a finished load gets the same 409 the server gives without a repository.
  if (api === null) {
    post({ type: "reply", id: message.id, reply: { status: 409, type: "application/json", text: JSON.stringify({ error: "no repository is open" }) } });

    return;
  }

  const query = new URLSearchParams(message.query);
  // Git is read with isomorphic-git ahead of the questions src/git-changes.ts asks, which are synchronous.
  const ready = opened !== null && (message.path === "/api/git" || message.path === "/api/changes") ? prepareGit(opened.root, message.path === "/api/changes" ? query.get("since") : null, opened.specDir) : Promise.resolve();
  ready
    .then(() => api.answer(message.path, query))
    .then((answer) => {
      // The reply mirrors an HTTP response; `file` is only set for answers that name a source file.
      const reply: Extract<FromWorker, { type: "reply" }>["reply"] = { status: answer.status, type: answer.type, text: answer.body };

      if (answer.file !== undefined) reply.file = answer.file;
      post({ type: "reply", id: message.id, reply });
    })
    .catch((cause: unknown) => post({ type: "reply", id: message.id, reply: { status: 500, type: "application/json", text: JSON.stringify({ error: cause instanceof Error ? cause.message : String(cause) }) } }));
});
