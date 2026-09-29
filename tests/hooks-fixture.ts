// A hook with a default: the code calls what it is given, or its default.
// Shared by the flow tests and the metamorphic `--static` pair.

export const HOOKS: Record<string, string> = {
  "src/domain/build.ts": "export function build(): void {}\n",
  "src/application/analyze.ts": [
    'import { build } from "../domain/build.ts";',
    "export function analyze(request: { generate?: () => void }): void {",
    "  const generate = request.generate ?? build;",
    "  generate();",
    "}",
    "export function run(step = build): void {",
    "  step();",
    "}",
    "export class Session {",
    "  private readonly analyzer: (request: { generate?: () => void }) => void;",
    "  constructor(options: { analyzer?: (request: { generate?: () => void }) => void }) {",
    "    this.analyzer = options.analyzer ?? analyze;",
    "  }",
    "  refresh(): void {",
    "    this.analyzer({});",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/presentation/worker.ts": [
    'import { analyze } from "../application/analyze.ts";',
    "export class Worker {",
    "  readonly generate = (): void => {};",
    "}",
    "export function main(): void {",
    "  const worker = new Worker();",
    "  analyze({ generate: worker.generate });",
    "}",
    "",
  ].join("\n"),
};

export const HOOK_FLOW = `# flow hooks

- trigger application.analyze.analyze
  - step domain.build.build
  - step presentation.worker.Worker.generate
`;
