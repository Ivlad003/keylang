// Function bodies by declaration position, for trace instrumentation.
// Positions match the declaration ranges of `FileFacts` (1-based line/col of
// the declaring node); offsets index the JS string (UTF-16 code units).

import { grammarFor, parseSource, type Node } from "./treesitter.ts";

export interface FunctionBody {
  /** Offset of the body: after `{` for a block, the expression start otherwise. */
  start: number;
  /** Offset of the closing `}` for a block, the expression end otherwise. */
  end: number;
  /** An arrow function with an expression body (`=> expr`). */
  expression: boolean;
  generator: boolean;
  async: boolean;
}

const FUNCTIONS = new Set(["function_declaration", "generator_function_declaration", "function_expression", "function", "generator_function", "arrow_function", "method_definition"]);

/** `line:col` of each declaring node → the body of its function. */
export async function functionBodies(path: string, src: string): Promise<Map<string, FunctionBody>> {
  const { tree } = await parseSource(grammarFor(path), src);
  const out = new Map<string, FunctionBody>();
  const add = (declaring: Node, fn: Node): void => {
    const body = fn.childForFieldName("body");
    if (!body) return;
    const block = body.type === "statement_block";
    const key = `${declaring.startPosition.row + 1}:${declaring.startPosition.column + 1}`;
    if (out.has(key)) return;
    out.set(key, {
      start: block ? body.startIndex + 1 : body.startIndex,
      end: block ? body.endIndex - 1 : body.endIndex,
      expression: !block,
      generator: fn.type.includes("generator") || fn.children.some((c) => c.type === "*"),
      async: fn.children.some((c) => c.type === "async"),
    });
  };
  const visit = (node: Node): void => {
    if (FUNCTIONS.has(node.type)) add(node, node);
    if (node.type === "variable_declarator") {
      const value = node.childForFieldName("value");
      if (value && FUNCTIONS.has(value.type)) add(node, value);
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(tree.rootNode);
  return out;
}
