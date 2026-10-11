// Technologies a `# system` names (system-design §4): the component kind
// each one is and the packages that talk to it, in every ecosystem keylang
// reads (npm names, Python and Rust import names, Composer names). `check`
// takes a driver import as the evidence of a relation, and discovery turns an
// imported driver into a component. Data only, no I/O.
// Used by `# system` checking (spec → rules) and by system discovery from the
// snapshot. Entry points: `TECHNOLOGIES`, `technologyOf` (name → technology),
// `evidenceIds` and `technologiesOfPackage` (technology ↔ external module IDs).

import { externalSegment, EXTERNAL } from "./external-ids.ts";
import type { ComponentKind } from "./parser.ts";

/** One catalog entry: a technology, the component kind it is and its driver packages. */
export interface Technology {
  /** The canonical name: what discovery writes, what aliases resolve to. */
  name: string;
  kind: ComponentKind;
  aliases: readonly string[];
  /** Packages whose import shows the code talks to it. */
  packages: readonly string[];
  /** SQL databases: a generic SQL client or ORM is evidence too. */
  sql?: true;
}

/** Clients and ORMs that talk to any SQL database. */
const SQL_CLIENTS = ["@prisma/client", "prisma", "typeorm", "knex", "sequelize", "drizzle-orm", "kysely", "@mikro-orm/core", "objection", "sqlalchemy", "peewee", "tortoise", "sqlx", "diesel", "sea_orm", "sea-orm", "doctrine/dbal", "doctrine/orm", "illuminate/database"];

/** AWS's Python SDK talks to every AWS service. */
const BOTO = ["boto3", "botocore", "aioboto3"];

