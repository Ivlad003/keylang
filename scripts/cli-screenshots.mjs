// Retakes the CLI screenshots of the course (docs/course/images/cli-*.png)
// from the real output of this checkout, drawn as a terminal window.
//
//   node scripts/cli-screenshots.mjs [--chromium <path>]
//
// The browser is KEYLANG_CHROMIUM, --chromium, or google-chrome/chromium on PATH.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const images = join(root, "docs/course/images");
const { values } = parseArgs({ options: { chromium: { type: "string" } } });

/** Each shot: the file, the window title, the arguments of `keylang`, and which lines to keep. */
const SHOTS = [
  { file: "cli-shop-k001.png", title: "keylang check — examples/shop", args: ["check", "examples/shop"] },
  { file: "cli-shop-fixed.png", title: "keylang check — examples/shop-fixed", args: ["check", "examples/shop-fixed"] },
  { file: "cli-explain-k001.png", title: "keylang explain K001", args: ["explain", "K001"] },
  {
    file: "cli-check-repo.png",
    title: "keylang check — this repository (middle omitted)",
    args: ["check"],
    // The first lines of the check flow, then the summary.
    keep: (lines) => [...lines.filter((line) => line.startsWith("keylang/flows/check.md:")).slice(0, 10), "…", lines.at(-1)],
  },
  { file: "cli-explain-id.png", title: "keylang explain cli.cli.cmdCheck", args: ["explain", "cli.cli.cmdCheck"] },
];

function browserPath() {
  const named = values.chromium ?? process.env.KEYLANG_CHROMIUM;
  if (named) return named;
  for (const name of ["google-chrome", "chromium", "chromium-browser"]) {
    const found = spawnSync("which", [name], { encoding: "utf8" });
    if (found.status === 0) return found.stdout.trim();
  }
  if (existsSync("/opt/pw-browsers/chromium")) return "/opt/pw-browsers/chromium";
  throw new Error("no Chromium found: pass --chromium <path> or set KEYLANG_CHROMIUM");
}

/** stdout then stderr, as a terminal shows them; the summary of `check` is on stderr. */
function run(args) {
  const out = spawnSync(process.execPath, [join(root, "bin/keylang.js"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return `${out.stdout}${out.stderr}`.split("\n").filter((line) => line !== "");
}

function colour(line) {
  if (/ K\d{3} | fail |^K\d{3}:|^[1-9]\d* fail,/.test(line)) return "red";
  if (/ unverified | warning |^0 fail, [1-9]/.test(line)) return "yellow";
  if (/ ok /.test(line)) return "green";
  return "plain";
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(title, command, lines) {
  const body = lines.map((line) => `<div class="${colour(line)}">${escape(line)}</div>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: transparent; }
    .win { display: inline-block; max-width: 1180px; background: #1e1e1e; border-radius: 8px; overflow: hidden; font: 17px/1.55 "DejaVu Sans Mono", Menlo, monospace; }
    .bar { background: #2d2d2d; color: #9a9a9a; padding: 8px 14px; white-space: nowrap; }
    .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
    .term { padding: 14px 22px 18px; color: #e8e8e8; white-space: pre-wrap; word-break: break-word; }
    .cmd { color: #4fc1c9; font-weight: bold; } .red { color: #f14c4c; } .yellow { color: #e5c07b; } .green { color: #98c379; }
  </style><div class="win"><div class="bar"><span class="dot" style="background:#ff5f56"></span><span class="dot" style="background:#ffbd2e"></span><span class="dot" style="background:#27c93f"></span> ${escape(title)}</div>
  <div class="term"><div class="cmd">$ ${escape(command)}</div>${body}</div></div>`;
}

const browser = await chromium.launch({ headless: true, executablePath: browserPath() });
try {
  const tab = await browser.newPage({ viewport: { width: 1240, height: 400 }, deviceScaleFactor: 1 });
  for (const shot of SHOTS) {
    const lines = run(shot.args);
    await tab.setContent(page(shot.title, `node bin/keylang.js ${shot.args.join(" ")}`, shot.keep ? shot.keep(lines) : lines));
    await tab.locator(".win").screenshot({ path: join(images, shot.file), omitBackground: true });
    process.stdout.write(`${shot.file}\n`);
  }
} finally {
  await browser.close();
}
