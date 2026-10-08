// Reports of discovered flows: the generated view `flows discover` writes
// (each flow opens at its heading in the view), and the one flow `flows
// adopt` proposed as a spec.

import type { FlowsDiscoverPayload } from "../../operations.ts";
import { THEME } from "../theme.ts";
import { BOLD, codeOf, messageRow, MUTED, outcomeRow, shortId, type Report, type ReportItem, type ReportRow } from "./rows.ts";

type DiscoverKind = "flows-discover" | "flows-adopt";

/** Each discovered flow at its `# flow` heading in the view's file. */
function flowPlaces(payload: FlowsDiscoverPayload): ReportItem[] {
  return payload.flows.map((flow) => {
    const path = `${payload.dir}/${flow.file}`;
    const text = payload.files.find((file) => file.path === path)?.text ?? "";
    const line = text.split("\n").indexOf(`# flow ${flow.name}`) + 1;
    return { file: path, line: Math.max(line, 1), col: 1, text: `${flow.name}  ${flow.entry.kind} ${flow.entry.label}  ${flow.steps.length} step(s), ${flow.holes} hole(s)` };
  });
}

export const DISCOVER_REPORTS: { [K in DiscoverKind]: Report<K> } = {
  "flows-discover": {
    label: (request) => `flows discover${request.output === "check" ? " --check" : request.output === "print" ? " --print" : ""}${request.only !== undefined ? ` --kind ${request.only}` : ""}${request.layer !== undefined ? ` --layer ${request.layer}` : ""}`,
    params: (request) => request.output,
    summary: (_record, result) => `${result.payload.summary}${codeOf(result.exitCode)}`,
    rows(_state, _record, result, view) {
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Discovered flows · ${payload.dir}/ · a generated view, check does not read it · fresh snapshot ${shortId(payload.snapshotId)}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        { text: "  a draft per entry point; `keylang flows adopt <name>` proposes one as a spec", style: MUTED },
      ];
      flowPlaces(payload).forEach((item, index) => rows.push({ text: `  ${item.text}`, style: index === view.selected ? THEME.selected : THEME.panel, gap: index }));
      if (payload.flows.length > 0) rows.push({ text: "  Tab, then ↑↓ select a flow and Enter opens it in the view", style: THEME.hint });
      for (const message of result.messages) rows.push(messageRow(message));
      return rows;
    },
    items: { noun: "flow", of: (_state, result) => flowPlaces(result.payload) },
  },
  "flows-adopt": {
    label: (request) => `flows adopt ${request.name}${request.into !== undefined ? ` --into ${request.into}` : ""}`,
    params: (request) => request.name,
    summary: (_record, result) => `${result.payload.proposal !== null ? `proposed for ${result.payload.candidate.target}` : "nothing written"}${codeOf(result.exitCode)}`,
    rows(_state, _record, result, view) {
      const rows: ReportRow[] = [{ text: `Adopt flow ${result.payload.flow.name} → ${result.payload.candidate.target}`, style: BOLD }, outcomeRow(view.summary, result.exitCode === 0)];
      for (const message of result.messages) rows.push(messageRow(message));
      for (const line of result.payload.flow.text.trimEnd().split("\n")) rows.push({ text: `  ${line}`, style: THEME.panel });
      return rows;
    },
  },
};
