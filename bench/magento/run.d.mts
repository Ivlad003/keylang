// Types of bench/magento/run.mjs for the tests (tests/bench-magento.test.ts).

export const MAGENTO_URL: string;
export const MAGENTO_TAG: string;
export const MODULES: string[];
export const FRAMEWORK: string[];
export const SPARSE_PATHS: string[];
export const WIDE_SPARSE_PATTERNS: string[];
export const DRAFTS: string[];

export interface BenchConfig {
  format: number;
  languages: string[];
  module: string;
  layers: Record<string, string[]>;
  exclude: string[];
  outside: string[];
}

export function benchConfig(others?: string[]): BenchConfig;
export function parseArgs(argv: string[]): { repo: string | null; out: string; wide: boolean };
export function ensureRepo(repo: string | null): string;
export function ensureWideRepo(repo: string | null): string;
export function magentoModules(repo: string): string[];
export function seconds(ms: number): string;
export function megabytes(kb: number | null): string;
export function reportHeader(options: {
  wide: boolean;
  sha: string;
  outsideModules?: number;
  verdicts: { fail: number; unverified: number; ok: number; warning: number };
  coverage: number;
  warnings: number;
  drafts: { trigger: string; exit: number | null; steps: number }[];
}): { title: string; intro: string[] };
export function main(argv: string[]): number;
