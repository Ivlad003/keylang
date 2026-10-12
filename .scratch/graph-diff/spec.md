# Diff графа між гілками для PR-ревʼю

## 1. Навіщо

Режим «Зміни» показує список змінених файлів і знахідки `check --changed`. Ревʼюеру PR бракує картинки: які модулі, ребра між ними, кроки потоків і порушення правил з'явилися чи зникли між `main` і гілкою. Потрібні вивід без браузера (коментар у PR, CI) і той самий diff на полотні web.

## 2. CLI

`keylang diff [<base>[..<head>]] [--format text|md|mermaid|json] [--level module|fn]`

- Без аргументу база — база фічі (`featureBaseOrigin`: merge-base з головною гілкою), голова — робоче дерево.
- `<base>` — будь-який ref; `<base>..<head>` — дві ревізії, обидві з git.
- `--level module` (типово) — вузли модулів і ребра залежностей між модулями; `fn` — ще й функції та виклики.
- Коди: `0` — нових порушень немає; `1` — diff вносить нові `fail` (правила, потоки) — зручно як крок CI; `2` — помилка виклику, git чи I/O (поганий ref, немає git).
- `--format text` (типово) — короткий звіт; `md` — для коментаря PR: підсумок, таблиці і mermaid-блок; `mermaid` — лише flowchart; `json` — модель `GraphDiff`.

## 3. Знімок на ревізії

- Дерево ревізії записується в тимчасову теку з `git ls-tree -r -z` + `git cat-file --batch` (без `worktree add`: `.git` не змінюється; без `tar`). Тека прибирається завжди, навіть при помилці.
- `node_modules` кореня (якщо є) підключається symlink-ом (junction на Windows), щоб резолвінг пакетів збігався з робочим деревом.
- `analyze({root: tmp, withoutEvidence: true, withoutMigration: true})` без запису кешу; кеш фактів читається з кореня репозиторію: `generateMap` отримує опцію каталогу кешу, ключ пам'яті не залежить від `root`. Ключ кешу — шлях + sha256 + версія екстрактора, тож незмінні файли не перерозбираються.
- Голова «робоче дерево» — звичайний `analyze` кореня.

## 4. Модель `GraphDiff` (`src/graph-diff.ts`, чиста функція двох аналізів)

- `nodes`: `{id, kind, status: added|removed|changed, file, changes: ("signature"|"body"|"deps"|"layer"|"file")[]}`. Зміна — за `fingerprint`/`signature`/`deps`/`layer`, не за номерами рядків.
- `edges`: залежності модулів (і виклики на рівні `fn`) `{source, target, kind, status: added|removed}`; ключ — `source→target:kind`.
- `flows`: по потоку `{name, status, steps: {key, status}}` за ключами `planItems`.
- `findings`: `{code, criterion, area, verdict, message, status: new|fixed}`; ключ — `code + criterion + area` (не рядки).
- `weakenings`: K108 між ревізіями специфікацій (`specWeakenings`).
- `base`, `head`: ref, коротке ID, підпис.
- Порядок — за ID/ключем; вивід стабільний.

## 5. Mermaid

`flowchart LR`: змінені вузли та їхні сусіди на 1 крок (обмеження 60 вузлів, далі — рядок «+N more»), `classDef added fill:#d4f8d4`, `removed` (червоний, пунктир), `changed` (жовтий), незмінні — сірі. Нові ребра — суцільні з міткою `+`, прибрані — пунктир `-.->` з міткою `−`. ID у mermaid — екрановані.

## 6. Web

- `GET /api/graph-diff?since=<ref>&level=` (read-путь): `{base, head, diff: GraphDiff, diagram: Diagram}`, де `diagram` — підграф п.5, розкладений `layout()`, вузли з полем `diff` (`added|removed|changed|null`), ребра так само.
- Режим «Зміни»: над списком — перемикач «Список / Діаграма»; діаграма — на полотні (`canvas.ts`) з кольорами п.5 і легендою; клік на вузол — бокова панель, як в інших діаграмах.
- Статичний експорт кладе відповідь для бази за замовчуванням. Worker (app.html) відповідає `{available: false, reason}`.

## 7. Документація

`docs/cli.md` (таблиця й розділ `diff`), `docs/tui.md` (API), `--help`, completions, `docs/course` — короткий абзац у уроці про інструменти (en+uk).
