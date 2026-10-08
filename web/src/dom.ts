// Small DOM helpers the page's parts share: no framework, plain elements.

export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`the page has no #${id}`);
  return found as T;
}

export function make<K extends keyof HTMLElementTagNameMap>(tag: K, props: { className?: string; text?: string; title?: string } = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title !== undefined) node.title = props.title;
  node.append(...children);
  return node;
}

/** A plain button (never a form's submit). */
export function button(text: string, onClick: () => void, props: { className?: string; title?: string } = {}): HTMLButtonElement {
  const node = make("button", { ...props, text });
  node.type = "button";
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return node;
}

/** `file:line` as a `vscode://file/<root>/<file>:<line>` link, or as text without the root. */
export function codeLink(root: string | undefined, file: string, line: number | null | undefined): HTMLElement {
  const text = `${file}${line ? `:${line}` : ""}`;
  if (!root) return make("code", { text });
  const a = make("a", { text, title: "open in VS Code" });
  a.href = `vscode://file/${encodeURI(`${root.replace(/\\/g, "/").replace(/\/$/, "")}/${file}`)}${line ? `:${line}` : ""}`;
  a.className = "code-link";
  return a;
}
