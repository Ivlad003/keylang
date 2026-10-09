// `keylang web --export <dir>`: the diagram page of one repository as a
// static site. Every answer the read-only page can ask for — the views, each
// diagram and its BPMN/draw.io file, the calls and usages of each ID, the
// coverage, the tour, the map and the explained map — is computed once by the
// same `read-api.ts` the server answers with, and written as script files
// (`data/<shard>.js`) the page loads with `<script>`: that works from
// `file://` too, where `fetch` does not. `app.html` beside it is the analysis
// in the browser (a folder the person opens), which needs http(s).

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Analysis } from "../analyze.ts";
import { keylangVersion } from "../harness.ts";
import { compareText } from "../span.ts";
import { createReadApi, keyShard, requestKey, type ReadAnswer } from "./read-api.ts";
import { BUILT_DIR, diagramsPage, ensureClient } from "./web.ts";

/** The file that marks a directory as a keylang export: only such a directory is written over. */
export const EXPORT_MARKER = ".keylang-export.json";
/** The files of the built client a site needs (`scripts/build-web.mjs` writes the list). */
const SITE_MANIFEST = "site.json";
/** About this many bytes of answers per data shard. */
const SHARD_BYTES = 256 * 1024;

export interface ExportResult {
  out: string;
  answers: number;
  shards: number;
  files: number;
}

/** Why `out` may not take an export of `root`, or null. */
export function exportTargetProblem(root: string, out: string): string | null {
  const rel = relative(out, root);
  const outside = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (!outside) return "the export would hold the repository itself; choose a directory outside it or below it";
  if (!existsSync(out)) return null;
  if (!statSync(out).isDirectory()) return "not a directory";
  if (readdirSync(out).length > 0 && !existsSync(join(out, EXPORT_MARKER))) return `not empty and no keylang export (no ${EXPORT_MARKER}): nothing is written over`;
  return null;
}

/**
 * Every request the read-only page makes, in a stable order: the views,
 * coverage, tour and docs; each doc; each diagram with its two export files;
 * the calls and usages of every ID of the snapshot and of the diagrams.
 */
async function requests(done: Analysis, answer: (path: string, query: URLSearchParams) => Promise<ReadAnswer>): Promise<{ key: string; answer: ReadAnswer }[]> {
  const out: { key: string; answer: ReadAnswer }[] = [];
  const ask = async (path: string, query: Record<string, string> = {}): Promise<ReadAnswer> => {
    const params = new URLSearchParams(query);
    const got = await answer(path, params);
    out.push({ key: requestKey(path, params), answer: got });
    return got;
  };
  const views = JSON.parse((await ask("/api/views")).body) as {
    flows: string[];
    entries: { id: string }[];
    layers: string[];
    domains?: string[];
    discovered?: { name: string }[];
  };
  await ask("/api/coverage");
  await ask("/api/tour");
  const docs = JSON.parse((await ask("/api/docs")).body) as { files: { path: string }[] };
  for (const file of docs.files) await ask("/api/doc", { path: file.path });
  const queries: Record<string, string>[] = [
    ...views.flows.map((name) => ({ view: "flow", name })),
    ...(views.discovered ?? []).map((flow) => ({ view: "discovered", name: flow.name })),
    ...views.entries.map((entry) => ({ view: "entry", id: entry.id })),
    ...(views.layers.length > 0 ? [{ view: "layers" }] : []),
    ...(views.domains ?? []).map((domain) => ({ view: "process", domain })),
  ];
  const ids = new Set(Object.keys(done.snapshot?.nodes ?? {}));
  for (const query of queries) {
    const diagram = await ask("/api/diagram", query);
    if (diagram.status === 200) for (const node of (JSON.parse(diagram.body) as { nodes: { ref?: { id?: string } }[] }).nodes) if (node.ref?.id) ids.add(node.ref.id);
    for (const format of ["bpmn", "drawio"]) await ask("/api/export", { ...query, format });
  }
  for (const id of [...ids].sort(compareText)) {
    await ask("/api/calls", { id });
    await ask("/api/usages", { id });
  }
  return out;
}

/** The answers in shards of about `SHARD_BYTES`, each a script that hands its answers to the page. */
function shardTexts(answers: readonly { key: string; answer: ReadAnswer }[]): string[] {
  const total = answers.reduce((sum, item) => sum + item.key.length + item.answer.body.length, 0);
  const count = Math.min(4096, Math.max(1, Math.ceil(total / SHARD_BYTES)));
  const shards: Record<string, ReadAnswer>[] = Array.from({ length: count }, () => ({}));
  for (const { key, answer } of answers) shards[keyShard(key, count)]![key] = answer;
  return shards.map((shard) => `keylangData(${JSON.stringify(shard)});\n`);
}

/** The built files of the page and of `app.html`, as `scripts/build-web.mjs` lists them. */
function siteAssets(): string[] {
  const manifest = join(BUILT_DIR, SITE_MANIFEST);
  if (!existsSync(manifest)) throw new Error(`the diagram client is not built (no ${manifest}): run \`npm run web:build\``);
  const files = JSON.parse(readFileSync(manifest, "utf8")) as unknown;
  if (!Array.isArray(files) || !files.every((file) => typeof file === "string" && /^[\w.@/-]+$/.test(file) && !file.includes(".."))) throw new Error(`${manifest}: a list of file names`);
  return files as string[];
}

/**
 * Writes the site of `root` into `out` from one analysis. `out` is made, or
 * is an earlier export (its marker), whose files are replaced; nothing is
 * written into the repository.
 */
export async function exportSite(options: { root: string; out: string; analysis: Analysis }): Promise<ExportResult> {
  const root = resolve(options.root);
  const out = resolve(options.out);
  const problem = exportTargetProblem(root, out);
  if (problem !== null) throw new Error(`web --export: ${options.out}: ${problem}`);
  await ensureClient();
  const assets = siteAssets();
  const done = options.analysis;
  const read = createReadApi({ root, analysis: async () => done, analyze: async () => done, showRoot: false });
  const answers = await requests(done, read.answer);
  const shards = shardTexts(answers);

  mkdirSync(out, { recursive: true });
  for (const name of ["data", "assets", "index.html", "app.html"]) rmSync(join(out, name), { recursive: true, force: true });
  mkdirSync(join(out, "data"));
  mkdirSync(join(out, "assets"));
  shards.forEach((text, index) => writeFileSync(join(out, "data", `${index}.js`), text));
  for (const file of assets) {
    mkdirSync(join(out, "assets", file, ".."), { recursive: true });
    cpSync(join(BUILT_DIR, file), join(out, "assets", file));
  }
  const name = basename(root);
  writeFileSync(join(out, "index.html"), diagramsPage({ source: "static", assets: "assets/", title: `keylang · ${name}`, shards: shards.length }));
  writeFileSync(join(out, "app.html"), diagramsPage({ source: "local", assets: "assets/", title: "keylang · відкрити репозиторій" }));
  writeFileSync(join(out, EXPORT_MARKER), `${JSON.stringify({ keylang: keylangVersion(), repository: name }, null, 2)}\n`);
  return { out, answers: answers.length, shards: shards.length, files: shards.length + assets.length + 3 };
}
