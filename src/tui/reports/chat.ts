// The report of the clip's reply (ADR 0021): what the model answered, the
// block it gave, and what it read — the system prompt and the prompt, as
// the operation built them from the request — so a reply can be checked
// against its question after the fact, as F4 shows the pack before it.

import { relative, resolve } from "node:path";
import { toPosix } from "../../config.ts";
import { assistantPrompt } from "../../operations.ts";
import { BOLD, codeOf, messageRow, outcomeRow, textRows, type Report } from "./rows.ts";

/** How long the F6 list shows the person's message. */
const PARAMS_CELLS = 40;

export const CHAT_REPORTS: { "assistant-reply": Report<"assistant-reply"> } = {
  "assistant-reply": {
    label: () => "clip",
    params: (request) => {
      const line = (request.history.at(-1)?.text ?? "").split("\n")[0]!;
      return line.length > PARAMS_CELLS ? `${line.slice(0, PARAMS_CELLS - 1)}…` : line;
    },
    summary: (_record, result) => `${result.payload.proposal === null ? "replied" : `replied with a block for ${result.payload.proposal.path}`}${codeOf(result.exitCode)}`,
    rows(state, record, result, view) {
      const { payload } = result;
      const rows = [
        { text: `Clip · ${payload.agent} · the model's reply; nothing written by it`, style: BOLD },
        outcomeRow(view.summary, true),
        ...result.messages.map(messageRow),
        ...(payload.reply === "" ? [] : textRows("reply", payload.reply)),
        ...(payload.proposal === null ? [] : textRows(`block for ${payload.proposal.path}`, payload.proposal.text)),
      ];
      const request = record.params;
      if (request.kind !== "assistant-reply") return rows;
      // The spec directory as the analysis reads it now: the prompt names it.
      const specDir = toPosix(relative(request.root, resolve(request.root, state.analysis?.config.dir ?? "keylang")));
      const asked = assistantPrompt(request, specDir);
      return [...rows, ...textRows("system prompt", asked.system), ...textRows("prompt", asked.prompt)];
    },
  },
};
