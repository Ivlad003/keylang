# 69: `clone --explain` пише `keylang.json` клону крізь symlink

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `node --test tests/clone.test.ts` · `npm run typecheck`

**Джерело:** суміжна знахідка під час тікета 14 (2026-10-07), рівень **P1** (запис поза дозволеними цілями, той самий клас, що й 12–14)

**Місце:** `src/clone.ts` (`enableExplainedMap`)

## Що не так

`enableExplainedMap` пише `keylang.json` клону через `writeAtomic` без `writeProblem`/`targetProblem`. Закомічений у чужому репозиторії `keylang.json -> …` за межі клону при `keylang clone --explain map-and-ai|all` (і `web <url>` з такими опціями) веде запис назовні.

## Що зробити

- Писати через `safeWrite`/`targetProblem`, як маркер у тікеті 14; на відмову — та сама поведінка: помилка з причиною, клон прибирається, код 2.
- Тест у `tests/clone.test.ts` поруч із тестом маркера.

## Критерії готовності

- [ ] регресійний тест падає до виправлення
- [ ] `docs/cli.md` § clone згадує, що `keylang.json` клону підлягає правилам запису

## Comments
