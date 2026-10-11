// Tables of a repository's schemas (system-design/07): `*.prisma` through
// `@mrleebo/prisma-ast` and `CREATE TABLE` / `CREATE INDEX` of `*.sql`
// through `pgsql-ast-parser` (PostgreSQL's grammar, which reads standard SQL;
// a dialect it does not know is a problem line, not an error). The parsers
// are pure; `readSchemas` walks the tree for the files, skipping what keylang
// does not read (dependencies, build output, `exclude` and `outside`).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Attribute, BlockAttribute, Field, Model } from "@mrleebo/prisma-ast";
import { parse, type CreateTableStatement, type Statement } from "pgsql-ast-parser";
import type { Analysis } from "./analyze.ts";
import { toPosix } from "./config.ts";
import { errorText } from "./diag.ts";
import { firstMatchingGlob } from "./glob.ts";
import { isSegment } from "./parser.ts";
import type { SystemColumn, SystemTable } from "./system.ts";
import type { DiscoveredSchema } from "./system-discover.ts";

/** A schema file's tables, or why it was not read. */
export interface SchemaRead {
  schemas: DiscoveredSchema[];
  /** `path: reason`, one per file that did not parse. */
  problems: string[];
  /** The files read, relative to the root: what an analysis cache watches. */
  files: string[];
}

/** A name as an ID segment: kept when it is one, else every other character as `_`. */
function segment(name: string): string {
  if (isSegment(name)) return name;
  const cleaned = name.replace(/[^\p{L}\p{M}\p{N}_$-]/gu, "_");
  return isSegment(cleaned) ? cleaned : `_${cleaned}`;
}

const PROVIDERS: Readonly<Record<string, string>> = { postgresql: "postgres", postgres: "postgres", cockroachdb: "postgres", mysql: "mysql", sqlite: "sqlite", sqlserver: "mssql", mongodb: "mongodb" };

function unquote(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/^"|"$/g, "") : null;
}

/** The names of an attribute argument that is an array (`[a, b]`), or of a `key: [a, b]` argument. */
function arrayArg(attribute: Attribute | BlockAttribute, key?: string): string[] {
  for (const arg of attribute.args ?? []) {
    const value = arg.value as unknown;
    const array = key === undefined ? value : typeof value === "object" && value !== null && (value as { type?: string; key?: string }).type === "keyValue" && (value as { key: string }).key === key ? (value as { value: unknown }).value : undefined;
    if (typeof array === "object" && array !== null && (array as { type?: string }).type === "array") return ((array as { args: unknown[] }).args ?? []).map((item) => String(item).replace(/^"|"$/g, ""));
  }
  return [];
}

/** `@mrleebo/prisma-ast` reads a config file (`lilconfig`, from the working directory up) when it is loaded: only when a repository has a Prisma schema. */
let prisma: Promise<typeof import("@mrleebo/prisma-ast")> | null = null;

