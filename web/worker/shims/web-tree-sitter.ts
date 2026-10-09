// web-tree-sitter as the worker loads it: the same package, with `Parser.init`
// told where its runtime WASM lies — `wasm/` beside the worker script, where
// `scripts/build-web.mjs` puts it — instead of next to a module URL the
// bundle no longer has. (`web-tree-sitter-package` is the real package: the
// build resolves it.)

import { Parser as PackageParser } from "web-tree-sitter-package";

export * from "web-tree-sitter-package";

export class Parser extends PackageParser {
  static override init(options: Record<string, unknown> = {}): Promise<void> {
    return PackageParser.init({ locateFile: (name: string) => new URL(`wasm/${name}`, self.location.href).href, ...options });
  }
}
