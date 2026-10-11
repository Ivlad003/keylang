// Specifiers the worker build resolves (scripts/build-web.mjs).
declare module "web-tree-sitter-package" {
  export * from "web-tree-sitter";
}

// The worker's global scope, as much of it as the worker uses: the program is
// type-checked with Node's types (it bundles keylang's modules), whose DOM-free
// globals clash with the `webworker` lib.
declare const self: {
  location: { href: string };
  postMessage(message: import("../src/local-protocol.ts").FromWorker): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
};
