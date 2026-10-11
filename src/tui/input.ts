// Terminal input as events: keys (with Ctrl/Alt/Shift), SGR mouse reports,
// and bracketed paste. xterm.js sends the same sequences as a terminal, so
// one decoder serves both. A chunk may end inside a sequence or a grapheme
// cluster; the rest waits for the next chunk, and on `flush()` a lone ESC
// becomes the Escape key and a waiting cluster one key.
//
// Layer: TUI input, the first step of every key: `terminal.ts` and the web
// terminal feed raw chunks to `InputDecoder`, and `app.ts` handles the events.

import { graphemes } from "./width.ts";

/** A key press: its name, modifiers, and the text it types when printable. */
export interface KeyEvent {
  type: "key";
  /** `a`, `A`, `ж`, `enter`, `up`, `f5`, `space`, … */
  name: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Text the key types, for printable keys. */
  text?: string;
}

/** An SGR mouse report: button, action and the 0-based cell. */
export interface MouseEvent {
  type: "mouse";
  action: "down" | "up" | "move" | "drag" | "wheel-up" | "wheel-down";
  /** 0 left, 1 middle, 2 right. */
  button: number;
  /** 0-based cell. */
  x: number;
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

/** The text of one bracketed paste, line ends normalised to `\n`. */
export interface PasteEvent {
  type: "paste";
  text: string;
}

/** Every event the decoder emits. */
export type InputEvent = KeyEvent | MouseEvent | PasteEvent;

/** Bracketed paste start and end markers. */
const PASTE_START = "\x1b[200~";

const PASTE_END = "\x1b[201~";

// ESC-led patterns are built from strings: the control character is the point.
// SGR mouse report: `ESC [ < code ; x ; y` then `M` (press/move) or `m` (release).
const SGR_MOUSE = new RegExp(String.raw`^\x1b\[<(\d+);(\d+);(\d+)([Mm])`);

// A complete CSI: private marker, numeric params, intermediates, final byte.
const CSI = new RegExp(String.raw`^\x1b\[([?>=<]?)([\d;]*)([\x20-\x2f]*)([\x40-\x7e])`);

// The start of a CSI that has not reached its final byte yet: wait for more input.
const CSI_PREFIX = new RegExp(String.raw`^\x1b\[[?>=<]?[\d;]*[\x20-\x2f]*$`);

/** The modifier flags of a key. */
type Modifiers = Pick<KeyEvent, "ctrl" | "alt" | "shift">;

/** A key event; `text` only for printable keys. */
function key(name: string, mods: Partial<Modifiers> = {}, text?: string): KeyEvent {
  const event: KeyEvent = { type: "key", name, ctrl: mods.ctrl === true, alt: mods.alt === true, shift: mods.shift === true };

  if (text !== undefined) event.text = text;

  return event;
}

/** The key that types one grapheme cluster: named by it, `space` for a blank. */
function typed(cluster: string): KeyEvent {
  return key(cluster === " " ? "space" : cluster, { shift: cluster !== cluster.toLowerCase() }, cluster);
}

/** `ESC [ n ~` keys by their number (several terminals use different numbers for Home and End). */
const TILDE = new Map(Object.entries({
  "1": "home", "2": "insert", "3": "delete", "4": "end", "5": "pageup", "6": "pagedown", "7": "home", "8": "end",
  "11": "f1", "12": "f2", "13": "f3", "14": "f4", "15": "f5", "17": "f6", "18": "f7", "19": "f8", "20": "f9", "21": "f10", "23": "f11", "24": "f12",
}));

/** `ESC [ X` and `ESC O X` keys by their final letter. */
const FINAL = new Map(Object.entries({ A: "up", B: "down", C: "right", D: "left", H: "home", F: "end", P: "f1", Q: "f2", R: "f3", S: "f4" }));

/** xterm modifier parameter: value − 1 is a bit set of Shift (1), Alt (2) and Ctrl (4); absent means none. */
function modifiers(param: string | undefined): Modifiers {
  const m = Math.max(1, Number(param ?? "1")) - 1;

  return { shift: (m & 1) !== 0, alt: (m & 2) !== 0, ctrl: (m & 4) !== 0 };
}

/** Length of the longest suffix of `text` that is a proper prefix of `marker`. */
function partialSuffix(text: string, marker: string): number {
  for (let n = Math.min(text.length, marker.length - 1); n > 0; n--) if (marker.startsWith(text.slice(-n))) return n;

  return 0;
}

/** Turns raw terminal input into events, keeping incomplete sequences between chunks. */
export class InputDecoder {
  private pending = "";
  private paste: string | null = null;

