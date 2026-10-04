# 30: Довідка інструментів переїжджає в docs/tools.md

**Джерело:** research-pl §5 Р-6 (крок 2); знахідка 9; рішення Q22 (spec)

**What to build:** У format.md мова перемішана з довідкою інструментів: MCP і LSP описано в §9, TUI і web — у §12, а рядок 245 — абзац «Команди» на 21 343 символи (перевірено). Тікет створює `docs/tools.md` українською і переносить туди довідку інструментів. У format.md лишається мова.

Текст переноситься дослівно. Змінюються лише перехресні посилання: «§11» у перенесеному тексті стає «format.md §11». Переносяться:
- абзац «Команди» (format.md:245) як є. Таблицею його робить 31;
- формати виводу `check` (:249–:254) разом з останнім реченням :247 («`--format` не змінює вердикт і код виходу:»), а також `--explain-edge` (:256);
- адаптери TS/JS, Python і Rust та `trace-plan` (:312–:318);
- `keylang wire` (:330);
- «Агенти, baseline і фічі» (:332–:348): `feature`, `baseline`, `agents`, `check --changed`, `hook stop`. Абзац :338 про `planned module external.<pkg>` описує семантику `planned`, тому він лишається в §7;
- `### keylang mcp` і `### keylang lsp` з §9 (:371–:398);
- «Карта з поясненнями (`explain.map`)» з §11 (:435–:445);
- увесь §12 (:447–:494), зокрема `doctor`.

У format.md лишаються:
- §1–§6;
- з §7: таблиця K-кодів (її читає tests/cli.test.ts:1232), вердикти, семантика правил (:247 без останнього речення, «Уточнення» :258–:266), докази потоків, схеми звіту тестів і trace JSONL (:287–:310), семантика `# wiring` (:326–:328) і «Дорожня карта»;
- §8, IR і позиції з §9 (:369), §10;
- §11 разом із «Мовами».

Поля keylang.json, що змінюють значення специфікації, теж лишаються у format.md. На місці кожного перенесеного фрагмента стоїть речення з посиланням на розділ tools.md. Номери §1–§11 не змінюються. Від §12 лишаються заголовок і одне речення-вказівник.

Оновити посилання:
- design.md:403 і :625 (§12 → tools.md);
- design.md:609: адаптери тепер у tools.md, формати звітів лишаються в §7;
- коментар src/cli.ts:745 («§12»);
- docs/README.md: рядок 7 про прапорці CLI і новий рядок таблиці для tools.md;
- docs/course/README.md:9 і docs/course/uk/README.md:9 («діагностики чи прапорця»: прапорці тепер у tools.md);
- README.md:150 і README.uk.md:150;
- AGENTS.md, «Контекст проєкту»: один рядок про те, що CLI, MCP, LSP, TUI і web описано в docs/tools.md.

Ці посилання лишаються валідними, їх треба звірити, але не правити: `§§1–8 і §11` у docs/course/03-the-language.md:7 (і в uk), коментарі src/flows.ts:322 (§11), src/extract/treesitter.ts:98 (§7) і src/draft-llm.ts:123 (§7).

src/cli.ts:745 — doc comment `cli.cli.cmdDoctor`. Його текст потрапляє в keylang/map-explained/cli.md:249 (у keylang.json увімкнено `explain.map`, перевірено), тож карту з поясненнями треба перегенерувати.

Приклади й граматика (32–34) лежать у мовній частині й від цього тікета не залежать. 32 рекомендовано зливати після нього. Тікети 35–39 пишуть мовну частину у format.md, а команди й прапорці — у tools.md.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** немає: документація. У src змінюється лише коментар src/cli.ts:745, у згенерованих файлах — keylang/map-explained/cli.md.

- [x] docs/tools.md містить усі перелічені фрагменти. У format.md немає `### keylang mcp`, `### keylang lsp`, адаптерів trace, `trace-plan`, «Агенти, baseline і фічі» і тексту §12. На місці :245 — щонайбільше два речення з посиланням
- [ ] Перенос дослівний: після `git add -N docs/tools.md` команда `git diff --color-moved=zebra` показує перенесені рядки як переміщення. Змінені рядки — лише речення-вказівники й перехресні посилання
- [x] `grep '^## ' docs/format.md` дає ті самі заголовки §1–§12, що до зміни. Таблиця K-кодів на місці, тест «explain covers every diagnostic code» (tests/cli.test.ts:1232) зелений
- [ ] Кожне посилання на format.md і tools.md у docs/*.md, docs/course/**, README*.md, AGENTS.md і коментарях src веде на наявний розділ зі згаданим текстом, а не на вказівник §12. Відносні посилання в перенесеному тексті (`adr/…`) працюють з docs/tools.md
- [ ] В AGENTS.md змінено рівно один рядок, у «Контекст проєкту»
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff — лише опис `cli.cli.cmdDoctor` у keylang/map-explained/cli.md), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail

Ключові файли: `docs/tools.md`, `docs/format.md`, `docs/design.md`, `docs/README.md`, `docs/course/README.md`, `docs/course/uk/README.md`, `README.md`, `README.uk.md`, `AGENTS.md`, `src/cli.ts`, `keylang/map-explained/cli.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78 (docs/tools.md створено; у format.md §1–§12 на місці, §12 і trace — вказівники на tools.md); тест «explain covers every diagnostic code» є в tests/cli.test.ts.
