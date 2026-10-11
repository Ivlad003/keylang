// JSON values at I/O boundaries: what `JSON.parse` returns, named so callers
// branch on a known contract instead of `unknown`.

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export type JsonObject = { [key: string]: JsonValue };

/** Parses JSON text; throws `SyntaxError` like `JSON.parse`. */
export function parseJson(text: string): JsonValue {
  // SAFETY: JSON.parse without a reviver yields only JSON primitives, arrays and plain objects.
  return JSON.parse(text) as JsonValue;
}

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isJsonString(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}

export function isJsonNumber(value: JsonValue | undefined): value is number {
  return typeof value === "number";
}

export function isJsonBoolean(value: JsonValue | undefined): value is boolean {
  return typeof value === "boolean";
}
