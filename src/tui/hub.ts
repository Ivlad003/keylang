// `keylang web --hub`: one port for many repositories. `/` is the start page:
// a repository URL to clone (into the clone cache, then `init`, as `keylang
// clone` does), the repositories cloned before, the folder the hub runs in,
// and «Відкрити теку з ПК» — app.html, which analyses a folder in the tab
// (nothing is uploaded). An opened repository is a `keylang web` of its own
// (`createWebApp`) mounted under `/r/<id>/`: its page, API and socket, its own
// token, the prefix taken off before its handlers see a request. With
// `readOnly` every repository opens as `web --read-only`.
//
// The start page's API (`/hub/api/…`) needs the hub's token, as a
// repository's API needs its own: on loopback the Host header is checked, a
// page of another origin may not read or write.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import type { AddressInfo } from "node:net";
import { basename, join, relative, sep } from "node:path";
import type { Duplex } from "node:stream";
import { findRoot } from "../analyze.ts";
import { cloneCacheRoot, listClones, parseRepoSource, syncClone } from "../clone.ts";
import { CONFIG_FILE } from "../config.ts";
import { isJsonObject, isJsonString, parseJson, type JsonValue } from "../json.ts";
import { runOperation } from "../operations.ts";
import { BUILT_DIR, createWebApp, diagramsPage, ensureClient, logUnhandled, shownHost, type WebApp } from "./web.ts";

export interface HubOptions {
  port: number;
  host?: string;
  /** Every repository opens as `web --read-only`. */
  readOnly?: boolean;
  /** Where clones go and are listed from; default the clone cache (`XDG_CACHE_HOME`, else `~/.cache`). */
  cacheRoot?: string;
  /** The folder the hub runs in: listed when it holds a repository. */
  cwd?: string;
}

export interface HubServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

interface Mounted {
  root: string;
  app: WebApp;
}

/** The largest body of `POST /hub/api/…`. */
const MAX_BODY = 16 * 1024;

/** A repository's place in the URL: its directory under the cache (`github.com~owner~repo`), or `here` for the hub's own folder. */
function idOf(cacheRoot: string, dir: string): string {
  const rel = relative(cacheRoot, dir);

  return rel.split(sep).join("~");
}

