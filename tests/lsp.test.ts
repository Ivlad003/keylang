import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function frame(message: unknown): string {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
}

test("lsp diagnostics use the same code as the parser", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-lsp-"));
  const child = spawn(process.execPath, [bin, "lsp"], { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
  });
  const send = (message: unknown) => child.stdin.write(frame(message));
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { capabilities: {} } });
  const text = "# flow t\n\n- step domain.missing\n";
  send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/diagnostic",
    params: { textDocument: { uri: "file:///buffer.md", text } },
  });
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/completion",
    params: { textDocument: { uri: "file:///rules.md", text: "# rules\n\n- deny domain infrastructure\n" } },
  });
  await once(child.stdout, "data");
  const deadline = Date.now() + 8000;
  while (!buf.includes('"id":3') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  child.kill();
  rmSync(dir, { recursive: true, force: true });
  assert.match(buf, /"code":"K001"/);
  assert.match(buf, /domain\.order/);
  assert.doesNotMatch(buf, /infrastructure\.db/);
});