  /** Events of a chunk; an incomplete sequence at the end waits for the next one. */
  feed(chunk: string): InputEvent[] {
    this.pending += chunk;
    const out: InputEvent[] = [];

    // Consume events until the input runs out or ends inside a sequence.
    for (;;) {
      // Inside a bracketed paste everything up to the end marker is text, not keys.
      if (this.paste !== null) {
        const end = this.pending.indexOf(PASTE_END);

        if (end === -1) {
          // The end marker may be split across chunks: its possible start stays pending.
          const keep = partialSuffix(this.pending, PASTE_END);
          this.paste += this.pending.slice(0, this.pending.length - keep);
          this.pending = this.pending.slice(this.pending.length - keep);

          return out;
        }

        out.push({ type: "paste", text: (this.paste + this.pending.slice(0, end)).replace(/\r\n?/g, "\n") });
        this.paste = null;
        this.pending = this.pending.slice(end + PASTE_END.length);
        continue;
      }

      if (this.pending === "") return out;
      const step = this.next(this.pending);

      if (step === null) return out;
      this.pending = this.pending.slice(step.length);

      if (step.event) out.push(step.event);
    }
  }

  /**
   * A lone ESC left after a pause is the Escape key, and a cluster that
   * waited for more is one key. A paste whose end marker never came (a
   * terminal that dropped it) ends here, so input is not swallowed for good.
   */
  flush(): InputEvent[] {
    if (this.paste !== null) {
      const text = (this.paste + this.pending).replace(/\r\n?/g, "\n");
      this.paste = null;
      this.pending = "";

      return text === "" ? [] : [{ type: "paste", text }];
    }

    if (this.pending === "") return [];
    const rest = this.pending;
    this.pending = "";

    if (rest === "\x1b") return [key("escape")];

    // A sequence cut short (a report split over a slow link) is dropped, never typed as text.
    if (rest.startsWith("\x1b[") || rest.startsWith("\x1bO")) return [];
    // ESC before the cluster makes it Alt + the cluster.
    const alt = rest.startsWith("\x1b");

    return graphemes(alt ? rest.slice(1) : rest).map((cluster) => ({ ...typed(cluster), alt }));
  }

  /** Whether a lone ESC or a cluster that may go on waits for `flush()`. */
  get waiting(): boolean {
    return this.paste === null && this.pending !== "";
  }

  /** Inside a bracketed paste, waiting for its end marker. */
  get pasting(): boolean {
    return this.paste !== null;
  }

  /** One event decoded from the start of `text` and how many UTF-16 units it took; null when more input is needed. */
  private next(text: string): { length: number; event: InputEvent | null } | null {
    const first = text[0]!;

    if (first === "\x1b") return this.escape(text);
    const code = first.charCodeAt(0);

    // Control characters: Enter, Tab, Backspace, Ctrl+Space (NUL) and Ctrl+letter (0x01–0x1a map to a–z).
    // CRLF (pasted from Windows text without bracketed paste) is one line break, as inside a bracketed paste.
    if (first === "\r") return { length: text[1] === "\n" ? 2 : 1, event: key("enter") };

    if (first === "\n") return { length: 1, event: key("enter") };

    if (first === "\t") return { length: 1, event: key("tab") };

    if (first === "\x7f" || first === "\b") return { length: 1, event: key("backspace") };

    if (code === 0) return { length: 1, event: key("space", { ctrl: true }) };

    if (code < 0x20) return { length: 1, event: key(String.fromCharCode(code + 96), { ctrl: true }) };

    // Printable ASCII before ASCII (or the end) is a cluster of its own: a megabyte typed without
    // bracketed paste is decoded without segmenting anything.
    if (code < 0x7f && (text.length === 1 || text.charCodeAt(1) < 0x7f)) return { length: 1, event: typed(first) };
    // Only the head is segmented: the whole rest of a long paste on every key would be quadratic.
    const head = text.slice(0, 64);
    const cluster = graphemes(head)[0]!;

    // A cluster of several code points at the end of the input (a decomposed letter, a ZWJ emoji) may go on
    // in the next chunk: it waits for it, or for `flush()` after a pause, and is never cut into code points.
    // A single code point is a key at once: a keyboard sends a letter whole.
    if (cluster.length === text.length && [...cluster].length > 1) return null;

    return { length: cluster.length, event: typed(cluster) };
  }