function reply(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(body);
}

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;

      if (size <= MAX_BODY) chunks.push(chunk);
    });
    request.on("end", () => resolve(size > MAX_BODY ? null : Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export async function serveHub(options: HubOptions): Promise<HubServer> {
  const host = options.host ?? "127.0.0.1";
  const cacheRoot = options.cacheRoot ?? cloneCacheRoot(process.env, homedir());
  const cwd = options.cwd ?? process.cwd();
  const here = findRoot(cwd);
  const token = randomBytes(16).toString("hex");
  const mounted = new Map<string, Mounted>();
  let port = options.port;
  const loopback = host === "127.0.0.1" || host === "::1" || host === "localhost";
  const allowedHost = (header: string | undefined): boolean => !!header && (!loopback || [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(header));
  const sameOrigin = (request: IncomingMessage): boolean => request.headers.origin === undefined || request.headers.origin === `http://${request.headers.host}`;

  const authorized = (request: IncomingMessage): boolean => {
    const given = /^Bearer (\S+)$/.exec(String(request.headers.authorization ?? ""))?.[1] ?? "";

    return given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token));
  };

  /** Mounts the repository at `root` under `id` once; later calls find it. */
  const mount = (id: string, root: string): Mounted => {
    let found = mounted.get(id);

    if (!found) {
      const app = createWebApp({ root, port, host, readOnly: options.readOnly === true });
      app.setPort(port);
      found = { root, app };
      mounted.set(id, found);
    }

    return found;
  };

  const viewer = (id: string, found: Mounted): string => `/r/${encodeURIComponent(id)}/${options.readOnly ? "diagrams" : ""}#t=${found.app.token}`;

  /** The hub's own folder, when it holds a repository (keylang.json, or code `init` would find). */
  const hereListed = (): { id: string; label: string; source: string; root: string } | null => (existsSync(join(here, CONFIG_FILE)) || existsSync(join(here, ".git")) ? { id: "here", label: basename(here), source: here, root: here } : null);

  const repos = () => {
    const list = listClones(cacheRoot).map((clone) => ({ id: idOf(cacheRoot, clone.dir), label: clone.key.slice(1).join("/") || clone.key.join("/"), source: clone.url, root: clone.dir }));
    const own = hereListed();

    return [...(own ? [own] : []), ...list].map((repo) => {
      const open = mounted.get(repo.id);

      return { ...repo, cloned: repo.id !== "here", open: open ? viewer(repo.id, open) : null };
    });
  };

  /**
   * Clones (or brings up to date) a repository URL or local path into the cache, `init`s it as
   * `keylang clone` does (no harness files), mounts it. Errors are the clone's own words.
   */
  const fetchRepository = async (text: string): Promise<{ id: string; viewer: string; action: string }> => {
    const source = parseRepoSource(text, cwd);

    if ("error" in source) throw new Error(source.error);
    const dir = join(cacheRoot, ...source.key);
    const synced = syncClone(source, dir);
    const init = await runOperation({ kind: "init", root: dir, harnesses: "none", check: false, label: dir });

    if (init.payload === null) throw new Error(init.messages.map((m) => m.text).join("; ") || "init failed");
    const id = idOf(cacheRoot, dir);

    return { id, viewer: viewer(id, mount(id, dir)), action: synced.action };
  };

  const api = async (request: IncomingMessage, response: ServerResponse, path: string): Promise<void> => {
    const json = <Body>(status: number, body: Body): void => reply(response, status, "application/json", `${JSON.stringify(body)}\n`);

    if (!sameOrigin(request) || !authorized(request)) return reply(response, 403, "text/plain", "forbidden\n");

    if (path === "/hub/api/repos" && request.method === "GET") return json(200, { readOnly: options.readOnly === true, cacheRoot, repos: repos() });

    if (request.method !== "POST" || (path !== "/hub/api/open" && path !== "/hub/api/fetch")) return json(404, { error: "not found" });
    const site = request.headers["sec-fetch-site"];

    if (site !== undefined && site !== "same-origin" && site !== "none") return reply(response, 403, "text/plain", "forbidden\n");

    if (!/^application\/json\s*(;|$)/i.test(String(request.headers["content-type"] ?? ""))) return json(415, { error: "Content-Type: application/json" });
    const text = await readBody(request);
    let parsed: JsonValue;

    try {
      parsed = text === null ? {} : parseJson(text);
    } catch {
      return json(400, { error: "the body is no JSON" });
    }

    // A body that is no object names no repository: its fields read as absent.
    const body = isJsonObject(parsed) ? parsed : {};

    // Open a listed repository (the hub's folder, a clone made before) as it is.
    if (path === "/hub/api/open") {
      const repo = repos().find((r) => r.id === body.id);

      if (!repo) return json(404, { error: `no repository \`${String(body.id)}\`` });

      return json(200, { id: repo.id, viewer: viewer(repo.id, mount(repo.id, repo.root)) });
    }

    // Clone a URL or a local path, or update a clone: the source as typed, or a listed clone's.
    const requestedId = body.id;
    const requestedSource = body.source;
    const listed = isJsonString(requestedId) ? repos().find((r) => r.id === requestedId && r.cloned) : undefined;
    const sourceText = listed?.source ?? (isJsonString(requestedSource) ? requestedSource.trim() : "");

    if (sourceText === "") return json(400, { error: "source: a repository URL or a local path" });

    try {
      return json(200, await fetchRepository(sourceText));
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  /** The built client: the page of app.html and its worker, grammars and licenses (`dist/web/site.json`). */
  const asset = async (response: ServerResponse, name: string): Promise<void> => {
    await ensureClient();
    const manifest = join(BUILT_DIR, "site.json");
    const written = existsSync(manifest) ? parseJson(readFileSync(manifest, "utf8")) : [];
    const listed = Array.isArray(written) ? written.filter(isJsonString) : [];

    if (!listed.includes(name)) return reply(response, 404, "text/plain", "not found\n");
    const type = name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".json") ? "application/json" : "text/plain; charset=utf-8";
    reply(response, 200, type, readFileSync(join(BUILT_DIR, name)));
  };

  /** `/r/<id>/rest` → the repository and `/rest`; null when the path is no repository's. */
  const routed = (url: string): { found: Mounted; rest: string; id: string } | null => {
    const match = /^\/r\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?/.exec(url);

    if (!match) return null;
    const id = decodeURIComponent(match[1]!);
    const found = mounted.get(id);

    return found ? { found, rest: `${match[2] ?? "/"}${match[3] ?? ""}`, id } : null;
  };

  const serve = (request: IncomingMessage, response: ServerResponse): void => {
    const url = request.url ?? "/";
    let path: string;

    try {
      path = new URL(url, "http://localhost").pathname;
    } catch {
      return reply(response, 400, "text/plain", "bad request\n");
    }

    if (!allowedHost(request.headers.host)) return reply(response, 421, "text/plain", "unknown host\n");

    if (path.startsWith("/r/")) {
      const target = routed(url);

      if (!target) return reply(response, 404, "text/plain", "not open: open the repository from the start page\n");

      // `/r/<id>` without its slash: the page's relative URLs need it.
      if (!/^\/r\/[^/]+\//.test(path)) {
        response.setHeader("Location", `${path}/`);

        return reply(response, 302, "text/plain", "\n");
      }

      request.url = target.rest;

      return target.found.app.handle(request, response);
    }

    if (path.startsWith("/hub/api/")) {
      api(request, response, path).catch((cause: unknown) => {
        process.stderr.write(`keylang web --hub: ${cause instanceof Error ? cause.message : String(cause)}\n`);

        if (!response.headersSent) reply(response, 500, "text/plain", "server error\n");
      });

      return;
    }

    if (path.startsWith("/assets/")) {
      asset(response, path.slice("/assets/".length)).catch(() => {
        if (!response.headersSent) reply(response, 500, "text/plain", "server error\n");
      });

      return;
    }

    if (path === "/app.html") return reply(response, 200, "text/html; charset=utf-8", diagramsPage({ source: "local", assets: "assets/", title: "keylang · тека з ПК" }));

    if (path !== "/") return reply(response, 404, "text/plain", "not found\n");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:");

    return reply(response, 200, "text/html; charset=utf-8", hubPage());
  };

  const server: Server = createServer((request, response) => {
    try {
      serve(request, response);
    } catch (error) {
      process.stderr.write(`keylang web --hub: ${error instanceof Error ? error.message : String(error)}\n`);

      if (!response.headersSent) reply(response, 500, "text/plain", "server error\n");
      else response.destroy();
    }
  });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => socket.destroy());
    const target = routed(request.url ?? "/");

    if (!target) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");

      return;
    }

    request.url = target.rest;
    target.found.app.upgrade(request, socket, head);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => resolve());
  });
  // SAFETY: a server listening on a host and port reports an AddressInfo; a string comes only from a pipe or a Unix socket.
  port = (server.address() as AddressInfo).port;
  const stopLogging = logUnhandled();

  return {
    url: `http://${shownHost(host)}:${port}/#t=${token}`,
    port,
    close: async () => {
      stopLogging();

      for (const { app } of mounted.values()) await app.close();
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
    },
  };
}

