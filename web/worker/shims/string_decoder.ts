// `node:string_decoder` for the analysis in the browser: TextDecoder in stream mode.

export class StringDecoder {
  private readonly decoder: InstanceType<typeof TextDecoder>;

  constructor(encoding = "utf8") {
    this.decoder = new TextDecoder(encoding === "utf8" ? "utf-8" : encoding);
  }

  write(chunk: Uint8Array): string {
    return this.decoder.decode(chunk, { stream: true });
  }

  end(chunk?: Uint8Array): string {
    return (chunk ? this.decoder.decode(chunk, { stream: true }) : "") + this.decoder.decode();
  }
}

export default { StringDecoder };
