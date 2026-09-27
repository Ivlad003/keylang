#!/usr/bin/env node
// Checkout entry. `npm pack` rewrites this file to import ../dist/cli.js and
// restores this copy afterwards (scripts/pack-entry.mjs).
import { main } from "../src/cli.ts";

// `keylang … | head` closes stdout early; that is not an error.
process.stdout.on("error", (e) => {
  if (e.code === "EPIPE") process.exit(process.exitCode ?? 0);
});
process.exitCode = await main(process.argv.slice(2));
