#!/usr/bin/env node
// Magento baseline bench (business-flows ticket 03): sparse-clone five
// Magento modules at a fixed tag, run `keylang map` / `check` / two algo
// drafts on them and write `bench/magento/results.md` with the metrics of
// spec §6. The network is used only for the clone; `--repo <dir>` reuses a
// local checkout and `$XDG_CACHE_HOME/keylang/bench/magento2` is reused when
// it exists.
//
// Usage: node bench/magento/run.mjs [--repo <dir>] [--out <results.md>]

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { collectMetrics, formatReport, summaryLine } from "../lib/metrics.mjs";

export const MAGENTO_URL = "https://github.com/magento/magento2.git";
export const MAGENTO_TAG = "2.4.9";
export const MODULES = ["Checkout", "Quote", "Sales", "SalesRule", "Payment"];
export const FRAMEWORK = ["App", "Event", "Model", "Api"];
export const SPARSE_PATHS = [...MODULES.map((m) => `app/code/Magento/${m}`), ...FRAMEWORK.map((f) => `lib/internal/Magento/Framework/${f}`)];
export const DRAFTS = ["quote.Model.QuoteManagement.QuoteManagement.placeOrder", "quote.Model.QuoteManagement.QuoteManagement.submitQuote"];
const HEAP = "--max-old-space-size=4096";
const TIME = "/usr/bin/time";

const here = dirname(new URL(import.meta.url).pathname);
const bin = resolve(here, "../../bin/keylang.js");

/** The `keylang.json` the bench writes into the clone: a layer per module, tests excluded, the Framework subset outside the architecture. */
export function benchConfig() {
  const layers = {};
  for (const m of MODULES) layers[m.toLowerCase()] = [`app/code/Magento/${m}/**`];
  return { format: 1, languages: ["php"], module: "file", layers, exclude: ["**/Test/**"], outside: ["lib/internal/Magento/Framework/**"] };
}

function parseArgs(argv) {
  const opts = { repo: null, out: join(here, "results.md") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo" && argv[i + 1]) opts.repo = resolve(argv[++i]);
    else if (a === "--out" && argv[i + 1]) opts.out = resolve(argv[++i]);
    else {
      process.stderr.write(`unknown argument: ${a}\nusage: node bench/magento/run.mjs [--repo <dir>] [--out <results.md>]\n`);
      process.exit(2);
    }
  }
  return opts;
}

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 30, ...options });
  if (r.error) throw r.error;
  return r;
}

function must(r, what) {
  if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status}):\n${(r.stderr || r.stdout || "").trimEnd().split("\n").slice(-20).join("\n")}`);
  return r;
}

function cacheDir() {
  const xdg = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(xdg, "keylang", "bench", "magento2");
}

/** The checkout to measure: `--repo`, the cached clone, or a fresh sparse clone (the only network step). */
export function ensureRepo(repo) {
  if (repo) {
    if (!existsSync(repo)) throw new Error(`--repo ${repo}: no such directory`);
    return repo;
  }
  const dir = cacheDir();
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dirname(dir), { recursive: true });
    process.stderr.write(`cloning ${MAGENTO_URL}@${MAGENTO_TAG} (sparse) into ${dir}\n`);
    must(run("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", MAGENTO_TAG, MAGENTO_URL, dir], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }), "git clone");
    must(run("git", ["-C", dir, "sparse-checkout", "set", ...SPARSE_PATHS]), "git sparse-checkout");
  }
  return dir;
}

/** `/usr/bin/time -v` around the child when available: wall time and maxRSS come from it; otherwise from `hrtime` and `n/a`. */
function timed(args, cwd) {
  const start = process.hrtime.bigint();
  const withTime = existsSync(TIME);
  const r = withTime ? run(TIME, ["-v", process.execPath, HEAP, ...args], { cwd }) : run(process.execPath, [HEAP, ...args], { cwd });
  const wallMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
  let maxRssKb = null;
  let stderr = r.stderr;
  if (withTime) {
    const m = /Maximum resident set size \(kbytes\): (\d+)/.exec(stderr);
    if (m) maxRssKb = Number(m[1]);
    // Everything from the `Command being timed:` line on is time(1)'s report, not the child's.
    const cut = stderr.indexOf("\tCommand being timed:");
    if (cut !== -1) stderr = stderr.slice(0, cut);
  }
  return { status: r.status, stdout: r.stdout, stderr, wallMs, maxRssKb };
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} с`;
const megabytes = (kb) => (kb === null ? "n/a (немає /usr/bin/time)" : `${Math.round(kb / 1024)} МБ`);

