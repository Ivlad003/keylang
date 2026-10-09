// «Export BPMN» and «Export draw.io» on `/diagrams` (business-flows/28): the
// open view as a file from `GET /api/export?format=…&<view query>`, with the
// same Bearer token as every other request, saved through a blob link. The
// server writes the bytes `keylang export bpmn|drawio` writes.

import { errorOf, transport, type ViewQuery } from "./api.ts";

const FORMATS = [
  { format: "bpmn", label: "Export BPMN", title: "BPMN 2.0 with its diagram (Camunda Modeler, bpmn.io)" },
  { format: "drawio", label: "Export draw.io", title: "draw.io file; `keylang import drawio` reads it back as a proposal" },
] as const;

async function download(query: ViewQuery, format: string, report: (text: string) => void): Promise<void> {
  const params = new URLSearchParams(query);
  params.set("format", format);
  const response = await transport().send("GET", "/api/export", params);
  if (response.status !== 200) {
    report(response.status === 403 && transport().kind === "server" ? "No access: open the URL printed by `keylang web` (it carries the access token)." : `export failed: ${errorOf(response.text)}`);
    return;
  }
  // The file name the server suggests, else `diagram.<format>`.
  const url = URL.createObjectURL(new Blob([response.text], { type: response.type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = response.file ?? `diagram.${format}`;
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
