// `app.html`: the diagram page over a folder the person opens in the tab — by
// dropping it or choosing it — analysed by keylang's own pipeline in a Worker
// (web/worker/analysis.ts). The files are read here, sent to the worker once,
// and never leave the tab. What a repository holds that keylang never reads
// (`.git`, `node_modules`, images, archives, files over a few MB) is skipped
// before it is read.

import type { Reply, Transport } from "./api.ts";
import type { FromWorker, ToWorker } from "./local-protocol.ts";
import { make } from "./dom.ts";

/** Directories no analysis reads, skipped whole. */
const SKIPPED_DIRS = new Set([".git", "node_modules", ".hg", ".svn"]);
/** Files larger than this are no source keylang reads. */
const MAX_FILE = 4 * 1024 * 1024;
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|tiff?|psd|pdf|zip|gz|tgz|bz2|xz|7z|rar|jar|war|class|pyc|so|dylib|dll|exe|bin|wasm|woff2?|ttf|otf|eot|mp[34]|mov|avi|webm|ogg|wav|flac|sqlite|db)$/i;

interface Picked {
  path: string;
  file: File;
}

function wanted(path: string, size: number): boolean {
  const parts = path.split("/");
  return size <= MAX_FILE && !BINARY.test(path) && !parts.slice(0, -1).some((part) => SKIPPED_DIRS.has(part));
}

/** The files under a dropped directory entry, by their path below it. */
async function walkEntry(entry: FileSystemEntry, prefix: string, out: Picked[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    const path = `${prefix}${entry.name}`;
    if (wanted(path, file.size)) out.push({ path, file });
    return;
  }
  if (!entry.isDirectory || SKIPPED_DIRS.has(entry.name)) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // `readEntries` answers in batches until an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const child of batch) await walkEntry(child, `${prefix}${entry.name}/`, out);
  }
}

/** The picked files below the folder's own name: `repo/src/a.ts` → `src/a.ts`. */
function underRoot(picked: Picked[]): { name: string; files: Picked[] } {
  const name = picked[0]?.path.split("/")[0] ?? "repository";
  return { name, files: picked.filter((p) => p.path.startsWith(`${name}/`)).map((p) => ({ path: p.path.slice(name.length + 1), file: p.file })) };
}

/** Asks the worker as `keylang web` would be asked over HTTP; it answers GET only. */
class LocalTransport implements Transport {
  readonly kind = "local";
  private readonly worker: Worker;
  private readonly waiting = new Map<number, (reply: Reply) => void>();
  private next = 1;

  constructor(worker: Worker) {
    this.worker = worker;
    worker.addEventListener("message", (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      if (message.type !== "reply") return;
      this.waiting.get(message.id)?.(message.reply);
      this.waiting.delete(message.id);
    });
  }

  send(method: "GET" | "POST" | "PUT", path: string, query: URLSearchParams): Promise<Reply> {
    if (method !== "GET") return Promise.resolve({ status: 403, type: "application/json", text: JSON.stringify({ error: "read-only: the analysis in the browser writes nothing" }) });
    const id = this.next++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      const message: ToWorker = { type: "request", id, path, query: query.toString() };
      this.worker.postMessage(message);
    });
  }
}

const STYLE = `
#open-repo { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(245, 247, 248, 0.97); font: 14px system-ui, sans-serif; color: #263238; }
#open-repo .drop { width: min(560px, calc(100vw - 32px)); padding: 32px 24px; border: 2px dashed #90a4ae; border-radius: 10px; background: #ffffff; text-align: center; }
#open-repo .drop.over { border-color: #1565c0; background: #e3f2fd; }
#open-repo h1 { font-size: 18px; margin: 0 0 8px; }
#open-repo p { margin: 6px 0; color: #546e7a; }
#open-repo label.pick { display: inline-block; margin-top: 12px; padding: 6px 14px; border: 1px solid #1565c0; border-radius: 4px; background: #1565c0; color: #ffffff; cursor: pointer; }
#open-repo input { display: none; }
#open-repo .progress { margin-top: 14px; font: 12px ui-monospace, monospace; color: #37474f; white-space: pre-wrap; text-align: left; }
#open-repo .progress.error { color: #c62828; }
`;

