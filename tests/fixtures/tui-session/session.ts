// `@flow tui`: one F5 in a TUI session whose snapshot comes from the worker,
// wired as `keylang` wires it. Argument: the repository to open.

import { analyze } from "../../../src/analyze.ts";
import { App } from "../../../src/tui/app.ts";
import { SnapshotWorker } from "../../../src/tui/background.ts";

const root = process.argv[2];
if (!root) throw new Error("usage: session.ts <repository>");
const worker = new SnapshotWorker();
const app = new App({ root, cols: 100, rows: 30, analyzer: (request) => analyze({ ...request, generate: worker.generate }) });
await app.idle();
app.input("\x1b[15~");
await app.idle();
const analysis = app.state.analysis;
app.close();
worker.close();
process.stdout.write(`${analysis?.snapshot?.snapshotId ?? "no snapshot"}\n`);
