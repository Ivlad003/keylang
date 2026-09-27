#!/usr/bin/env node
// Entry point. Node ≥ 22.18 runs TypeScript directly (type stripping), so
// there is no build step: `src/` is the package.
import { main } from "../src/cli.ts";

process.exitCode = await main(process.argv.slice(2));
