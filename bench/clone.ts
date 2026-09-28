// Shallow-clone the benchmark repositories into bench/repos/.
// Usage: node bench/clone.ts [--voice-transcriber <path>]
// voice-transcriber is private: pass a local checkout to link it, otherwise it is skipped.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const REPOS = [
  "Ivlad003/kosmo-tui",
  "SalesforceCommerceCloud/storefront-next-template",
  "tshemsedinov/reslop",
  "tshemsedinov/circlecam",
  "tshemsedinov/meet-unmirror",
  "HowProgrammingWorks/Index",
  "Ivlad003/health-tracker",
];

function parseArgs(argv: string[]): { voiceTranscriber: string | null } {
  let voiceTranscriber: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--voice-transcriber" && argv[i + 1]) voiceTranscriber = resolve(argv[++i]!);
    else {
      process.stderr.write(`unknown argument: ${argv[i]}\nusage: node bench/clone.ts [--voice-transcriber <path>]\n`);
      process.exit(2);
    }
  }
  return { voiceTranscriber };
}

const { voiceTranscriber } = parseArgs(process.argv.slice(2));
const repos = join(import.meta.dirname, "repos");
mkdirSync(repos, { recursive: true });
for (const slug of REPOS) {
  const dir = join(repos, slug.slice(slug.indexOf("/") + 1));
  if (existsSync(dir)) continue;
  const clone = spawnSync("git", ["clone", "-q", "--depth", "1", `https://github.com/${slug}.git`, dir], { stdio: "inherit" });
  if (clone.status !== 0) {
    process.stderr.write(`git clone ${slug} failed\n`);
    process.exit(2);
  }
}
const link = join(repos, "voice-transcriber");
if (voiceTranscriber && !existsSync(link)) symlinkSync(voiceTranscriber, link);
else if (!voiceTranscriber && !existsSync(link)) process.stderr.write("voice-transcriber skipped: pass --voice-transcriber <path>\n");
console.log("done");