export function main(argv) {
  const opts = parseArgs(argv);
  const repo = ensureRepo(opts.repo);
  const describe = run("git", ["-C", repo, "describe", "--tags", "--always"]);
  const commit = run("git", ["-C", repo, "rev-parse", "--short", "HEAD"]);
  const tag = describe.status === 0 ? describe.stdout.trim() : "unknown";
  const sha = commit.status === 0 ? commit.stdout.trim() : "unknown";

  writeFileSync(join(repo, "keylang.json"), `${JSON.stringify(benchConfig(), null, 2)}\n`);
  // A cold `map`: the fact cache of the previous run would make the time incomparable with spec §2.
  rmSync(join(repo, ".keylang", "cache"), { recursive: true, force: true });

  const map = timed([bin, "map"], repo);
  if (map.status !== 0) throw new Error(`keylang map failed (exit ${map.status}):\n${map.stderr.trimEnd().split("\n").slice(-10).join("\n")}`);
  const warnings = map.stderr.split("\n").filter((l) => l.startsWith("warning:")).length;
  const mapSummary = map.stderr.trimEnd().split("\n").at(-1) ?? "";

  const check = timed([bin, "check", "--format", "json"], repo);
  let checkJson = { results: [], coverage: [] };
  try {
    checkJson = JSON.parse(check.stdout);
  } catch {
    throw new Error(`keylang check --format json did not print JSON (exit ${check.status}):\n${check.stderr.trimEnd().split("\n").slice(-10).join("\n")}`);
  }
  const verdicts = { fail: 0, unverified: 0, ok: 0, warning: 0 };
  for (const r of checkJson.results) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;

  const drafts = DRAFTS.map((trigger) => {
    const d = run(process.execPath, [bin, "draft", "flow", trigger, "--mode", "algo", "--print"], { cwd: repo });
    return { trigger, text: d.status === 0 ? d.stdout : "", exit: d.status };
  });

  const snapshot = JSON.parse(readFileSync(join(repo, ".keylang", "index.json"), "utf8"));
  const expect = JSON.parse(readFileSync(join(here, "expect.json"), "utf8"));
  const metrics = collectMetrics(snapshot, { drafts, expect });

  const keylangSha = run("git", ["-C", here, "rev-parse", "--short", "HEAD"]);
  const intro = [
    `[magento/magento2](${MAGENTO_URL.replace(/\.git$/, "")}) тег \`${MAGENTO_TAG}\` (коміт \`${sha}\`), sparse-checkout: модулі ${MODULES.map((m) => `\`${m}\``).join(", ")} як шари, \`lib/internal/Magento/Framework/{${FRAMEWORK.join(",")}}\` як \`outside\`, \`exclude: ["**/Test/**"]\`.`,
    "",
    `Як відтворити: \`node bench/magento/run.mjs [--repo <клон>]\` — див. [README](README.md). Цей файл пише бенч; змінюється тільки блок «Цього запуску».`,
    "",
    `\`check --format json\`: ${verdicts.fail} fail, ${verdicts.unverified} unverified, ${verdicts.ok} ok, ${verdicts.warning} warning; записів coverage ${checkJson.coverage.length}. \`map\`: ${warnings} попереджень.`,
    "",
    ...drafts.map((d) => `\`draft flow ${d.trigger} --mode algo --print\`: ${d.exit === 0 ? `кроків ${metrics.drafts.find((x) => x.trigger === d.trigger)?.steps.length ?? 0} (разом із тригером)` : `код ${d.exit}`}.`),
  ];
  const runRows = [
    ["Дата", new Date().toISOString().slice(0, 10)],
    ["keylang", keylangSha.status === 0 ? `\`${keylangSha.stdout.trim()}\`` : "unknown"],
    ["Node", process.version],
    ["Клон", `\`${repo}\` (\`git describe\`: \`${tag}\`)`],
    [`\`map\` без кешу фактів (\`node ${HEAP}\`)`, `${seconds(map.wallMs)}, maxRSS ${megabytes(map.maxRssKb)}`],
    ["`check --format json`", `${seconds(check.wallMs)}, maxRSS ${megabytes(check.maxRssKb)}`],
    ["Підсумок `map`", mapSummary.replace(/\|/g, "\\|")],
    ["snapshotId", `\`${snapshot.snapshotId ?? "n/a"}\``],
  ];
  const report = formatReport(metrics, { title: "Бенч Magento: базова лінія business-flows", intro, run: runRows });
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, report);

  process.stdout.write(`${summaryLine(metrics)}\n`);
  if (metrics.golden) {
    const missing = metrics.golden.ids.filter((g) => !g.inFlow).map((g) => g.id);
    process.stdout.write(`golden in ${metrics.golden.flow}: found ${metrics.golden.found}/${metrics.golden.total}${missing.length ? `; missing: ${missing.join(", ")}` : ""}\n`);
    for (const e of metrics.golden.events) process.stdout.write(`event ${e.name}: ${e.id ?? "n/a"}\n`);
  }
  process.stdout.write(`map ${seconds(map.wallMs)} maxRSS ${megabytes(map.maxRssKb)}; check ${seconds(check.wallMs)}\n${opts.out}: written\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    process.stderr.write(`bench/magento: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}