/** The tables of a Prisma schema: a model is a table (`@@map` names it), a scalar field a column, `@relation(fields, references)` a foreign key. */
export async function prismaTables(text: string): Promise<DiscoveredSchema> {
  prisma ??= import("@mrleebo/prisma-ast");
  const schema = (await prisma).getSchema(text);
  let tech = "sql";
  for (const block of schema.list) {
    if (block.type !== "datasource") continue;
    for (const assignment of block.assignments) if (assignment.type === "assignment" && assignment.key === "provider") tech = PROVIDERS[unquote(assignment.value) ?? ""] ?? tech;
  }
  const models = schema.list.filter((block): block is Model => block.type === "model");
  const tableName = new Map<string, string>();
  for (const model of models) {
    const map = model.properties.find((property): property is BlockAttribute => property.type === "attribute" && property.name === "map");
    tableName.set(model.name, segment(unquote(map?.args?.[0]?.value) ?? model.name));
  }
  const tables: SystemTable[] = [];
  for (const model of models) {
    const fields = model.properties.filter((property): property is Field => property.type === "field");
    const blockAttributes = model.properties.filter((property): property is BlockAttribute => property.type === "attribute");
    const compositeId = new Set(blockAttributes.filter((attribute) => attribute.name === "id").flatMap((attribute) => arrayArg(attribute)));
    const foreign = new Map<string, { table: string; column: string }>();
    for (const field of fields) {
      const relation = field.attributes?.find((attribute) => attribute.name === "relation");
      if (!relation || !tableName.has(String(field.fieldType))) continue;
      const local = arrayArg(relation, "fields");
      const remote = arrayArg(relation, "references");
      local.forEach((name, i) => foreign.set(name, { table: tableName.get(String(field.fieldType))!, column: segment(remote[i] ?? "id") }));
    }
    const columns: SystemColumn[] = [];
    for (const field of fields) {
      // A relation field (another model, or a list of them) is no column: its `fields` are.
      if (tableName.has(String(field.fieldType)) || field.array) continue;
      const has = (name: string): boolean => field.attributes?.some((attribute) => attribute.name === name) ?? false;
      const fk = foreign.get(field.name);
      columns.push({ name: segment(field.name), type: segment(String(field.fieldType)), pk: has("id") || compositeId.has(field.name), unique: has("unique"), nullable: field.optional === true, fk: fk ? { ...fk, span: NO_SPAN } : null, line: 0 });
    }
    const indexes = blockAttributes.filter((attribute) => attribute.name === "index" || attribute.name === "unique").map((attribute) => ({ text: `${arrayArg(attribute).join(", ")}${attribute.name === "unique" ? " unique" : ""}`, line: 0 }));
    tables.push({ name: tableName.get(model.name)!, component: "", columns, indexes, description: "", line: 0 });
  }
  return { tech, tables };
}

const NO_SPAN = { start: { offset: 0, line: 0, col: 0 }, end: { offset: 0, line: 0, col: 0 } };

/** The tables of SQL: `CREATE TABLE` (columns, keys, `NOT NULL`, `UNIQUE`, references) and `CREATE INDEX`; other statements are skipped. */
export function sqlTables(text: string): DiscoveredSchema {
  const statements: Statement[] = parse(text);
  const tables: SystemTable[] = [];
  const byName = new Map<string, SystemTable>();
  for (const statement of statements) {
    if (statement.type === "create table") {
      const create = statement as CreateTableStatement;
      const table: SystemTable = { name: segment(create.name.name), component: "", columns: [], indexes: [], description: "", line: 0 };
      for (const column of create.columns) {
        if (column.kind !== "column") continue;
        const constraints = column.constraints ?? [];
        const reference = constraints.find((constraint) => constraint.type === "reference");
        const pk = constraints.some((constraint) => constraint.type === "primary key");
        table.columns.push({
          name: segment(column.name.name),
          type: segment(column.dataType.kind === "array" ? `${"name" in column.dataType.arrayOf ? column.dataType.arrayOf.name : "array"}[]`.replace("[]", "_array") : column.dataType.name),
          pk,
          unique: constraints.some((constraint) => constraint.type === "unique"),
          nullable: !pk && !constraints.some((constraint) => constraint.type === "not null"),
          fk: reference && reference.type === "reference" ? { table: segment(reference.foreignTable.name), column: segment(reference.foreignColumns?.[0]?.name ?? "id"), span: NO_SPAN } : null,
          line: 0,
        });
      }
      for (const constraint of create.constraints ?? []) {
        if (constraint.type === "primary key") for (const name of constraint.columns) markColumn(table, name.name, (column) => ({ ...column, pk: true, nullable: false }));
        if (constraint.type === "unique" && constraint.columns.length === 1) markColumn(table, constraint.columns[0]!.name, (column) => ({ ...column, unique: true }));
        if (constraint.type === "foreign key") constraint.localColumns.forEach((local, i) => markColumn(table, local.name, (column) => ({ ...column, fk: { table: segment(constraint.foreignTable.name), column: segment(constraint.foreignColumns[i]?.name ?? "id"), span: NO_SPAN } })));
      }
      tables.push(table);
      byName.set(create.name.name, table);
    } else if (statement.type === "create index") {
      const table = byName.get(statement.table.name);
      const names = statement.expressions.map((item) => (item.expression.type === "ref" ? item.expression.name : "expr"));
      if (table) table.indexes.push({ text: `${names.join(", ")}${statement.unique ? " unique" : ""}`, line: 0 });
    }
  }
  return { tech: "sql", tables };
}

