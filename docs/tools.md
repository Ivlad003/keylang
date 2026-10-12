# Інструменти keylang

Довідка про інструменти складається з трьох документів: команди CLI, сервери для редакторів і агентів, інтерфейси в терміналі та браузері.

| Документ | Зміст |
|---|---|
| [cli.md](cli.md) | команди, формати виводу `check`, trace, `entries`, `flows discover`/`adopt`, `flow export`/`import`, `coverage`, `integrations`, `tour`, міграція між стеками, `wire`, `export c4`/`bpmn`/`drawio`, `import drawio`, `diagram propose`, `web --new`, `web --read-only`/`--export`, `clone` і Docker (образ `ivlad003/keylang`), харнеси, baseline, фічі, пропозиції, карта з поясненнями, модель |
| [mcp-lsp.md](mcp-lsp.md) | `keylang mcp` і `keylang lsp` |
| [tui.md](tui.md) | TUI і `keylang web`, стартова сторінка `web --hub`, сторінка діаграм, студія (`/studio`), перегляд без запису (`--read-only`, статичний експорт, `app.html` — аналіз у браузері) |

**Студія.** `keylang web` має сторінку `/studio` (посилання «студія» на сторінці діаграм): редактор діаграм, поруч — проєкція полотна в специфікації keylang і в TypeScript-інтерфейси (`keylang types`), що оновлюється за мить після кожної зміни й підсвічує рядки виділеної фігури, і чат з агентом, чия правка специфікації приходить пропозицією з «Прийняти» / «Відхилити». Докладно — [tui.md](tui.md#studio).

Саму мову специфікацій описано в [format.md](format.md).
