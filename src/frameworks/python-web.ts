// The Python web adapters (ADR 0022 п. 2, 5; business-flows/38): Django,
// FastAPI, Flask and Celery. Each is detected from a dependency in a root
// manifest (`pyproject.toml`, `requirements*.txt`, `setup.py`, `setup.cfg`,
// `Pipfile`) or an analysed Python file that imports the package. These
// frameworks keep their config in the code itself — `urls.py`, route and task
// decorators, `signal.connect(…)`, `beat_schedule` — so the config files of an
// adapter are the analysed Python files that register something with it, and
// the facts are what the Python extractor records of them (`decorators`,
// `statements`, `paramCalls` of `FileFacts`). `parse` gives no facts of its
// own: the files are inputs of the snapshot (manifest, `snapshotId`) and, with
// the adapter turned off, `skipped-file` holes (`framework:<name>`). Placing
// the registrations on the graph is `src/python-web-entries.ts`.

import { posix } from "node:path";
import type { ConfigFacts, FrameworkAdapter, FrameworkContext } from "./adapter.ts";

/** Root manifests that may name a Python dependency. */
const MANIFESTS = ["pyproject.toml", "requirements.txt", "requirements-dev.txt", "requirements/base.txt", "requirements/production.txt", "setup.py", "setup.cfg", "Pipfile"];

interface PythonWebSpec {
  name: string;
  /** The import name of the package (`django`), which is also its distribution name. */
  pkg: string;
  /** Files the framework executes whatever they import: Django's `urls.py` and management commands. */
  extra?: RegExp;
  /** Text that makes a file config of the framework without an import of it: Celery's `beat_schedule` in Django settings. */
  marker?: RegExp;
}

function pythonWebAdapter(spec: PythonWebSpec): FrameworkAdapter {
  const dependency = new RegExp(`(?:^|[^A-Za-z0-9_.-])${spec.pkg}(?:$|[^A-Za-z0-9_.-])`, "im");
  const imports = new RegExp(`^[ \\t]*(?:from|import)[ \\t]+${spec.pkg}\\b`, "m");
  const python = (context: FrameworkContext): string[] => context.sources.filter((path) => path.endsWith(".py"));
  return {
    name: spec.name,
    version: "1",
    detect(context) {
      if (MANIFESTS.some((path) => dependency.test(context.read(path) ?? ""))) return true;
      return python(context).some((path) => imports.test(context.read(path) ?? ""));
    },
    files(context) {
      const out: { path: string; owner: string | null }[] = [];
      for (const path of python(context)) {
        if (!context.analysed(path)) continue;
        const text = context.read(path);
        if (text === null) continue;
        if (imports.test(text) || spec.extra?.test(path) || spec.marker?.test(text)) out.push({ path, owner: posix.dirname(path) === "." ? null : posix.dirname(path) });
      }
      return out;
    },
    parse(path): ConfigFacts {
      return { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], error: null };
    },
  };
}

export const django = pythonWebAdapter({ name: "django", pkg: "django", extra: /(?:^|\/)(?:urls\.py|management\/commands\/(?!_)[^/]+\.py)$/ });
export const fastapi = pythonWebAdapter({ name: "fastapi", pkg: "fastapi" });
export const flask = pythonWebAdapter({ name: "flask", pkg: "flask" });
export const celery = pythonWebAdapter({ name: "celery", pkg: "celery", marker: /beat_schedule/i });

/** The names of the Python web adapters, for the graph step that reads their registrations. */
export const PYTHON_WEB_FRAMEWORKS: readonly string[] = ["celery", "django", "fastapi", "flask"];
