# 19: `code-to-spec <path[:line]>` (algo)

**Етап:** M7 · **Джерело:** design §5.5; батьківський 37

**What to build:** Для функції чи модуля під шляхом/рядком формується чернетка спеки з тверджень, прив'язаних до актуального знімка (кроки за call-ребрами, залежності), як пропозиція MERGE; unresolved-виклики позначаються, а не стають кроками.

**Blocked by:** 14

**Status:** resolved

- [x] `code-to-spec src/x.ts:10` дає пропозицію потоку для функції на рядку 10
- [x] unresolved-виклик позначено коментарем/покриттям

## Answer

`codeToSpec` у `src/draft.ts` + `keylang code-to-spec <path[:line]>`: fn під рядком (найглибша) або кожна експортована fn файла → чернетки `draft flow` (algo) однією пропозицією. `unresolved` — коментар, не крок (тест у `tests/draft.test.ts`). Вхід `git diff` доданий 2026-09-28: `code-to-spec --since <git-ref>` — fn, чиї рядки перетинають зміни робочого дерева чи нові untracked-файли, у `<dir>/flows/changes.md`; fn, уже названі потоками, лише перелічуються в stderr (тест у `tests/draft.test.ts`).
