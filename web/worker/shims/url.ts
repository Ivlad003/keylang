// `node:url` for the analysis in the browser: file URLs to POSIX paths and back.

/** The POSIX path of a `file:` URL, percent-decoded; any other scheme is a TypeError, as on Node. */
export function fileURLToPath(url: string | URL): string {
  const parsed = url instanceof URL ? url : new URL(url);

  if (parsed.protocol !== "file:") throw new TypeError(`The URL must be of scheme file: ${String(url)}`);

  return decodeURIComponent(parsed.pathname);
}

/** A `file:` URL for an absolute POSIX path, with characters a URL cannot hold encoded. */
export function pathToFileURL(path: string): URL {
  return new URL(`file://${encodeURI(path)}`);
}

// The global URL re-exported under its own name; an intermediate name avoids shadowing the global in this module.
export const URL_ = globalThis.URL;

export { URL_ as URL };

export default { fileURLToPath, pathToFileURL, URL: globalThis.URL };
