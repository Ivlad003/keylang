# Виправлення за рев'ю 2026-10-06

**Джерело:** [docs/review-2026-10-06.md](../../docs/review-2026-10-06.md) §2. Кожна знахідка підтверджена відтворенням (або, для 17, — очевидним код-шляхом) і має окремий тікет.

## Мета

Прибрати хибні `ok`/`fail` основної перевірки, записи поза дозволеними цілями й падіння на валідному вводі, а потім — порушені контракти окремих команд. Для фічі [business-flows](../business-flows/spec.md) першочергові тікети, які псують граф викликів і флоу: 04–11, 16–17, 18, 21–31, 33, 38–40.

## Порядок

1. **P1 (01–17)** — спершу. Групи: зріз `--changed` (01–03), резолвер і правила (04–11), запис поза репозиторієм (12–15), trace-адаптери (16–17).
2. **P2 (18–48)**, потім **P3 (49–68)**.
3. Тікети незалежні, `Blocked by` немає; суміжні (01–03, 12–14, 16–17, 30/58) варто брати одним виконавцем поспіль, бо торкаються тих самих файлів.

Тікет 49 (`keylang.json` як спосіб вимкнути `deny`) — `needs-triage`: це рішення політики харнеса, а не баг.

## Тікети

| # | Рівень | Знахідка | Місце |
|---|---|---|---|
| [01](issues/01-check-changed-hook-stop.md) | P1 | `check --changed`, `hook stop` і `feature` гублять K104 правил `exports` | `src/changed.ts:113` |
| [02](issues/02-changed-no-cycles.md) | P1 | `--changed` бере для `no-cycles` під модулем лише сам модуль, а не його область | `src/changed.ts:120` |
| [03](issues/03-core-ignorecase-check-changed-hook.md) | P1 | Перейменування файла лише регістром (core.ignorecase) ховає зміни від `check --changed` і `hook stop` | `src/git-changes.ts:83` |
| [04](issues/04-rust-python-use-crate.md) | P1 | Rust і Python: `use crate::models::User` / `from app.models import User` на нечутливій до регістру ФС стає діркою, і deny з fail переходить в unverified | `src/rust-imports.ts:120` |
| [05](issues/05-pnpm-workspace-external-deny.md) | P1 | pnpm-монорепо: внутрішній workspace-пакет стає external, тому deny дає хибний ok | `src/imports.ts:388` |
| [06](issues/06-paths-tsconfig-tsconfig.md) | P1 | `paths` вкладеного tsconfig ігноруються, і аліас резолвиться через кореневий tsconfig у чужий файл | `src/imports.ts:121` |
| [07](issues/07-eisdir-extends-tsconfig-json.md) | P1 | Падіння EISDIR, коли `extends` tsconfig без `.json` збігається з назвою теки | `src/imports.ts:557` |
| [08](issues/08-rust-workspace.md) | P1 | Rust: workspace не в корені репозиторію робить крейти репозиторію зовнішніми пакетами | `src/rust-imports.ts:211` |
| [09](issues/09-python-trace-fork-check.md) | P1 | Python trace-адаптер не обробляє fork: кроки в процесі-воркері губляться або check падає з кодом 2 | `adapters/python/keylang_trace.py:235` |
| [10](issues/10-python-from-import-all.md) | P1 | Python `from m import *` не приносить імен, які m імпортує (модуль без `__all__`): дірка, а із зовнішнім glob — хибний static fail | `src/graph.ts:684` |
| [11](issues/11-barrel-k102-ok-strict.md) | P1 | Виключений або нерозібраний barrel в іншому шарі перетворює K102 на ok, навіть із --strict | `src/rules.ts:365` |
| [12](issues/12-symlink-clone.md) | P1 | Видалення файлів харнеса йде за symlink-текою за межі репозиторію (через clone чужого репо) | `src/harness.ts:643` |
| [13](issues/13-agents-none-clone-keylang.md) | P1 | `--agents=none` (і кожен `clone`) переписує й видаляє файли харнеса, де немає нічого від keylang; коментарі `.codex/config.toml` губляться | `src/harness.ts:243` |
| [14](issues/14-clone-keylang-clone-json-symlink.md) | P1 | `clone` пише маркер `.keylang/clone.json` крізь symlink `.keylang` з клонованого репо | `src/clone.ts:106` |
| [15](issues/15-explain-node-modules.md) | P1 | Брама пропозицій перевіряє зарезервовані теки за рядком шляху, а не за місцем запису: регістр і посилання обходять заборону explain/ і node_modules | `src/proposals.ts:54` |
| [16](issues/16-spans-worker-terminate-kill-fail.md) | P1 | Spans, що буферизуються до виходу, губляться при worker.terminate() чи kill дочірнього процесу, а крок стає хибним `fail missing step` | `src/adapters/trace.ts:124` |
| [17](issues/17-php-pcntl-fork-span-check.md) | P1 | PHP: pcntl_fork дублює буфер подій і лічильник span, тож check падає з кодом 2 | `adapters/php/keylang_trace.php:109` |
| [18](issues/18-layout-ts-js-macos.md) | P2 | Вгаданий layout: TS/JS-імпорт теки в іншому регістрі на macOS чи Windows мовчки зникає, і deny дає хибний ok | `src/imports.ts:422` |
| [19](issues/19-id-macos-windows.md) | P2 | Збережені пояснення вузлів, чиї ID відрізняються лише регістром, перезаписують одне одне на macOS і Windows | `src/explanations.ts:58` |
| [20](issues/20-mcp-snapshotid-excluded-outside.md) | P2 | MCP віддає застарілий вердикт: snapshotId не змінюється, коли з'являється чи зникає excluded/outside-файл | `src/snapshot.ts:240` |
| [21](issues/21-import-typeof-import-runtime.md) | P2 | `import("./a").T` і `typeof import("./a")` у типах дають runtime-ребро, і no-cycles бачить хибний цикл | `src/extract/ts.ts:1049` |
| [22](issues/22-d-ts-deny-unverified.md) | P2 | Відносний імпорт модуля з `.d.ts` стає діркою, і deny цього модуля переходить в unverified | `src/imports.ts:470` |
| [23](issues/23-python-namespace-pip.md) | P2 | Python: тека в корені вирішує, чи ім'я внутрішнє: namespace-пакет стає нерозв'язаним, а тека з конфігами затуляє пакет pip | `src/python-imports.ts:54` |
| [24](issues/24-rust-fn-fn-item.md) | P2 | Rust: вкладена `fn` усередині fn не затіняє однойменний item модуля, тож keylang вигадує ребро | `src/extract/rust.ts:308` |
| [25](issues/25-php-insteadof-as-use.md) | P2 | PHP: `insteadof` і `as` у `use` трейтів ігноруються, тож `$this->m()` веде не в той метод трейту | `src/extract/php.ts:319` |
| [26](issues/26-no-cycles-entry-planned.md) | P2 | `no-cycles` і `entry` під planned-підмодулем застосовуються до батьківського модуля | `src/rules.ts:484` |
| [27](issues/27-exports-ok-the-export.md) | P2 | `exports` на непрозорому модулі (помилка розбору) дає ok «the export table is exactly …» | `src/rules.ts:456` |
| [28](issues/28-export-keylang-esm.md) | P2 | `export *` з двох модулів з однойменними значеннями: keylang вважає ім'я експортованим, ESM — ні | `src/exports.ts:195` |
| [29](issues/29-python-from-import-k104.md) | P2 | Python: два `from .x import *` з однаковим ім'ям дають хибний K104 absence у `__init__` | `src/exports.ts:196` |
| [30](issues/30-fingerprint-crlf-checkout-stale-fn.md) | P2 | Fingerprint залежить від закінчень рядків: CRLF-checkout робить stale кожну fn з багаторядковим рядком або docstring, а також усіх, хто її викликає | `src/extract/treesitter.ts:161` |
| [31](issues/31-stale-closure-complete.md) | P2 | Зміна константи модуля, поля класу чи об'єктної таблиці не робить прозу stale, а closure лишається `complete` | `src/snapshot.ts:462` |
| [32](issues/32-package-json-utf-8-bom-invalid.md) | P2 | package.json з UTF-8 BOM ламає кожну команду аналізу (код 2 «invalid JSON») | `src/declared-packages.ts:237` |
| [33](issues/33-external-cargo-path-workspace.md) | P2 | Внутрішні пакети репозиторію оголошуються як external (Cargo `path`/`workspace = true`, npm workspaces з `**`), тому `deny … external.<внутрішній>` проходить мовчки замість K001 | `src/declared-packages.ts:289` |
| [34](issues/34-hook-install-pre-commit.md) | P2 | `hook install` у монорепо ставить pre-commit, який блокує кожен коміт | `src/git-hook.ts:16` |
| [35](issues/35-init-clone-web-url.md) | P2 | `init`, `clone` і `web <url>` падають з кодом 2 на `opencode.jsonc` з коментарями | `src/harness.ts:492` |
| [36](issues/36-crlf-lf-proposals-show.md) | P2 | CRLF-ціль і LF-пропозиція: `proposals`/`show`/`accept`/`apply_diff` показують заміну всього файла | `src/proposals.ts:146` |
| [37](issues/37-max-tokens-length.md) | P2 | Обрізана відповідь моделі (max_tokens / length) приймається як повна і записується | `src/llm.ts:215` |
| [38](issues/38-ts-trace-commonjs-satisfies.md) | P2 | TS trace: перевантажені функції, CommonJS-експорти й `(…) satisfies T` ніколи не інструментуються | `src/extract/bodies.ts:34` |
| [39](issues/39-rust-u8-fn-span.md) | P2 | Rust-адаптер: `;` у сигнатурі (`[u8; 32]`) — fn вважається без тіла, span не записується | `adapters/rust/keylang_trace.rs:312` |
| [40](issues/40-keylang-trace-keylang-trace-plan-trace-r.md) | P2 | Відносні KEYLANG_TRACE / KEYLANG_TRACE_PLAN розв'язуються пізно: trace пишеться в чужу теку, а Rust-програма падає | `src/adapters/trace.ts:135` |
| [41](issues/41-keylang-json-wire.md) | P2 | Зміна keylang.json під час аналізу не зупиняє запис карти й wire | `src/map.ts:325` |
| [42](issues/42-unreadable-source-exits-2.md) | P2 | Нечитабельний файл джерела валить map/check з кодом 2 | `src/map.ts:210` |
| [43](issues/43-wire-module-node18-node20.md) | P2 | wire не впізнає module node18/node20 і пише імпорти без розширення | `src/wire-gen.ts:198` |
| [44](issues/44-dir-feature-explain-llm.md) | P2 | `"dir": "."` ламає feature, explain --llm і baseline: шляхи `./…` не проходять власну політику запису | `src/operations/feature.ts:48` |
| [45](issues/45-clip-proposal-overwrites-saved-edits.md) | P2 | Пропозицію скрепки записано поверх правок, збережених поки модель відповідала | `src/tui/clip-chat.ts:392` |
| [46](issues/46-enter-f6-merge-merge.md) | P2 | Enter у F6 під час MERGE обходить блокування MERGE: підміняє відкрите злиття, лишає «мертвий» режим MERGE і перезапускає записувальні операції | `src/tui/results-panel.ts:92` |
| [47](issues/47-auto-merge-steals-clip-chat-keys.md) | P2 | MERGE, що відкрився сам, перехоплює клавіші, які людина друкує в чат скрепки, і записує спеку | `src/tui/app.ts:2551` |
| [48](issues/48-chat-proposal-cut-at-nested-fence.md) | P2 | Пропозиція з чату обрізається на першій вкладеній огорожі коду в специфікації | `src/operations/assistant.ts:36` |
| [49](issues/49-deny-keylang-json-assume-exclude.md) | P3 | Агент може вимкнути `deny` через `keylang.json` (`assume`/`exclude`): харнес цей файл не захищає | `src/harness.ts:55` |
| [50](issues/50-map-macos.md) | P3 | Перейменування шару лише регістром: `map` на macOS пише новий файл карти й тут же видаляє його як застарілий | `src/map.ts:257` |
| [51](issues/51-k106.md) | P3 | K106 не знімається правилом на перетині, якщо в нього більше однієї цілі | `src/rules.ts:755` |
| [52](issues/52-clone-url.md) | P3 | `clone` друкує й зберігає URL з обліковими даними | `src/cli.ts:517` |
| [53](issues/53-spec-to-code-draft-withflow-withrules.md) | P3 | spec-to-code (і draft withFlow/withRules) переводять у LF усі рядки файла зі змішаними закінченнями; у MERGE це невидимий шматок, склеєний із заготовкою | `src/spec-to-code.ts:61` |
| [54](issues/54-agent-cli-utf-8-fffd.md) | P3 | Вивід agent CLI декодується по чанках: UTF-8 символ на межі 64 КіБ стає U+FFFD | `src/agent-cli.ts:628` |
| [55](issues/55-keylang-llm-timeout-ms.md) | P3 | KEYLANG_LLM_TIMEOUT_MS понад 2^31-1 дає миттєвий таймаут | `src/llm.ts:141` |
| [56](issues/56-lsp-validate-spec-check.md) | P3 | LSP і validate_spec читають інший набір специфікацій, ніж check | `src/analyze.ts:82` |
| [57](issues/57-answertext.md) | P3 | answerText зрізає кілька коротких абзаців підряд разом зі змістом пояснення | `src/explain-llm.ts:74` |
| [58](issues/58-map-check-crlf-checkout-baseline.md) | P3 | map --check вважає CRLF-checkout застарілим, на відміну від baseline і wire | `src/map.ts:473` |
| [59](issues/59-readme.md) | P3 | Шар `README` затирається стартовою сторінкою карти з поясненнями | `src/emit.ts:56` |
| [60](issues/60-symlink-md-map-map.md) | P3 | Тека чи битий symlink `*.md` у map/ валить map і map --check | `src/map.ts:257` |
| [61](issues/61-draft-map-outside-assume.md) | P3 | `draft map` вгадує шари без `outside`/`assume` і губить `assume` у прев'ю keylang.json | `src/operations/draft.ts:295` |
| [62](issues/62-keylang-json-utf-8-bom-invalid.md) | P3 | keylang.json з UTF-8 BOM ламає кожну команду (код 2 «invalid JSON») | `src/config.ts:219` |
| [63](issues/63-parse.md) | P3 | `parse` мовчки показує нечитабельний файл як порожній документ і виходить з кодом 0 | `src/cli.ts:1220` |
| [64](issues/64-help-overlay-chunk-into-hidden-buffer.md) | P3 | Довідка поверх редагування: дві клавіші одним чанком вставляються в прихований буфер | `src/tui/app.ts:423` |
| [65](issues/65-bracketed-paste-f6.md) | P3 | Bracketed paste мовчки губиться під час редагування цілі знахідки з F6 | `src/tui/app.ts:1284` |
| [66](issues/66-narrow-window-focus-on-hidden-panel.md) | P3 | Після зменшення вікна нижче 60 колонок фокус лишається на панелі, якої не видно, і клавіші йдуть у невидимий список | `src/tui/app.ts:408` |
| [67](issues/67-nav-arrow-click-hides-cursor.md) | P3 | Клік по стрілці розгортання в навігації під час редагування ховає курсор, а набір триває | `src/tui/app.ts:3058` |
| [68](issues/68-enter.md) | P3 | Enter у тому ж чанку, що й набраний текст, не надсилає повідомлення чату, а стає пробілом | `src/tui/app.ts:423` |

## Загальні правила для виконавця

- Перший крок — регресійний тест зі сценарію тікета, що падає на поточному коді.
- Фікстури — на тимчасових копіях; мережа, справжні LLM і агент-CLI не потрібні (`tests/fixtures/fake-agent.mjs`).
- Регістронечутлива ФС на Linux: tmpfs з `casefold` (`unshare -rm`, `mount -t tmpfs -o casefold`, `chattr +F`); якщо в CI це недоступно — тест через `t.skip` з поясненням і юніт-тест чистої функції порівняння шляхів.
