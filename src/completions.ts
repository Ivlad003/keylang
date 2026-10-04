// `keylang completions <shell>`: a completion script for bash, zsh or fish.
// The words come from the help text (commands and their subcommands) and
// the option table of the argument parser, so a new command or flag is
// completed as soon as `--help` and the parser know it.

export const SHELLS = ["bash", "zsh", "fish"] as const;
export type Shell = (typeof SHELLS)[number];

export function isShell(name: string): name is Shell {
  return (SHELLS as readonly string[]).includes(name);
}

/** What the script completes: commands in help order, each with its subcommands; long flags with an optional short one. */
export interface CompletionWords {
  commands: ReadonlyMap<string, readonly string[]>;
  flags: readonly { long: string; short?: string }[];
}

const WORD = /^[a-z][a-z-]*$/;

/**
 * Commands of the `Commands:` block of the help: a line indented by exactly
 * two spaces starts with a command; a plain word after it (`hook stop`,
 * `draft flow <trigger>`) is a subcommand. Placeholders and flags are not.
 */
export function helpCommands(usage: string): Map<string, string[]> {
  const commands = new Map<string, string[]>();
  let inside = false;
  for (const line of usage.split("\n")) {
    if (line === "Commands:") {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (line !== "" && !line.startsWith(" ")) break;
    const head = /^ {2}(\S.*)$/.exec(line);
    if (head === null) continue;
    const [command, sub] = head[1]!.split(/\s+/);
    if (command === undefined || !WORD.test(command)) continue;
    const subs = commands.get(command) ?? [];
    if (sub !== undefined && WORD.test(sub) && !subs.includes(sub)) subs.push(sub);
    commands.set(command, subs);
  }
  return commands;
}

export function completionScript(shell: Shell, words: CompletionWords): string {
  switch (shell) {
    case "bash":
      return bashScript(words);
    case "zsh":
      return zshScript(words);
    case "fish":
      return fishScript(words);
  }
}

function flagWords(words: CompletionWords): string[] {
  return words.flags.flatMap((flag) => [`--${flag.long}`, ...(flag.short === undefined ? [] : [`-${flag.short}`])]);
}

function withSubcommands(words: CompletionWords): [string, readonly string[]][] {
  return [...words.commands].filter(([, subs]) => subs.length > 0);
}

function bashScript(words: CompletionWords): string {
  const cases = withSubcommands(words).map(([command, subs]) => `      ${command}) words="${subs.join(" ")}" ;;`);
  return [
    "# keylang completions for bash: eval \"$(keylang completions bash)\"",
    "_keylang() {",
    "  local cur=\"${COMP_WORDS[COMP_CWORD]}\" words=\"\"",
    "  if [[ \"$cur\" == -* ]]; then",
    `    words="${flagWords(words).join(" ")}"`,
    "  elif [[ $COMP_CWORD -eq 1 ]]; then",
    `    words="${[...words.commands.keys()].join(" ")}"`,
    "  elif [[ $COMP_CWORD -eq 2 ]]; then",
    "    case \"${COMP_WORDS[1]}\" in",
    ...cases,
    "    esac",
    "  fi",
    "  COMPREPLY=($(compgen -W \"$words\" -- \"$cur\"))",
    "}",
    "complete -o default -F _keylang keylang",
    "",
  ].join("\n");
}

function zshScript(words: CompletionWords): string {
  const cases = withSubcommands(words).map(([command, subs]) => `      ${command}) compadd ${subs.join(" ")}; return ;;`);
  return [
    "#compdef keylang",
    "# keylang completions for zsh: source <(keylang completions zsh), or save as _keylang in $fpath",
    "_keylang() {",
    `  local -a commands=(${[...words.commands.keys()].join(" ")})`,
    `  local -a flags=(${flagWords(words).join(" ")})`,
    "  if [[ $words[CURRENT] == -* ]]; then",
    "    compadd -a flags",
    "  elif (( CURRENT == 2 )); then",
    "    compadd -a commands",
    "  else",
    "    if (( CURRENT == 3 )); then",
    "      case $words[2] in",
    ...cases,
    "      esac",
    "    fi",
    "    _files",
    "  fi",
    "}",
    "if [[ \"$funcstack[1]\" == _keylang ]]; then _keylang \"$@\"; else compdef _keylang keylang; fi",
    "",
  ].join("\n");
}

function fishScript(words: CompletionWords): string {
  const commands = [...words.commands.keys()];
  return [
    "# keylang completions for fish: keylang completions fish | source",
    `complete -c keylang -f -n "not __fish_seen_subcommand_from ${commands.join(" ")}" -a "${commands.join(" ")}"`,
    ...withSubcommands(words).map(([command, subs]) => `complete -c keylang -f -n "__fish_seen_subcommand_from ${command}" -a "${subs.join(" ")}"`),
    ...words.flags.map((flag) => `complete -c keylang -l ${flag.long}${flag.short === undefined ? "" : ` -s ${flag.short}`}`),
    "",
  ].join("\n");
}
