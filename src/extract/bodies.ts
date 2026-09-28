// Function bodies by declaration position, for trace instrumentation.
// Positions match the declaration ranges of `FileFacts` (1-based line/col of
// the declaring node); offsets index the JS string (UTF-16 code units).

import { grammarFor, startCol, withTree, type Node } from "./treesitter.ts";

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
export function functionBodies(path: string, src: string): Promise<Map<string, FunctionBody>> {
  return withTree(grammarFor(path), src, (tree) => bodiesOf(tree.rootNode));
}

/** The source parses without a syntax error: an instrumented copy is checked before it replaces the original. */
export function parsesCleanly(path: string, src: string): Promise<boolean> {
  return withTree(grammarFor(path), src, (tree) => !tree.rootNode.hasError);
}

function bodiesOf(root: Node): Map<string, FunctionBody> {
  const out = new Map<string, FunctionBody>();
  const add = (declaring: Node, fn: Node): void => {
    const body = fn.childForFieldName("body");
    if (!body) return;
    const block = body.type === "statement_block";
    const key = `${declaring.startPosition.row + 1}:${startCol(declaring)}`;
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
    // `const f = () => …` and a class field `handler = () => …` are declared by the declarator or the field.
    if (node.type === "variable_declarator" || node.type === "public_field_definition" || node.type === "field_definition") {
      const value = node.childForFieldName("value");
      if (value && FUNCTIONS.has(value.type)) add(node, value);
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(root);
  return out;
}