  /** A sequence led by ESC: paste start, CSI (keys, mouse, reports), SS3 (`ESC O`), or Alt + a key. */
  private escape(text: string): { length: number; event: InputEvent | null } | null {
    // A lone ESC may be the start of a sequence: wait for more input or `flush()`.
    if (text.length === 1) return null;

    if (text.startsWith(PASTE_START)) {
      this.paste = "";

      return { length: PASTE_START.length, event: null };
    }

    const second = text[1]!;

    if (second === "[") {
      const mouse = SGR_MOUSE.exec(text);

      if (mouse) return { length: mouse[0].length, event: this.mouse(Number(mouse[1]), Number(mouse[2]), Number(mouse[3]), mouse[4] === "M") };
      // A control sequence (ECMA-48 §5.4): a private marker, parameters, intermediates, a final byte.
      const csi = CSI.exec(text);

      // Not a CSI and not the start of one: ESC then `[` typed as Alt+[.
      if (!csi) return CSI_PREFIX.test(text) ? null : { length: 2, event: key("[", { alt: true }, "[") };
      const [whole, marker, params = "", intermediates, final] = csi;

      // A report the terminal sends by itself (DECRPM `\x1b[?2004;1$y`, device attributes) is one sequence and no key.
      if (marker !== "" || intermediates !== "") return { length: whole.length, event: null };
      const parts = params.split(";");

      // `ESC [ n ; m ~` keys (Insert, Delete, PageUp, F5…) with their modifiers.
      if (final === "~") return { length: whole.length, event: key(TILDE.get(parts[0] ?? "") ?? "unknown", modifiers(parts[1])) };

      // Shift+Tab.
      if (final === "Z") return { length: whole.length, event: key("tab", { shift: true }) };
      const name = FINAL.get(final!);

      return { length: whole.length, event: name ? key(name, modifiers(parts[1])) : null };
    }

    // SS3 (`ESC O X`): arrows and F1–F4 in application mode.
    if (second === "O") {
      if (text.length < 3) return null;
      const name = FINAL.get(text[2]!);

      return { length: 3, event: name ? key(name) : null };
    }

    // ESC ESC: the first one is the Escape key; the second starts the next event.
    if (second === "\x1b") return { length: 1, event: key("escape") };
    // ESC + key is Alt + key.
    const inner = this.next(text.slice(1));

    if (!inner) return null;
    const event = inner.event?.type === "key" ? { ...inner.event, alt: true } : inner.event;

    return { length: 1 + inner.length, event };
  }

  /** Decodes an SGR mouse code: bits 2–4 are Shift/Alt/Ctrl, bit 6 the wheel, bit 5 motion, bits 0–1 the button. */
  private mouse(code: number, x: number, y: number, press: boolean): MouseEvent {
    const mods = { shift: (code & 4) !== 0, alt: (code & 8) !== 0, ctrl: (code & 16) !== 0 };
    const base = { type: "mouse" as const, x: x - 1, y: y - 1, ...mods };

    if ((code & 64) !== 0) return { ...base, action: (code & 1) === 0 ? "wheel-up" : "wheel-down", button: 0 };
    const button = code & 3;

    // Motion with no button pressed (button 3) is a plain move; with a button, a drag.
    if ((code & 32) !== 0) return { ...base, action: button === 3 ? "move" : "drag", button: button === 3 ? 0 : button };

    return { ...base, action: press ? "down" : "up", button };
  }
}
