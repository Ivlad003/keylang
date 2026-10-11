// `node:crypto` for the analysis in the browser: the synchronous SHA-256
// keylang hashes text with (`createHash("sha256")…digest("hex")`), from
// @noble/hashes; Web Crypto would make every hash a promise.

import { sha256 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";

const encoder = new TextEncoder();

export class Hash {
  private readonly state = sha256.create();

  update(data: string | Uint8Array): this {
    this.state.update(typeof data === "string" ? encoder.encode(data) : data);

    return this;
  }

  digest(encoding?: "hex" | "base64" | "base64url"): string | Buffer {
    const bytes = Buffer.from(this.state.digest());

    return encoding === undefined ? bytes : bytes.toString(encoding);
  }
}

export function createHash(algorithm: string): Hash {
  if (algorithm.toLowerCase() !== "sha256") throw new Error(`crypto: only sha256 in the browser, not ${algorithm}`);

  return new Hash();
}

export function randomBytes(size: number): Buffer {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)));
}

export default { createHash, randomBytes, Hash };
