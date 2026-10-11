// `node:crypto` for the analysis in the browser: the synchronous SHA-256
// keylang hashes text with (`createHash("sha256")…digest("hex")`), from
// @noble/hashes; Web Crypto would make every hash a promise.

import { sha256 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";

const encoder = new TextEncoder();

/** An incremental SHA-256 hash, as `createHash("sha256")` returns on Node. */
export class Hash {
  private readonly state = sha256.create();

  update(data: string | Uint8Array): this {
    this.state.update(data instanceof Uint8Array ? data : encoder.encode(data));

    return this;
  }

  /** The hash as a Buffer, or as text in the given encoding. */
  digest(encoding?: "hex" | "base64" | "base64url"): string | Buffer {
    const bytes = Buffer.from(this.state.digest());

    return encoding === undefined ? bytes : bytes.toString(encoding);
  }
}

/** A SHA-256 `Hash`; any other algorithm throws, naming it, rather than hashing differently from Node. */
export function createHash(algorithm: string): Hash {
  if (algorithm.toLowerCase() !== "sha256") throw new Error(`crypto: only sha256 in the browser, not ${algorithm}`);

  return new Hash();
}

/** `size` random bytes from Web Crypto, as a Buffer. */
export function randomBytes(size: number): Buffer {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)));
}

export default { createHash, randomBytes, Hash };
