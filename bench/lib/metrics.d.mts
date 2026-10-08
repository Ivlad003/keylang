// Types of bench/lib/metrics.mjs for the TypeScript callers (bench/run.ts, tests).

export interface Draft {
  trigger: string;
  text: string;
}

export interface Expect {
  flow: string;
  ids: string[];
  events?: string[];
}

export interface Metrics {
  sizes: { files: number; modules: number; fns: number; types: number; deps: number; importsUnresolved: number };
  calls: { resolved: number; unresolved: number; dynamic: number; external: number; total: number; resolvedShare: string };
  holes: { byKind: [string, number][]; topReasons: [string, number][]; total: number };
  entries: [string, number][] | null;
  events: string[];
  drafts: { trigger: string; steps: string[] }[];
  golden: {
    flow: string;
    ids: { id: string; inMap: boolean; inFlow: boolean; inDrafts: string[] }[];
    events: { name: string; id: string | null; inFlow: boolean }[];
    found: number;
    total: number;
  } | null;
}

export function normaliseReason(reason: string): string;
export function draftSteps(text: string): string[];
export function percent(part: number, total: number): string;
export function collectMetrics(snapshot: unknown, options?: { drafts?: Draft[]; expect?: Expect | null }): Metrics;
export function formatReport(metrics: Metrics, options?: { title?: string; intro?: string[]; run?: [string, string][] }): string;
export function summaryLine(metrics: Metrics): string;
