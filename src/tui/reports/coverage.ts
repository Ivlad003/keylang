// Reports of the views over the snapshot that say where to look by hand:
// «Blind spots» (`keylang coverage`) and «Integrations» (`keylang
// integrations`). Each place a report names — an orphan fn, a module with
// holes, an entry point without a flow, a call into a configuration reader,
// a call site of a client, a webhook — opens in the code.

import type { CoveragePayload, IntegrationsPayload } from "../../operations.ts";
import { THEME } from "../theme.ts";
import { BOLD, codeOf, MUTED, outcomeRow, shortId, textRows, type Report, type ReportItem, type ReportRow } from "./rows.ts";

type CoverageKind = "coverage";

/** The places of the report, in its order: orphans, modules with holes, entry points without a flow, logic in data. */
export function coveragePlaces(payload: CoveragePayload): ReportItem[] {
  return [
    ...payload.orphans.map((orphan) => ({ file: orphan.file, line: orphan.line, col: 1, text: `orphan  ${orphan.id}  ${orphan.file}:${orphan.line}` })),
    ...payload.holes.modules.filter((module) => module.file !== null).map((module) => ({ file: module.file!, line: 1, col: 1, text: `holes ${module.holes}  ${module.module}  ${module.reasons[0] !== undefined ? `${module.reasons[0].count}× ${module.reasons[0].reason}` : ""}` })),
    ...payload.unflowed.map((entry) => ({ file: entry.file, line: entry.line, col: 1, text: `no flow  ${entry.kind} ${entry.label}  ${entry.id}${entry.discovered !== null ? `  discovered ${entry.discovered.name}` : ""}` })),
    ...payload.dataLogic.sites.map((site) => ({ file: site.file, line: site.line, col: site.col, text: `check by hand  ${site.signal}  ${site.text}  ${site.file}:${site.line}` })),
  ];
}

export const COVERAGE_REPORTS: { [K in CoverageKind]: Report<K> } = {
  coverage: {
    label: () => "coverage",
    summary: (_record, result) => `${result.payload.reach.reachable}/${result.payload.reach.fns} fn reached · ${result.payload.orphans.length} orphan(s) · ${result.payload.holes.total} hole(s) · ${result.payload.dataLogic.sites.length} in data${codeOf(result.exitCode)}`,
    rows(_state, _record, result, view) {
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Blind spots · a view, check does not read it · read-only, nothing written · fresh snapshot ${shortId(payload.snapshotId)}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        { text: "  where keylang does not see: unreached fns, holes, entry points without a flow, logic in data to check by hand", style: MUTED },
      ];
      coveragePlaces(payload).forEach((item, index) => rows.push({ text: `  ${item.text}`, style: index === view.selected ? THEME.selected : THEME.panel, gap: index }));
      rows.push({ text: "  Tab, then ↑↓ select a place and Enter opens it in the code", style: THEME.hint });
      rows.push(...textRows("keylang coverage · stdout", payload.text));
      return rows;
    },
    items: { noun: "place", of: (_state, result) => coveragePlaces(result.payload) },
  },
};

/** The places of the inventory: each call site, then each webhook. */
export function integrationPlaces(payload: IntegrationsPayload): ReportItem[] {
  return [
    ...payload.outgoing.flatMap((integration) => integration.sites.map((site) => ({ file: site.file, line: site.line, col: site.col, text: `${integration.id}  ${site.callee}  ${site.host ?? (site.url === "dynamic" ? "dynamic URL" : "url n/a")}  ${site.file}:${site.line}  ← ${site.reachedFrom.length} entry point(s)` }))),
    ...payload.webhooks.map((hook) => ({ file: hook.file, line: hook.line, col: 1, text: `webhook  ${hook.label}  ${hook.id}  ${hook.file}:${hook.line}` })),
  ];
}

export const INTEGRATIONS_REPORTS: { integrations: Report<"integrations"> } = {
  integrations: {
    label: () => "integrations",
    summary: (_record, result) => `${result.payload.outgoing.length} integration(s) · ${result.payload.outgoing.reduce((sum, integration) => sum + integration.sites.length, 0)} call site(s) · ${result.payload.webhooks.length} webhook(s)${codeOf(result.exitCode)}`,
    rows(_state, _record, result, view) {
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Integrations · a view, nothing is contacted · read-only, nothing written · fresh snapshot ${shortId(payload.snapshotId)}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        { text: "  outgoing clients of resources/integrations.json by call site, incoming webhooks, queues", style: MUTED },
      ];
      integrationPlaces(payload).forEach((item, index) => rows.push({ text: `  ${item.text}`, style: index === view.selected ? THEME.selected : THEME.panel, gap: index }));
      rows.push({ text: "  Tab, then ↑↓ select a call site or webhook and Enter opens it in the code", style: THEME.hint });
      rows.push(...textRows("keylang integrations · stdout", payload.text));
      return rows;
    },
    items: { noun: "call site", of: (_state, result) => integrationPlaces(result.payload) },
  },
};
