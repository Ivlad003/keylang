// `node:string_decoder` for the analysis in the browser: TextDecoder in stream mode.

/** Decodes byte chunks to text, holding back a multi-byte character split across chunks until the next one. */
export class StringDecoder {
  private readonly decoder: InstanceType<typeof TextDecoder>;

  // Node's name `utf8` is not a TextDecoder label; other names are passed through as is.
  constructor(encoding = "utf8") {
    this.decoder = new TextDecoder(encoding === "utf8" ? "utf-8" : encoding);
  }

  write(chunk: Uint8Array): string {
    return this.decoder.decode(chunk, { stream: true });
  }

  /** Decodes the last chunk and flushes what was held back. */
  end(chunk?: Uint8Array): string {
    return (chunk ? this.decoder.decode(chunk, { stream: true }) : "") + this.decoder.decode();
  }
}

export default { StringDecoder };
