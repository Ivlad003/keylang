// `node:url` for the analysis in the browser: file URLs to POSIX paths and back.

export function fileURLToPath(url: string | URL): string {
  const parsed = url instanceof URL ? url : new URL(url);

  if (parsed.protocol !== "file:") throw new TypeError(`The URL must be of scheme file: ${String(url)}`);

  return decodeURIComponent(parsed.pathname);
}

export function pathToFileURL(path: string): URL {
  return new URL(`file://${encodeURI(path)}`);
}

export const URL_ = globalThis.URL;

export { URL_ as URL };

export default { fileURLToPath, pathToFileURL, URL: globalThis.URL };
