import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function frame(message: unknown): string {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
}

function frames(buf: string): { id?: number; result?: unknown; error?: { message: string } }[] {
  const bytes = Buffer.from(buf);
  const out: { id?: number; result?: unknown; error?: { message: string } }[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const headerEnd = bytes.indexOf("\r\n\r\n", offset);
    if (headerEnd === -1) break;
    const header = bytes.subarray(offset, headerEnd).toString("utf8");
    const match = /Content-Length: (\d+)/i.exec(header);
    if (!match?.[1]) break;
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (bytes.length < start + length) break;
    out.push(JSON.parse(bytes.subarray(start, start + length).toString("utf8")) as { id?: number; result?: unknown; error?: { message: string } });
    offset = start + length;
  }
  return out;
}

async function speak(cwd: string, messages: unknown[]): Promise<string> {
  const child = spawn(process.execPath, [bin, "lsp"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
  });
  for (const message of messages) child.stdin.write(frame(message));
  await once(child.stdout, "data");
  const last = messages.at(-1) as { id?: number };
  const wanted = last?.id ?? 1;
  const deadline = Date.now() + 20000;
  while (!frames(buf).some((message) => message.id === wanted) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 40));
  child.kill();
  return buf;
}

test("lsp diagnostics match check and completion uses the snapshot", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-lsp-"));
  try {
    cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
    assert.equal(spawnSync(process.execPath, [bin, "map"], { cwd: dir, encoding: "utf8" }).status, 0);
    mkdirSync(join(dir, "keylang/flows"), { recursive: true });
    const laterPath = join(dir, "keylang/flows/later.md");
    writeFileSync(laterPath, "# flow later\n\n- planned fn domain.order.later (order: Order) → void\n- step domain.order.later\n");
    const source = join(dir, "src/domain/order.ts");
    const uri = pathToFileURL(source).href;
    const rootUri = pathToFileURL(dir).href;
    const map = readFileSync(join(dir, "keylang/map/domain.md"), "utf8");
    const moduleLine = map.split("\n").findIndex((line) => line.includes("module") && line.includes("order"));
    assert.ok(moduleLine >= 0);
    const before = await speak(dir, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri, capabilities: {} } },
      { jsonrpc: "2.0", id: 2, method: "textDocument/diagnostic", params: { textDocument: { uri } } },
    ]);
    assert.doesNotMatch(before, /K102/);
    const cliJson = spawnSync(process.execPath, [bin, "check", "--format", "json"], { cwd: dir, encoding: "utf8" });
    const laterRows = (JSON.parse(cliJson.stdout) as { results: { file: string; line: number; col: number; code: string | null; verdict: string; evidence: string }[] }).results.filter(
      (row) => row.file === "keylang/flows/later.md",
    );
    assert.ok(laterRows.some((row) => row.verdict === "unverified" && row.evidence.includes("planned")));
    assert.equal(laterRows.some((row) => row.code === "K001"), false);
    const laterDiag = await speak(dir, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri, capabilities: {} } },
      { jsonrpc: "2.0", id: 2, method: "textDocument/diagnostic", params: { textDocument: { uri: pathToFileURL(laterPath).href } } },
    ]);
    const laterItems =
      (
        frames(laterDiag).find((message) => message.id === 2) as {
          result?: { items: { code?: string | null; message: string; range: { start: { line: number; character: number } }; data?: { verdict: string } }[] };
        }
      ).result?.items ?? [];
    const sameFindingRow = (row: (typeof laterRows)[number], item: (typeof laterItems)[number]): boolean =>
      (item.code ?? null) === (row.code ?? null) && item.message === row.evidence && item.range.start.line === row.line - 1 && item.range.start.character === row.col - 1 && item.data?.verdict === row.verdict;
    for (const row of laterRows) assert.ok(laterItems.some((item) => sameFindingRow(row, item)), JSON.stringify({ row, laterItems }));
    for (const item of laterItems) assert.ok(laterRows.some((row) => sameFindingRow(row, item)), JSON.stringify({ item, laterRows }));
    const laterText = readFileSync(laterPath, "utf8");
    const plannedLine = laterText.split("\n").findIndex((line) => line.includes("planned") && line.includes("domain.order.later"));
    const plannedHover = await speak(dir, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri, capabilities: {} } },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/hover",
        params: {
          textDocument: { uri: pathToFileURL(laterPath).href },
          position: { line: plannedLine, character: laterText.split("\n")[plannedLine]?.indexOf("domain.order.later") ?? 0 },
        },
      },
    ]);
    assert.match(plannedHover, /planned fn domain\.order\.later/);
    assert.match(plannedHover, /\(order: Order\) → void/);
    assert.match(plannedHover, /keylang\/flows\/later\.md/);
    appendFileSync(source, 'import { save } from "../infra/db.ts";\nexport function again(o: Order): void { save(o); }\n');
    const after = await speak(dir, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri, capabilities: {} } },
      { jsonrpc: "2.0", id: 2, method: "textDocument/diagnostic", params: { textDocument: { uri } } },
    ]);
    const cli = spawnSync(process.execPath, [bin, "check"], { cwd: dir, encoding: "utf8" });
    assert.match(cli.stdout, /K102/);
    assert.match(after, /"code":"K102"/);
    const unsaved = join(dir, "keylang/flows/unsaved.md");
    const unsavedUri = pathToFileURL(unsaved).href;
    const buffered = await speak(dir, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri, capabilities: {} } },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/diagnostic",
        params: { textDocument: { uri: unsavedUri, text: "# flow unsaved\n\n- step domain.order.missingFn\n" } },
      },
    ]);
    assert.equal(existsSync(unsaved), false);
    assert.match(buffered, /"code":"K001"/);
    const completed = await speak(dir, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri, capabilities: {} } },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/completion",
        params: {
          textDocument: { uri: pathToFileURL(join(dir, "keylang/map/domain.md")).href, text: map },
          position: { line: moduleLine, character: 4 },
        },
      },
    ]);
    const response = frames(completed).find((message) => message.id === 2) as { result?: { items: { label: string; detail?: string }[] }; error?: { message: string } } | undefined;
    assert.ok(response?.result, completed.slice(0, 2000) + (response?.error?.message ?? ""));
    const labels = response.result.items.map((item) => item.label);
    assert.ok(labels.some((label) => label.startsWith("domain.")));
    assert.equal(labels.some((label) => label.startsWith("infra.")), false);
    assert.ok(response.result.items.some((item) => item.label === "domain.order.later" && item.detail === "planned"));
    const appMap = readFileSync(join(dir, "keylang/map/app.md"), "utf8");
    const callsLine = appMap.split("\n").findIndex((line) => line.includes("domain.order.createOrder"));
    assert.ok(callsLine >= 0, appMap);
    const hovered = await speak(dir, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri, capabilities: {} } },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/hover",
        params: {
          textDocument: { uri: pathToFileURL(join(dir, "keylang/map/app.md")).href, text: appMap },
          position: { line: callsLine, character: appMap.split("\n")[callsLine]?.indexOf("domain.order.createOrder") ?? 0 },
        },
      },
    ]);
    assert.match(hovered, /createOrder/);
    assert.match(hovered, /src\/domain\/order\.ts/);
    const defined = await speak(dir, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri, capabilities: {} } },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/definition",
        params: {
          textDocument: { uri: pathToFileURL(join(dir, "keylang/map/app.md")).href, text: appMap },
          position: { line: callsLine, character: appMap.split("\n")[callsLine]?.indexOf("domain.order.createOrder") ?? 0 },
        },
      },
    ]);
    assert.match(defined, /src\/domain\/order\.ts/);
    const symbols = await speak(dir, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { rootUri, capabilities: {} } },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/documentSymbol",
        params: { textDocument: { uri: pathToFileURL(join(dir, "keylang/rules.md")).href, text: readFileSync(join(dir, "keylang/rules.md"), "utf8") } },
      },
    ]);
    assert.match(symbols, /"name":"deny"/);
    assert.match(symbols, /"name":"later"/);
    assert.match(symbols, /"name":"domain"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
