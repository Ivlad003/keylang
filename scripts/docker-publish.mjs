// Builds the image of the Dockerfile for linux/amd64 and linux/arm64 and
// pushes it to a registry as <image>:<version of package.json> and
// <image>:latest, with docker buildx. The arm64 half runs its RUN steps under
// QEMU on an amd64 host: binfmt handlers must be installed
// (`docker run --privileged --rm tonistiigi/binfmt --install arm64`), and the
// registry login is the person's own (`docker login`).
//
// usage: node scripts/docker-publish.mjs --image <name> [--platforms <list>] [--no-latest] [--dry-run]
// --dry-run prints the command and runs nothing.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(text) {
  process.stderr.write(`docker-publish: ${text}\n`);
  process.exit(2);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      image: { type: "string" },
      platforms: { type: "string", default: "linux/amd64,linux/arm64" },
      "no-latest": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(error.message);
}
if (!values.image || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/.test(values.image)) fail("--image <namespace/name> is required, e.g. --image ivlad003/keylang");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tags = [`${values.image}:${version}`, ...(values["no-latest"] ? [] : [`${values.image}:latest`])];
const args = ["buildx", "build", "--platform", values.platforms, ...tags.flatMap((tag) => ["--tag", tag]), "--label", `org.opencontainers.image.version=${version}`, "--label", "org.opencontainers.image.source=https://github.com/Ivlad003/keylang", "--push", root];
process.stderr.write(`docker ${args.join(" ")}\n`);
if (values["dry-run"]) process.exit(0);
const run = spawnSync("docker", args, { stdio: "inherit" });
if (run.error) fail(run.error.message);
process.exit(run.status ?? 2);
