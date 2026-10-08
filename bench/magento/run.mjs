#!/usr/bin/env node
// Magento baseline bench (business-flows ticket 03): sparse-clone five
// Magento modules at a fixed tag, run `keylang map` / `check` / two algo
// drafts on them and write `bench/magento/results.md` with the metrics of
// spec §6. The network is used only for the clone; `--repo <dir>` reuses a
// local checkout and `$XDG_CACHE_HOME/keylang/bench/magento2` is reused when
// it exists.
//
// `--wide` (business-flows 40): the whole `app/code/Magento` and
// `lib/internal/Magento/Framework` without their `Test` directories, and
// `app/etc/di.xml`, in a worktree of the cached clone with a sparse-checkout
// of its own (`…/magento2-wide`; the blobs are fetched into the cached
// clone's objects, the only network step). The same five modules are layers;
// every other module and the Framework are `outside`, read as declarations,
// and the Magento adapter reads the `di.xml` of every module. Writes
// `results-wide.md`; the narrow `results.md` stays the default.
//
// Usage: node bench/magento/run.mjs [--wide] [--repo <dir>] [--out <results.md>]

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { collectMetrics, formatReport, summaryLine } from "../lib/metrics.mjs";

export const MAGENTO_URL = "https://github.com/magento/magento2.git";
export const MAGENTO_TAG = "2.4.9";
export const MODULES = ["Checkout", "Quote", "Sales", "SalesRule", "Payment"];
export const FRAMEWORK = ["App", "Event", "Model", "Api"];
export const SPARSE_PATHS = [...MODULES.map((m) => `app/code/Magento/${m}`), ...FRAMEWORK.map((f) => `lib/internal/Magento/Framework/${f}`)];
/** `--wide`: non-cone sparse-checkout patterns — every module and the Framework without tests; the five modules whole, as in the narrow bench (their tests are `exclude`d). */
export const WIDE_SPARSE_PATTERNS = [
  "/app/etc/di.xml",
  "/app/code/Magento/",
  "!/app/code/Magento/*/Test/",
  ...MODULES.map((m) => `/app/code/Magento/${m}/Test/`),
  "/lib/internal/Magento/Framework/",
  "!/lib/internal/Magento/Framework/**/Test/",
];
export const DRAFTS = ["quote.Model.QuoteManagement.QuoteManagement.placeOrder", "quote.Model.QuoteManagement.QuoteManagement.submitQuote"];
const HEAP = "--max-old-space-size=4096";
const WIDE_HEAP = "--max-old-space-size=8192";
const TIME = "/usr/bin/time";
const USAGE = "usage: node bench/magento/run.mjs [--wide] [--repo <dir>] [--out <results.md>]";

const here = dirname(new URL(import.meta.url).pathname);
const bin = resolve(here, "../../bin/keylang.js");

/**
 * The `keylang.json` the bench writes into the clone: a layer per module, tests excluded, the
 * Framework outside the architecture. `others` (`--wide`): the other module directories of
 * `app/code/Magento`, outside too — one glob each, since `outside` wins over a layer.
 */
export function benchConfig(others = []) {
  const layers = {};
  for (const m of MODULES) layers[m.toLowerCase()] = [`app/code/Magento/${m}/**`];
  const outside = [...others.filter((m) => !MODULES.includes(m)).sort().map((m) => `app/code/Magento/${m}/**`), "lib/internal/Magento/Framework/**"];
  return { format: 1, languages: ["php"], module: "file", layers, exclude: ["**/Test/**"], outside };
}

export function parseArgs(argv) {
  const opts = { repo: null, out: null, wide: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo" && argv[i + 1]) opts.repo = resolve(argv[++i]);
    else if (a === "--out" && argv[i + 1]) opts.out = resolve(argv[++i]);
    else if (a === "--wide") opts.wide = true;
    else throw new Error(`unknown argument: ${a}\n${USAGE}`);
  }
  opts.out ??= join(here, opts.wide ? "results-wide.md" : "results.md");
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

function cacheDir(wide = false) {
  const xdg = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(xdg, "keylang", "bench", wide ? "magento2-wide" : "magento2");
}

const OFFLINE_PROMPT = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

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
    must(run("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", MAGENTO_TAG, MAGENTO_URL, dir], { env: OFFLINE_PROMPT }), "git clone");
    must(run("git", ["-C", dir, "sparse-checkout", "set", ...SPARSE_PATHS]), "git sparse-checkout");
  }
  return dir;
}

