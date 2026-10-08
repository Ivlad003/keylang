// «Export BPMN» and «Export draw.io» on `/diagrams` (business-flows/28): the
// open view as a file from `GET /api/export?format=…&<view query>`, with the
// same Bearer token as every other request, saved through a blob link. The
// server writes the bytes `keylang export bpmn|drawio` writes.

import type { ViewQuery } from "./api.ts";

const TOKEN_KEY = "keylang-token";

const FORMATS = [
  { format: "bpmn", label: "Export BPMN", title: "BPMN 2.0 with its diagram (Camunda Modeler, bpmn.io)" },
  { format: "drawio", label: "Export draw.io", title: "draw.io file; `keylang import drawio` reads it back as a proposal" },
] as const;

/** The file name the server suggests, else `diagram.<format>`. */
function fileName(response: Response, format: string): string {
  const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
  return match?.[1] ?? `diagram.${format}`;
}

async function download(query: ViewQuery, format: string, report: (text: string) => void): Promise<void> {
  const params = new URLSearchParams(query);
  params.set("format", format);
  const response = await fetch(`/api/export?${params.toString()}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) ?? ""}` }, cache: "no-store" });
  if (!response.ok) {
    const text = (await response.text()).trim();
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // Plain text: `forbidden`, `server error`.
    }
    report(response.status === 403 ? "No access: open the URL printed by `keylang web` (it carries the access token)." : `export failed: ${message || response.statusText}`);
    return;
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName(response, format);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Adds the two buttons to the toolbar; `active` gives the open view (null: the buttons do nothing), `report` the status line. */
export function mountExport(toolbar: HTMLElement, active: () => ViewQuery | null, report: (text: string) => void): void {
  for (const { format, label, title } of FORMATS) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `export-${format}`;
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", () => {
      const query = active();
      if (query === null) return report("pick a view first");
      void download(query, format, report).catch((error: unknown) => report(`export failed: ${error instanceof Error ? error.message : String(error)}`));
    });
    toolbar.append(button);
  }
}
