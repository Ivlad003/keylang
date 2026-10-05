// What the forms of operations need from the session: its state, where the
// cursor is, the configuration and model it runs with, and the way to start
// an operation. The forms reach the session only through this, so their
// module depends on no editor, panel or transport.

import type { ContextPack } from "../../agent-context.ts";
import type { OperationRequest } from "../../operations.ts";
import type { Buffer, State } from "../state.ts";

export interface FormHost {
  readonly state: State;
  /** The spec directory of the saved keylang.json, as configured (`keylang` when it cannot be read). */
  specDir(): string;
  /** The spec directory relative to the root, POSIX: where proposals for specs go. */
  proposalDir(): string;
  /** The agent the session's configuration names, or null for none. */
  agentName(): string | null;
  /** What the model sees, as the context panel (F4) shows it now. */
  contextPack(): ContextPack | null;
  /** The unsaved spec and config buffers, in path order. */
  dirtyInputs(): string[];
  /** The analysis knows `path` as a generated document. */
  generatedDoc(path: string): boolean;
  /** Something waits at `.keylang/proposals/<path>`. */
  proposalWaiting(path: string): boolean;
  /** The buffer of the open file, or null. */
  buffer(): Buffer | null;
  /** The ID under the cursor, or null. */
  idAtCursor(): string | null;
  /** The `# flow` section the cursor is in, or null. */
  flowAtCursor(): string | null;
  /** The `trigger` of the flow section under the cursor, or null. */
  triggerAtCursor(): string | null;
  /** The planned fns no code implements yet. */
  plannedFns(): string[];
  /** Runs `request` as the session's operation, after the save step when it reads dirty buffers. */
  requestOperation(action: string, request: OperationRequest): void;
  /** Runs `request` as the session's operation at once. */
  startOperation(action: string, request: OperationRequest): void;
  /** Async work the frame follows (`idle()` waits for it). */
  track(work: Promise<void>): void;
  /** Draws the frame now. */
  draw(): void;
}
