# 12: `scaffold` / `spec-to-code` для методів класу і файлів з крапкою в імені

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** тікет 11 (прогони nest × Claude, fastapi × Claude). Обидва агенти викликали `scaffold` для кожного `planned fn` і не змогли скористатися жодним результатом.

**What to build:** `plannedCodeTarget` (`src/spec-to-code.ts`) вважає батька `planned fn` файлом-модулем. На реальних ID із карти це хибно:

1. `planned fn article.bookmark_service.BookmarkService.bookmark (userId: number, slug: string) → Promise<ArticleRO>` (nest, `module: "file"`, мови `javascript, typescript`) → `file: "src/article/bookmark_service/BookmarkService.js"`, стаб — вільна `export async function bookmark(…)`. Очікувано: файл `src/article/bookmark.service.ts` (модуль `bookmark_service` у карті — це `bookmark.service.ts`), клас `BookmarkService` з методом.
2. `planned fn article.article_controller.ArticleController.bookmark` — метод **наявного** класу → помилка `src/article/article.controller.ts is not module \`article.article_controller.ArticleController\` under keylang.json layers; pass --into with a file of that module`, хоча файл саме той.
3. Розширення береться з `languages[0]` (`javascript` у змішаному репо) — `.js` у TS-проєкті.
4. Python: `app.services.mail.EmailSender.send` → так само тека `mail/EmailSender.py` замість класу в `app/services/mail.py`.

Треба: коли префікс ID — клас (наявний вузол виду class/module усередині файла, або сегмент, що за конвенцією карти є класом), ціль — файл цього класу, а стаб — метод у тілі класу (новий клас — у новому файлі з методом). Ім'я нового файла має відповідати тому, як карта іменує файли (`bookmark_service` ← `bookmark.service.ts`, коли сусідні файли шару мають крапку: вибрати найближчу наявну конвенцію або назвати неоднозначність у помилці). Розширення — мова, якою написано більшість файлів шару, а не `languages[0]`. Підпис стаба не має давати K201.

- [x] мінімальні фікстури TS (NestJS-подібна: `x.service.ts` з класом) і Python (клас у модулі) відтворюють 1–4
- [x] метод нового класу → новий файл з класом і методом; метод наявного класу → вставка в клас; `check` з кандидатом — K202, не K201
- [x] розширення за мовою шару; змішаний JS/TS-репо дає `.ts`
- [x] MCP `scaffold` і `spec-to-code --print` дають однаковий результат; `docs/tools.md` описує правило вибору файла

Ключові файли: `src/spec-to-code.ts`, `src/mcp.ts`, `docs/tools.md`

## Comments

- 2026-10-04 — виконано. Відтворено через CLI на мінімальних фікстурах (TS nest-подібна, Python): усі 4 пункти. Тепер `plannedCodeTarget` повертає `owner` (клас): наявний клас із карти (`module` + `class`) — метод вставляється в тіло класу за його span (відступ інших членів; Python — після останньої інструкції; Rust — окремий `impl X {}` у кінець файла); новий клас — дописується у файл модуля, якщо він є, інакше новий файл. Ім'я нового файла: тека, потім шар — `bookmark_service` → `bookmark.service.ts` за сусідами `x.service.ts`; обидві конвенції (`.service` і `_service`) в одному колі — код 2 з обома шляхами й `--into`. Розширення — мова більшості файлів шару (потім репо, потім `languages[0]`; нічия — порядок `languages`). Тест-заготовка для методу імпортує клас (`X.prototype.m`), модель для методу пише лише метод.
- Припущення: (1) новий батько є класом, коли його сегмент починається з великої літери й над ним є модуль; `--into` з файлом самого батька повертає його до ролі модуля (escape hatch для PascalCase-файлів). (2) Python-метод отримує `self`, якщо план його не називає; щоб це не давало K201, порівняння `planned` у `.py` ігнорує перший параметр коду `self`/`cls` (`src/flows.ts` `sameSignature`, задокументовано в `docs/format.md`) — це розширення K201/K202, лише перетворює частину K201 на K202. (3) `module: "dir"` не змінювався.
- Тести: `tests/draft.test.ts` (TS клас новий/наявний + `.ts` у змішаному JS/TS шарі + конвенція `.service`; Python клас наявний/новий у файлі/новий файл; неоднозначність імені й `--into`), `tests/mcp.test.ts` («scaffold of a class method is what spec-to-code --print gives»).