/**
 * `--wide`: a worktree of the cached clone with a (non-cone) sparse-checkout of its own, so the
 * narrow clone keeps its five modules. Its checkout fetches the blobs into the cached clone.
 */
export function ensureWideRepo(repo) {
  if (repo) return ensureRepo(repo);
  const base = ensureRepo(null);
  const dir = cacheDir(true);
  if (!existsSync(join(dir, ".git"))) {
    process.stderr.write(`adding the wide worktree ${dir} of ${base}\n`);
    must(run("git", ["-C", base, "worktree", "add", "--detach", "--no-checkout", dir, "HEAD"]), "git worktree add");
    must(run("git", ["-C", dir, "sparse-checkout", "set", "--no-cone", ...WIDE_SPARSE_PATTERNS]), "git sparse-checkout");
    must(run("git", ["-C", dir, "checkout", "--detach", "HEAD"], { env: OFFLINE_PROMPT }), "git checkout");
  }
  return dir;
}

/** The module directories of `app/code/Magento` in a checkout, sorted. */
export function magentoModules(repo) {
  const dir = join(repo, "app", "code", "Magento");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** `/usr/bin/time -v` around the child when available: wall time and maxRSS come from it; otherwise from `hrtime` and `n/a`. */
function timed(args, cwd, heap) {
  const start = process.hrtime.bigint();
  const withTime = existsSync(TIME);
  const r = withTime ? run(TIME, ["-v", process.execPath, heap, ...args], { cwd }) : run(process.execPath, [heap, ...args], { cwd });
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

export const seconds = (ms) => `${(ms / 1000).toFixed(1)} с`;
export const megabytes = (kb) => (kb === null ? "n/a (немає /usr/bin/time)" : `${Math.round(kb / 1024)} МБ`);

/**
 * The report's title and intro: what was checked out and how it was split. Deterministic for the
 * same sources (no time, no paths); `outsideModules` is the count of `--wide` modules outside.
 */
export function reportHeader({ wide, sha, outsideModules = 0, verdicts, coverage, warnings, drafts }) {
  const layers = MODULES.map((m) => `\`${m}\``).join(", ");
  const checkout = wide
    ? `sparse-checkout \`--wide\`: модулі ${layers} як шари; решта ${outsideModules} модулів \`app/code/Magento\` і весь \`lib/internal/Magento/Framework\` (без \`Test\`) як \`outside\` — лише декларації; \`app/etc/di.xml\` і \`di.xml\` усіх модулів читає адаптер Magento; \`exclude: ["**/Test/**"]\`.`
    : `sparse-checkout: модулі ${layers} як шари, \`lib/internal/Magento/Framework/{${FRAMEWORK.join(",")}}\` як \`outside\`, \`exclude: ["**/Test/**"]\`.`;
  const intro = [
    `[magento/magento2](${MAGENTO_URL.replace(/\.git$/, "")}) тег \`${MAGENTO_TAG}\` (коміт \`${sha}\`), ${checkout}`,
    "",
    `Як відтворити: \`node bench/magento/run.mjs${wide ? " --wide" : ""} [--repo <клон>]\` — див. [README](README.md). Цей файл пише бенч; змінюється тільки блок «Цього запуску».${wide ? " Вузький бенч (типовий) — [results.md](results.md)." : ""}`,
    "",
    `\`check --format json\`: ${verdicts.fail} fail, ${verdicts.unverified} unverified, ${verdicts.ok} ok, ${verdicts.warning} warning; записів coverage ${coverage}. \`map\`: ${warnings} попереджень.`,
    "",
    ...drafts.map((d) => `\`draft flow ${d.trigger} --mode algo --print\`: ${d.exit === 0 ? `кроків ${d.steps} (разом із тригером)` : `код ${d.exit}`}.`),
  ];
  return { title: wide ? "Бенч Magento (широкий): business-flows" : "Бенч Magento: базова лінія business-flows", intro };
}

export function main(argv) {
  const opts = parseArgs(argv);
  const repo = opts.wide ? ensureWideRepo(opts.repo) : ensureRepo(opts.repo);
  const heap = opts.wide ? WIDE_HEAP : HEAP;
  const describe = run("git", ["-C", repo, "describe", "--tags", "--always"]);
  const commit = run("git", ["-C", repo, "rev-parse", "--short", "HEAD"]);
  const tag = describe.status === 0 ? describe.stdout.trim() : "unknown";
  const sha = commit.status === 0 ? commit.stdout.trim() : "unknown";

  const others = opts.wide ? magentoModules(repo).filter((m) => !MODULES.includes(m)) : [];
  writeFileSync(join(repo, "keylang.json"), `${JSON.stringify(benchConfig(others), null, 2)}\n`);
  // A cold `map`: the fact cache of the previous run would make the time incomparable with spec §2.
  rmSync(join(repo, ".keylang", "cache"), { recursive: true, force: true });

  const map = timed([bin, "map"], repo, heap);
  if (map.status !== 0) throw new Error(`keylang map failed (exit ${map.status}):\n${map.stderr.trimEnd().split("\n").slice(-10).join("\n")}`);
  const warnings = map.stderr.split("\n").filter((l) => l.startsWith("warning:")).length;
  const mapSummary = map.stderr.trimEnd().split("\n").at(-1) ?? "";

  const check = timed([bin, "check", "--format", "json"], repo, heap);
  let checkJson = { results: [], coverage: [] };
  try {
    checkJson = JSON.parse(check.stdout);
  } catch {
    throw new Error(`keylang check --format json did not print JSON (exit ${check.status}):\n${check.stderr.trimEnd().split("\n").slice(-10).join("\n")}`);
  }
  const verdicts = { fail: 0, unverified: 0, ok: 0, warning: 0 };
  for (const r of checkJson.results) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;

  const drafts = DRAFTS.map((trigger) => {
    const d = run(process.execPath, [heap, bin, "draft", "flow", trigger, "--mode", "algo", "--print"], { cwd: repo });
    return { trigger, text: d.status === 0 ? d.stdout : "", exit: d.status };
  });

  const snapshot = JSON.parse(readFileSync(join(repo, ".keylang", "index.json"), "utf8"));
  const expect = JSON.parse(readFileSync(join(here, "expect.json"), "utf8"));
  const metrics = collectMetrics(snapshot, { drafts, expect });

  const keylangSha = run("git", ["-C", here, "rev-parse", "--short", "HEAD"]);
  const header = reportHeader({
    wide: opts.wide,
    sha,
    outsideModules: others.length,
    verdicts,
    coverage: checkJson.coverage.length,
    warnings,
    drafts: drafts.map((d) => ({ trigger: d.trigger, exit: d.exit, steps: metrics.drafts.find((x) => x.trigger === d.trigger)?.steps.length ?? 0 })),
  });
  const runRows = [
    ["Дата", new Date().toISOString().slice(0, 10)],
    ["keylang", keylangSha.status === 0 ? `\`${keylangSha.stdout.trim()}\`` : "unknown"],
    ["Node", process.version],
    ["Клон", `\`${repo}\` (\`git describe\`: \`${tag}\`)`],
    [`\`map\` без кешу фактів (\`node ${heap}\`)`, `${seconds(map.wallMs)}, maxRSS ${megabytes(map.maxRssKb)}`],
    ["`check --format json`", `${seconds(check.wallMs)}, maxRSS ${megabytes(check.maxRssKb)}`],
    ["Підсумок `map`", mapSummary.replace(/\|/g, "\\|")],
    ["snapshotId", `\`${snapshot.snapshotId ?? "n/a"}\``],
  ];
  const report = formatReport(metrics, { ...header, run: runRows });
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, report);

  process.stdout.write(`${summaryLine(metrics)}\n`);
  if (metrics.golden) {
    const missing = metrics.golden.ids.filter((g) => !g.inFlow).map((g) => g.id);
    process.stdout.write(`golden in ${metrics.golden.flow}: found ${metrics.golden.found}/${metrics.golden.total}${missing.length ? `; missing: ${missing.join(", ")}` : ""}\n`);
    for (const e of metrics.golden.events) process.stdout.write(`event ${e.name}: ${e.id ?? "n/a"}\n`);
  }
  process.stdout.write(`map ${seconds(map.wallMs)} maxRSS ${megabytes(map.maxRssKb)}; check ${seconds(check.wallMs)} maxRSS ${megabytes(check.maxRssKb)}\n${opts.out}: written\n`);
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
