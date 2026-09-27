#!/usr/bin/env node
// Checkout entry. `npm pack` rewrites this file to import ../dist/cli.js and
// restores this copy afterwards (scripts/pack-entry.mjs).
import { main } from "../src/cli.ts";

process.exitCode = await main(process.argv.slice(2));
