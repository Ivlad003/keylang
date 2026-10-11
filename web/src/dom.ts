// Small DOM helpers the web page's parts share: no framework, plain elements.
// Part of the `keylang web` front end (web/src); entry points are `element`
// (look up a required element by id), `make` (build an element), `button` and
// `codeLink` (a `file:line` link that opens the editor).

/** The page element with this id, typed as the caller expects; throws when the markup lacks it. */
export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);

  if (!found) throw new Error(`the page has no #${id}`);

  // SAFETY: each caller names the element type its id has in the page markup src/tui/web.ts serves.
  return found as T;
}

/** A new element with optional class, text and title, and the given children appended. */
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
  // Stop the click here: buttons sit inside clickable rows and panels, which must not also react.
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });

  return node;
}

/** `file:line` as a `vscode://file/<root>/<file>:<line>` link, or as text without the root. */
export function codeLink(root: string | undefined, file: string, line: number | null | undefined): HTMLElement {
  const text = `${file}${line ? `:${line}` : ""}`;

  // Without the repository root there is no absolute path to open, so the location stays plain text.
  if (!root) return make("code", { text });
  const a = make("a", { text, title: "open in VS Code" });
  // Windows backslashes become slashes and a trailing slash is dropped, so the URL has one separator.
  a.href = `vscode://file/${encodeURI(`${root.replace(/\\/g, "/").replace(/\/$/, "")}/${file}`)}${line ? `:${line}` : ""}`;
  a.className = "code-link";

  return a;
}