function markColumn(table: SystemTable, name: string, change: (column: SystemColumn) => SystemColumn): void {
  const at = table.columns.findIndex((column) => column.name === segment(name));
  if (at !== -1) table.columns[at] = change(table.columns[at]!);
}

/** Directories no schema of the repository's own lies in. */
const SKIP = new Set(["node_modules", "vendor", "dist", "build", "target", "out", "coverage", "__pycache__", "venv", ".venv"]);
const MAX_FILES = 200;
const MAX_BYTES = 1_000_000;

/**
 * The schema files under the root — `*.prisma` and `*.sql`, outside hidden
 * and dependency directories and the `exclude` and `outside` globs —
 * relative to the root; at most 200 files of at most 1 MB each.
 */
export function findSchemaFiles(root: string, skip: readonly string[] = []): string[] {
  const files: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 12 || files.length >= MAX_FILES) return;
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (files.length >= MAX_FILES) return;
      if (name.startsWith(".") || SKIP.has(name)) continue;
      const abs = join(dir, name);
      const rel = toPosix(relative(root, abs));
      if (firstMatchingGlob(rel, skip) !== null) continue;
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(abs, depth + 1);
      else if ((name.endsWith(".prisma") || name.endsWith(".sql")) && stat.size <= MAX_BYTES) files.push(rel);
    }
  };
  if (existsSync(root)) walk(root, 0);
  return files;
}

/** The schema files found and parsed; a file that does not parse is a problem line. */
export async function readSchemas(root: string, files: readonly string[]): Promise<SchemaRead> {
  const out: SchemaRead = { schemas: [], problems: [], files: [...files] };
  for (const rel of files) {
    try {
      const text = readFileSync(join(root, rel), "utf8");
      const schema = rel.endsWith(".prisma") ? await prismaTables(text) : sqlTables(text);
      if (schema.tables.length > 0) out.schemas.push(schema);
    } catch (error) {
      out.problems.push(`${rel}: ${errorText(error).split("\n")[0]}`);
    }
  }
  return out;
}

type Done = Pick<Analysis, "config" | "snapshot">;
const found = new WeakMap<object, string[]>();
const reading = new WeakMap<object, Promise<SchemaRead>>();
const read = new WeakMap<object, SchemaRead>();

/** The schema files of an analysis's repository, found once per analysis: what the cache of `keylang web` watches. */
export function schemaFiles(done: Done): string[] {
  if (done.snapshot === null) return [];
  let files = found.get(done.snapshot);
  if (!files) found.set(done.snapshot, (files = findSchemaFiles(done.config.root, [...done.config.exclude, ...done.config.outside])));
  return files;
}

/**
 * The schemas of an analysis's repository, read once per analysis and only
 * when asked (the system of the code, its ER view): `check` and the language
 * server never walk the tree for them. None for specs checked without code.
 */
export function codeSchemas(done: Done): Promise<SchemaRead> {
  if (done.snapshot === null) return Promise.resolve({ schemas: [], problems: [], files: [] });
  const snapshot = done.snapshot;
  let pending = reading.get(snapshot);
  if (!pending) {
    pending = readSchemas(done.config.root, schemaFiles(done)).then((result) => {
      read.set(snapshot, result);
      return result;
    });
    reading.set(snapshot, pending);
  }
  return pending;
}

/** The schemas `codeSchemas` has read for this analysis already, or undefined. */
export function readCodeSchemas(done: Done): SchemaRead | undefined {
  return done.snapshot === null ? undefined : read.get(done.snapshot);
}