/**
 * Shows the drop zone until a folder is analysed; resolves with the transport
 * of that analysis. A failed analysis says why and waits for another folder.
 */
export function openLocal(): Promise<Transport> {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);
  const input = make("input");
  input.type = "file";
  input.id = "open-repo-input";
  input.multiple = true;
  input.setAttribute("webkitdirectory", "");
  const progress = make("div", { className: "progress" });
  const drop = make(
    "div",
    { className: "drop" },
    make("h1", { text: "Відкрийте репозиторій" }),
    make("p", { text: "Перетягніть сюди теку репозиторію або оберіть її. keylang проаналізує код у цій вкладці: файли нікуди не надсилаються й не змінюються." }),
    make("p", { text: "Пропускаються .git, node_modules, бінарні файли й файли понад 4 МБ." }),
    make("label", { className: "pick", text: "Обрати теку…" }, input),
    progress,
  );
  const overlay = make("div", {}, drop);
  overlay.id = "open-repo";
  document.body.append(overlay);
  document.getElementById("status")!.textContent = "open a repository";

  return new Promise<Transport>((resolve) => {
    let busy = false;
    const report = (text: string, error = false): void => {
      progress.textContent = text;
      progress.className = error ? "progress error" : "progress";
    };
    const analyse = async (picked: Picked[]): Promise<void> => {
      if (busy) return;
      const { name, files } = underRoot(picked);
      if (files.length === 0) return report("no files to read in that folder", true);
      busy = true;
      report(`reading ${files.length} files of ${name}…`);
      try {
        const data = await Promise.all(files.map(async (p) => ({ path: p.path, data: await p.file.arrayBuffer() })));
        const worker = new Worker(new URL("assets/analysis.js", location.href));
        const ready = await new Promise<FromWorker & { type: "ready" }>((done, fail) => {
          worker.addEventListener("error", (event) => fail(new Error(event.message || "the analysis worker failed to start")));
          worker.addEventListener("message", (event: MessageEvent<FromWorker>) => {
            const message = event.data;
            if (message.type === "progress") report(`${name}: ${message.text}…`);
            else if (message.type === "failed") fail(new Error(message.error));
            else if (message.type === "ready") done(message);
          });
          const load: ToWorker = { type: "load", name, files: data };
          worker.postMessage(load, data.map((d) => d.data));
        });
        overlay.remove();
        document.title = `keylang · ${name}`;
        document.body.dataset["repository"] = name;
        resolve(new LocalTransport(worker));
        document.getElementById("status")!.textContent = `${name}: ${ready.files} files, ${ready.nodes} IDs (${ready.languages.join(", ") || "no languages"}) — pick a view on the left`;
      } catch (error) {
        busy = false;
        report(`${error instanceof Error ? error.message : String(error)}\nopen another folder, or reload the page`, true);
      }
    };
    input.addEventListener("change", () => {
      const picked = [...(input.files ?? [])].map((file) => ({ path: file.webkitRelativePath || file.name, file })).filter((p) => wanted(p.path, p.file.size));
      void analyse(picked);
    });
    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("over");
      const entries = [...(event.dataTransfer?.items ?? [])].map((item) => item.webkitGetAsEntry()).filter((entry): entry is FileSystemEntry => entry !== null);
      const directory = entries.find((entry) => entry.isDirectory);
      if (!directory) return report("drop a folder, not files", true);
      const picked: Picked[] = [];
      report(`listing ${directory.name}…`);
      void walkEntry(directory, "", picked).then(() => analyse(picked), (error: unknown) => report(String(error), true));
    });
  });
}
