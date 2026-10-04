# 12: `scaffold` / `spec-to-code` для методів класу і файлів з крапкою в імені

**Status:** ready-for-agent

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

- [ ] мінімальні фікстури TS (NestJS-подібна: `x.service.ts` з класом) і Python (клас у модулі) відтворюють 1–4
- [ ] метод нового класу → новий файл з класом і методом; метод наявного класу → вставка в клас; `check` з кандидатом — K202, не K201
- [ ] розширення за мовою шару; змішаний JS/TS-репо дає `.ts`
- [ ] MCP `scaffold` і `spec-to-code --print` дають однаковий результат; `docs/tools.md` описує правило вибору файла

Ключові файли: `src/spec-to-code.ts`, `src/mcp.ts`, `docs/tools.md`
