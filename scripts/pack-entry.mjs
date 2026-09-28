// Swaps bin/keylang.js for the published package. The checkout keeps a static
// import of src/cli.ts so the architecture map still has an edge from the CLI
// entry; Node will not type-strip that import inside node_modules.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");

const dev = `#!/usr/bin/env node
// Checkout entry. \`npm pack\` rewrites this file to import ../dist/cli.js and
// restores this copy afterwards (scripts/pack-entry.mjs).
import { main } from "../src/cli.ts";

// \`keylang … | head\` closes stdout early; that is not an error.
process.stdout.on("error", (e) => {
  if (e.code === "EPIPE") process.exit(process.exitCode ?? 0);
  // Any other failure (a full disk) must not look like a clean, empty result.
  process.stderr.write(\`keylang: cannot write the output: \${e.message}\\n\`);
  process.exit(2);
});
process.exitCode = await main(process.argv.slice(2));
`;

const published = `#!/usr/bin/env node
import { main } from "../dist/cli.js";

// \`keylang … | head\` closes stdout early; that is not an error.
process.stdout.on("error", (e) => {
  if (e.code === "EPIPE") process.exit(process.exitCode ?? 0);
  // Any other failure (a full disk) must not look like a clean, empty result.
  process.stderr.write(\`keylang: cannot write the output: \${e.message}\\n\`);
  process.exit(2);
});
process.exitCode = await main(process.argv.slice(2));
`;

const mode = process.argv[2];
if (mode === "publish") writeFileSync(bin, published);
else if (mode === "restore") writeFileSync(bin, dev);
else {
  process.stderr.write("usage: pack-entry.mjs publish|restore\n");
  process.exitCode = 2;
}
