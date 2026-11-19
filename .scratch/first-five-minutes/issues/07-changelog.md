# 07: CHANGELOG за тегами

**Status:** ready-for-agent

**Type:** docs

**Blocked by:** None (can start immediately)

**Verify:** `node -e "const t=require('node:fs').readFileSync('CHANGELOG.md','utf8');for(const v of ['0.1.1','0.2.0','0.3.0','0.4.0','0.5.0','0.6.0','0.7.0','0.8.0'])if(!t.includes('## '+v)){console.error('missing '+v);process.exit(1)}"` · `git diff --check`

**Джерело:** [рев'ю 2026-11-19](../../../docs/review-2026-11-19.md) §5 рядок 2.

**What to build:** Теги `v0.1.1…v0.8.0` є, а журналу змін немає. Користувач npm не знає, що змінилося між 0.7.0 (в npm) і 0.8.0, і де були несумісні зміни.

`CHANGELOG.md` у корені, англійською, новіші версії зверху. Для кожного тегу:

- заголовок `## <версія> — <дата тегу>`;
- 5–12 пунктів з `git log v<попередня>..v<версія> --oneline`, згрупованих: Added / Changed / Fixed;
- окремий підрозділ **Breaking**, де він потрібен. Джерела: розділи «Несумісні зміни» в `.scratch/*/spec.md`, тексти комітів і нотатки тікетів (наприклад, зміна ID у Python-репо без `keylang.json` з probe-pilot/10, K001 для оголошених пакетів з agent-completion/03).

Над усіма версіями — розділ `## Unreleased` (порожній або з тим, що вже злито після `v0.8.0`).

Перелік для людини, а не дамп комітів: коміти скриншотів, коментарів і лінту не потрапляють.

- [ ] вісім версій з датами тегів; Breaking там, де були несумісні зміни
- [ ] посилання на `CHANGELOG.md` з `README.md` (одним рядком) і з `docs/README.md`
- [ ] `package.json` `files` не змінюється: npm сам включає `CHANGELOG.md` у пакет (перевірити `npm pack --dry-run` і записати в `## Comments`)

Ключові файли: `CHANGELOG.md`, `README.md`, `docs/README.md`

## Comments
