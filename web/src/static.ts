// Web page (web/src), static-export transport.
// The transport of a static export (`keylang web --export`): the answers lie
// in `data/<shard>.js`, scripts that call `keylangData({key: answer})`. A
// script, not `fetch`: a page opened from `file://` may load one, but may not
// fetch. A request loads its shard once; an answer the export did not
// compute (an ID it never saw) is a 404 that says so.

import { keyShard, requestKey, type Reply, type Transport } from "./api.ts";

interface Answer {
  status: number;
  type: string;
  body: string;
  file?: string;
}

// Every answer loaded so far, by request key, from all shards.
const answers = new Map<string, Answer>();

// One promise per shard: concurrent requests to the same shard share one script load.
const loading = new Map<number, Promise<void>>();

declare global {
  interface Window {
    /** What each data script of the export calls with its answers, by request key. */
    keylangData: (batch: Record<string, Answer>) => void;
  }
}

// A loaded data script calls this; its answers join the shared table.
window.keylangData = (batch) => {
  for (const [key, answer] of Object.entries(batch)) answers.set(key, answer);
};

/** Loads `data/<shard>.js` once by adding a script tag; resolves when its answers are in the table. */
function loadShard(shard: number): Promise<void> {
  let done = loading.get(shard);

  if (!done) {
    done = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `data/${shard}.js`;
      script.onload = () => resolve();
      script.onerror = () => {
        // The next request tries again.
        loading.delete(shard);
        reject(new Error(`cannot load data/${shard}.js of this export`));
      };

      document.head.append(script);
    });
    loading.set(shard, done);
  }

  return done;
}

/** A read-only `Transport` that answers from the export's precomputed shards; `shards` is how many the export wrote. */
export class StaticTransport implements Transport {
  readonly kind = "static";
  private readonly shards: number;

  constructor(shards: number) {
    this.shards = shards;
  }

  async send(method: "GET" | "POST" | "PUT", path: string, query: URLSearchParams): Promise<Reply> {
    // An export is a snapshot on disk: writes are refused, and a request is looked up by the same key the export used.
    if (method !== "GET") return { status: 403, type: "application/json", text: JSON.stringify({ error: "read-only: a static export writes nothing" }) };
    const key = requestKey(path, query);
    await loadShard(keyShard(key, this.shards));
    const answer = answers.get(key);

    if (!answer) return { status: 404, type: "application/json", text: JSON.stringify({ error: `not in this export: ${key}` }) };

    const reply: Reply = { status: answer.status, type: answer.type, text: answer.body };

    if (answer.file) reply.file = answer.file;

    return reply;
  }
}