/** The start page: static markup and a small script over `/hub/api/`; the token comes in the fragment once. */
function hubPage(): string {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>keylang</title>
<link rel="icon" href="data:,">
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #263238; background: #f5f7f8; }
  main { max-width: 920px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .lead { color: #607d8b; margin: 0 0 20px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: #ffffff; border: 1px solid #dfe5e8; border-radius: 8px; padding: 14px 16px; }
  .card h2 { font-size: 15px; margin: 0 0 6px; }
  .card p { margin: 0 0 10px; color: #546e7a; font-size: 13px; }
  form { display: flex; gap: 6px; flex-wrap: wrap; }
  input[type=text] { flex: 1 1 220px; min-width: 0; padding: 6px 8px; border: 1px solid #b0bec5; border-radius: 4px; font: 13px ui-monospace, monospace; }
  button, a.button { border: 1px solid #1565c0; border-radius: 4px; background: #1565c0; color: #ffffff; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; text-decoration: none; display: inline-block; }
  button.quiet { background: #ffffff; color: #1565c0; }
  button:disabled { opacity: 0.6; cursor: default; }
  .status { margin-top: 8px; font-size: 13px; color: #546e7a; min-height: 1.2em; white-space: pre-wrap; }
  .status.error { color: #c62828; }
  table { width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #dfe5e8; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eceff1; font-size: 13px; vertical-align: middle; }
  th { color: #607d8b; font-weight: 600; background: #fafbfc; }
  td.source { color: #607d8b; font: 12px ui-monospace, monospace; word-break: break-all; }
  td.actions { white-space: nowrap; text-align: right; }
  td.actions button { margin-left: 4px; }
  .empty { color: #78909c; padding: 12px; }
  .badge { font-size: 11px; color: #2e7d32; margin-left: 6px; }
</style>
</head>
<body>
<main>
<h1>keylang</h1>
<p class="lead" id="lead">Карта, діаграми, зміни й сліпі зони репозиторію.</p>
<div class="cards">
  <section class="card">
    <h2>Викачати репозиторій</h2>
    <p>URL (https, ssh, git@…) або шлях до репозиторію на цій машині. Клон іде в кеш keylang, далі <code>init</code> і карта.</p>
    <form id="fetch-form"><input id="source" type="text" placeholder="https://github.com/owner/repo" aria-label="Репозиторій" autocomplete="off"><button id="fetch" type="submit">Викачати й відкрити</button></form>
    <div class="status" id="fetch-status"></div>
  </section>
  <section class="card">
    <h2>Тека з ПК</h2>
    <p>Аналіз прямо у вкладці: перетягніть теку з кодом або оберіть її. Файли нікуди не надсилаються; з <code>.git</code> працює вкладка «Зміни».</p>
    <a class="button" id="local" href="app.html" target="_blank" rel="noopener">Відкрити теку з ПК</a>
  </section>
</div>
<h2 style="font-size:15px">Репозиторії</h2>
<div id="repos"><p class="empty">завантаження…</p></div>
</main>
<script>
(() => {
  const fromUrl = new URLSearchParams(location.hash.slice(1)).get("t");
  if (fromUrl) {
    sessionStorage.setItem("keylang-hub-token", fromUrl);
    history.replaceState(null, "", location.pathname);
  }
  const token = sessionStorage.getItem("keylang-hub-token") || "";
  const call = async (method, path, body) => {
    const response = await fetch(path, { method, headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = { error: text.trim() }; }
    if (!response.ok) throw new Error(response.status === 403 ? "немає доступу: відкрийте URL, який надрукував keylang web --hub" : (data && data.error) || response.statusText);
    return data;
  };
  const el = (tag, props, ...children) => { const node = document.createElement(tag); Object.assign(node, props || {}); node.append(...children); return node; };
  const status = document.getElementById("fetch-status");
  const say = (text, error) => { status.textContent = text; status.className = error ? "status error" : "status"; };
  // The same tab: a window opened after a long clone is a popup the browser blocks; «Назад» comes back here.
  const go = (url) => { location.assign(url); };
  const render = (data) => {
    if (data.readOnly) document.getElementById("lead").textContent += " Режим лише для читання: репозиторії відкриваються без запису.";
    const box = document.getElementById("repos");
    if (data.repos.length === 0) { box.replaceChildren(el("p", { className: "empty", textContent: "Ще нічого не викачано. Вставте URL вище або відкрийте теку з ПК." })); return; }
    const rows = data.repos.map((repo) => {
      const open = el("button", { type: "button", textContent: "Відкрити" });
      open.addEventListener("click", async () => {
        open.disabled = true;
        try { const done = await call("POST", "hub/api/open", { id: repo.id }); go(done.viewer); load(); } catch (error) { say(String(error.message || error), true); }
        open.disabled = false;
      });
      const actions = el("td", { className: "actions" }, open);
      if (repo.cloned) {
        const update = el("button", { type: "button", className: "quiet", textContent: "Оновити" });
        update.addEventListener("click", async () => {
          update.disabled = true;
          say("оновлюю " + repo.label + "…");
          try { await call("POST", "hub/api/fetch", { id: repo.id }); say(repo.label + ": оновлено"); load(); } catch (error) { say(String(error.message || error), true); }
          update.disabled = false;
        });
        actions.append(update);
      }
      const name = el("td", {}, el("b", { textContent: repo.label }));
      if (repo.open) name.append(el("span", { className: "badge", textContent: "відкрито" }));
      if (!repo.cloned) name.append(el("span", { className: "badge", textContent: "ця тека" }));
      return el("tr", {}, name, el("td", { className: "source", textContent: repo.source }), actions);
    });
    box.replaceChildren(el("table", {}, el("thead", {}, el("tr", {}, el("th", { textContent: "Репозиторій" }), el("th", { textContent: "Звідки" }), el("th", { textContent: "" }))), el("tbody", {}, ...rows)));
  };
  const load = () => call("GET", "hub/api/repos").then(render, (error) => document.getElementById("repos").replaceChildren(el("p", { className: "empty", textContent: String(error.message || error) })));
  document.getElementById("fetch-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const source = document.getElementById("source").value.trim();
    if (!source) return;
    const button = document.getElementById("fetch");
    button.disabled = true;
    say("клоную " + source + " і будую карту… (великий репозиторій — хвилину й більше)");
    try {
      const done = await call("POST", "hub/api/fetch", { source });
      say(done.action === "updated" ? "оновлено, відкриваю" : "викачано, відкриваю");
      go(done.viewer);
      load();
    } catch (error) { say(String(error.message || error), true); }
    button.disabled = false;
  });
  load();
})();
</script>
</body>
</html>
`;
}