/** The catalog. Order matters only for `technologiesOfPackage`, which lists matches in this order. */
export const TECHNOLOGIES: readonly Technology[] = [
  // Any SQL database: what a generic client or ORM shows when no driver names the database.
  { name: "sql", kind: "db", sql: true, aliases: ["database", "rdbms"], packages: [] },
  { name: "postgres", kind: "db", sql: true, aliases: ["postgresql", "pg", "aurora", "neon", "supabase", "cockroachdb"], packages: ["pg", "postgres", "pg-promise", "@neondatabase/serverless", "@vercel/postgres", "slonik", "psycopg2", "psycopg", "asyncpg", "tokio_postgres", "tokio-postgres"] },
  { name: "mysql", kind: "db", sql: true, aliases: ["mariadb", "planetscale"], packages: ["mysql", "mysql2", "@planetscale/database", "pymysql", "MySQLdb", "aiomysql", "mysql_async"] },
  { name: "sqlite", kind: "db", sql: true, aliases: ["sqlite3", "libsql", "turso"], packages: ["better-sqlite3", "sqlite3", "sqlite", "@libsql/client", "rusqlite", "aiosqlite"] },
  { name: "mssql", kind: "db", sql: true, aliases: ["sqlserver", "sql-server"], packages: ["mssql", "tedious", "pyodbc", "pymssql", "tiberius"] },
  { name: "oracle", kind: "db", sql: true, aliases: [], packages: ["oracledb", "cx_Oracle"] },
  { name: "mongodb", kind: "db", aliases: ["mongo", "documentdb"], packages: ["mongodb", "mongoose", "pymongo", "motor", "mongoengine"] },
  { name: "dynamodb", kind: "db", aliases: ["dynamo"], packages: ["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb", "dynamoose", "aws_sdk_dynamodb", ...BOTO] },
  { name: "cassandra", kind: "db", aliases: ["scylla", "scylladb"], packages: ["cassandra-driver", "cassandra", "scylla"] },
  { name: "neo4j", kind: "db", aliases: [], packages: ["neo4j-driver", "neo4j"] },
  { name: "redis", kind: "cache", aliases: ["valkey", "elasticache", "upstash", "keydb"], packages: ["redis", "ioredis", "@upstash/redis", "@redis/client", "aioredis", "deadpool_redis", "predis/predis"] },
  { name: "memcached", kind: "cache", aliases: ["memcache"], packages: ["memcached", "memjs", "pymemcache", "pylibmc"] },
  { name: "kafka", kind: "queue", aliases: ["msk", "redpanda"], packages: ["kafkajs", "@confluentinc/kafka-javascript", "node-rdkafka", "confluent_kafka", "kafka", "aiokafka", "rdkafka"] },
  { name: "rabbitmq", kind: "queue", aliases: ["amqp", "rabbit"], packages: ["amqplib", "amqp-connection-manager", "pika", "aio_pika", "kombu", "lapin"] },
  { name: "sqs", kind: "queue", aliases: [], packages: ["@aws-sdk/client-sqs", "sqs-consumer", "aws_sdk_sqs", ...BOTO] },
  { name: "sns", kind: "queue", aliases: [], packages: ["@aws-sdk/client-sns", "aws_sdk_sns", ...BOTO] },
  { name: "nats", kind: "queue", aliases: ["jetstream"], packages: ["nats", "async_nats"] },
  { name: "pubsub", kind: "queue", aliases: ["google-pubsub"], packages: ["@google-cloud/pubsub", "google.cloud.pubsub"] },
  { name: "bullmq", kind: "queue", aliases: ["bull"], packages: ["bullmq", "bull", "bee-queue"] },
  { name: "celery", kind: "queue", aliases: [], packages: ["celery"] },
  { name: "s3", kind: "storage", aliases: ["minio", "r2"], packages: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner", "aws-sdk", "aws_sdk_s3", "minio", ...BOTO] },
  { name: "gcs", kind: "storage", aliases: ["google-cloud-storage"], packages: ["@google-cloud/storage", "google.cloud.storage"] },
  { name: "azure-blob", kind: "storage", aliases: ["blob"], packages: ["@azure/storage-blob", "azure.storage.blob"] },
  { name: "elasticsearch", kind: "search", aliases: ["elastic", "es"], packages: ["@elastic/elasticsearch", "elasticsearch", "elasticsearch-dsl"] },
  { name: "opensearch", kind: "search", aliases: [], packages: ["@opensearch-project/opensearch", "opensearchpy"] },
  { name: "meilisearch", kind: "search", aliases: ["meili"], packages: ["meilisearch"] },
  { name: "typesense", kind: "search", aliases: [], packages: ["typesense"] },
  { name: "algolia", kind: "search", aliases: [], packages: ["algoliasearch"] },
  { name: "clickhouse", kind: "warehouse", aliases: [], packages: ["@clickhouse/client", "clickhouse_connect", "clickhouse"] },
  { name: "bigquery", kind: "warehouse", aliases: [], packages: ["@google-cloud/bigquery", "google.cloud.bigquery"] },
  { name: "snowflake", kind: "warehouse", aliases: [], packages: ["snowflake-sdk", "snowflake"] },
  { name: "stripe", kind: "external", aliases: [], packages: ["stripe", "@stripe/stripe-js"] },
  { name: "twilio", kind: "external", aliases: [], packages: ["twilio"] },
  { name: "sendgrid", kind: "external", aliases: [], packages: ["@sendgrid/mail", "sendgrid"] },
  { name: "resend", kind: "external", aliases: [], packages: ["resend"] },
  { name: "openai", kind: "external", aliases: [], packages: ["openai"] },
  { name: "anthropic", kind: "external", aliases: ["claude"], packages: ["@anthropic-ai/sdk", "anthropic"] },
  { name: "slack", kind: "external", aliases: [], packages: ["@slack/web-api", "@slack/bolt", "slack_sdk"] },
  { name: "sentry", kind: "external", aliases: [], packages: ["@sentry/node", "@sentry/nextjs", "sentry_sdk"] },
  { name: "firebase", kind: "external", aliases: [], packages: ["firebase-admin", "firebase", "firebase_admin"] },
  { name: "auth0", kind: "auth", aliases: [], packages: ["auth0", "@auth0/nextjs-auth0", "express-openid-connect"] },
  { name: "clerk", kind: "auth", aliases: [], packages: ["@clerk/clerk-sdk-node", "@clerk/nextjs", "@clerk/backend"] },
  { name: "keycloak", kind: "auth", aliases: [], packages: ["keycloak-connect", "keycloak-js", "python-keycloak", "keycloak"] },
];

// Lookup by lowercased name or alias; a later entry wins a shared word.
const BY_WORD = new Map<string, Technology>();

for (const tech of TECHNOLOGIES) for (const word of [tech.name, ...tech.aliases]) BY_WORD.set(word.toLowerCase(), tech);

/** The technology a component's text starts with (`postgres 16`, `PostgreSQL`), or null when it names none of the catalog. */
export function technologyOf(text: string | null | undefined): Technology | null {
  // Only the first word counts (`postgres 16` → postgres), without a trailing punctuation mark.
  const word = text?.trim().split(/\s+/)[0]?.toLowerCase().replace(/[,;:]$/, "");

  return word ? (BY_WORD.get(word) ?? null) : null;
}

/** The external IDs whose import is evidence of talking to `tech`. */
export function evidenceIds(tech: Technology): Set<string> {
  // A SQL database also accepts any generic SQL client or ORM as evidence.
  const packages = tech.sql ? [...tech.packages, ...SQL_CLIENTS] : tech.packages;

  return new Set(packages.map((pkg) => `${EXTERNAL}.${externalSegment(pkg)}`));
}

/** What a package's external ID means (`external.ioredis` → redis): the technologies whose own drivers include it. */
export function technologiesOfPackage(externalId: string): Technology[] {
  return TECHNOLOGIES.filter((tech) => tech.packages.some((pkg) => `${EXTERNAL}.${externalSegment(pkg)}` === externalId));
}

/** A generic SQL client or ORM (`@prisma/client`, `typeorm`): evidence of some SQL database, not of which. */
export function isSqlClient(externalId: string): boolean {
  return SQL_CLIENTS.some((pkg) => `${EXTERNAL}.${externalSegment(pkg)}` === externalId);
}
