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
import type { FromWorker, ToWorker } from "../src/local-protocol.ts";
import { mountDirectory, mountFile } from "./shims/fs.ts";
import { WEB_TREE_SITTER } from "./shims/module.ts";

declare const KEYLANG_RESOURCES: Record<string, string>;
declare const KEYLANG_WEB_TREE_SITTER_VERSION: string;

/** Where the bundle's modules live (`import.meta.url` is rewritten to paths under it): the grammars and resources go beside them. */
const PACKAGE = "/keylang";

const post = (message: FromWorker): void => self.postMessage(message);

let read: ReadApi | null = null;

async function fetchBytes(name: string): Promise<Uint8Array> {
  const response = await fetch(new URL(name, self.location.href));
  if (!response.ok) throw new Error(`cannot load ${name}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function load(message: Extract<ToWorker, { type: "load" }>): Promise<void> {
  post({ type: "progress", text: "loading the grammars" });
  const grammars = await Promise.all(GRAMMARS.map(async (grammar) => [wasmFile(grammar), await fetchBytes(`wasm/${wasmFile(grammar)}`)] as const));
  for (const [file, bytes] of grammars) mountFile(`${PACKAGE}/src/wasm/${file}`, bytes);
  mountFile(`${PACKAGE}/src/wasm/grammars.json`, await fetchBytes("wasm/grammars.json"));
  for (const [name, text] of Object.entries(KEYLANG_RESOURCES)) mountFile(`${PACKAGE}/resources/${name}`, text);
  // The runtime's version is part of the snapshot ID, as on Node: the same code gives the same ID.
  mountFile(WEB_TREE_SITTER.replace(/[^/]+$/, "package.json"), JSON.stringify({ name: "web-tree-sitter", version: KEYLANG_WEB_TREE_SITTER_VERSION }));
  // `map.ts` hashes its extractor's code to key a fact cache, which the browser never keeps: an empty directory is enough.
  mountDirectory(`${PACKAGE}/src/extract`);
  const root = `/repo/${message.name.replace(/[\\/]/g, "_") || "repository"}`;
  for (const file of message.files) mountFile(`${root}/${file.path}`, new Uint8Array(file.data));
  mountDirectory(root);
  post({ type: "progress", text: `analysing ${message.files.length} files` });
  const started = performance.now();
  const done: Analysis = await analyze({ root, persistFacts: false, saveFacts: false });
  read = createReadApi({ root, analysis: async () => done, analyze: async () => done, showRoot: false });
  post({ type: "progress", text: `analysed in ${Math.round(performance.now() - started)} ms` });
  post({ type: "ready", root, files: message.files.length, nodes: Object.keys(done.snapshot?.nodes ?? {}).length, languages: [...done.config.languages] });
}

self.addEventListener("message", (event) => {
  const message = event.data as ToWorker;
  if (message.type === "load") {
    load(message).catch((error: unknown) => post({ type: "failed", error: error instanceof Error ? (error.stack ?? error.message) : String(error) }));
    return;
  }
  const api = read;
  if (api === null) {
    post({ type: "reply", id: message.id, reply: { status: 409, type: "application/json", text: JSON.stringify({ error: "no repository is open" }) } });
    return;
  }
  api
    .answer(message.path, new URLSearchParams(message.query))
    .then((answer) => post({ type: "reply", id: message.id, reply: { status: answer.status, type: answer.type, text: answer.body, ...(answer.file !== undefined ? { file: answer.file } : {}) } }))
    .catch((error: unknown) => post({ type: "reply", id: message.id, reply: { status: 500, type: "application/json", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) } }));
});
