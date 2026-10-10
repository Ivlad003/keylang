# Git у режимі перегляду: вкладка «Зміни»

**Status:** resolved

**Джерело:** запит автора 2026-10-09 «оформи тікети й реалізуй» після [research.md](research.md) (§7: isomorphic-git дає ті самі відповіді, що й git CLI; §6: wasm-git не підходить). Продовження [web-static](../web-static/spec.md).

## 1. Мета

На сторінці діаграм з'являється вкладка «Зміни»: що змінила гілка від бази і які знахідки `check` це зачіпає. Тобто те, що `keylang check --changed --since <base>` друкує в терміналі, але для того, хто дивиться без терміналу. Працює однаково в `keylang web`, `web --read-only`, статичному експорті (для бази за замовчуванням) і в `app.html` (перетягнута тека разом із `.git`).

## 2. Контракт

- `GET /api/git` → `{available: true, head: {commit, short, branch}, origin, base: {ref, label, source, main?}, bases: [{ref, label}]}` або `{available: false, reason}`. `base` — база фічі (`featureBaseOrigin`: merge-base з основною гілкою, інакше HEAD). `bases` — пропозиції для вибору: база, `HEAD`, локальні й віддалені гілки (до 100). `origin` — URL без облікових даних (`redactUrl`), або `null`.
- `GET /api/changes[?since=<ref>]` → `{base, unborn, files: [{path, kind: "spec" | "code" | "other", modules: [ID]}], deleted: [{path, modules}], check: CheckPayload | null, checkReason?}`. Без `since` — база з `/api/git`. `check` — payload `runCheck({changed: true, since})`, тобто зріз знахідок разом із K108; `null` з `checkReason`, коли каталогу специфікацій немає. Невідомий ref → 400 з помилкою git; немає git або репозиторію → 409 `{error}`.
- Статичний експорт пише `/api/git` і `/api/changes` для бази за замовчуванням та для `HEAD`. Інша база в експорті — 404 «not in this export».
- `app.html` читає `.git` перетягнутої теки, якщо він не більший за 512 МБ. Більший або відсутній `.git` дає `available: false` з причиною, решта сторінки працює.

## 3. Інваріанти

- **Одна логіка.** У браузері `src/git-changes.ts` замінюється під час збірки worker-а модулем `web/worker/git-changes.ts` з тим самим API (перевіряє typecheck). Він відповідає із заздалегідь порахованого (isomorphic-git) знімка, тож `runCheck`, `weakening.ts` і read-API лишаються спільними з Node.
- **Нічого не пишеться.** isomorphic-git не обходить робоче дерево (а тому й не переписує `.git/index`), і fs, через яку він читає, — та сама read-only fs worker-а. Сервер у `--read-only` читає git лише командами читання.
- **Порівнюється лише вміст.** Біти режиму файлів (у браузері їх немає) змін не дають. Незмінений файл визначається як у git: за розміром і часом зміни щодо запису індексу (з захистом від racy git), інакше за SHA-1 вмісту. Непрочитаний файл (бінарний, великий) git бачить за метаданими.

## 4. Тікети

- [01](issues/01-read-api-git.md) — `/api/git` і `/api/changes` у read-API (Node, git CLI) і в статичному експорті.
- [02](issues/02-changes-tab.md) — вкладка «Зміни» на сторінці.
- [03](issues/03-worker-git.md) — git у `app.html`: isomorphic-git у worker-і.
