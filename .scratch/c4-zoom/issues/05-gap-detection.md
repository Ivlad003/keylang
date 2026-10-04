# 05: Детерміновані «дірки» фічі: `feature --gaps` і `feature_status.gaps`

**Джерело:** spec §4.2 B3; research-c4-zoom-literature §9 п. 9; harness-integration spec Q10

**What to build:** Розширити `Gap.kind` і перелік прогалин файла фічі детермінованими перевірками без моделі: `signature` — `planned fn` без сигнатури; `layer` — `planned module` без шару в `keylang.json`; `step-no-id` — крок потоку без ID (проза); `emitter` — `emits` події без вузла, що її емітує; `deny` — крок або `calls`, що порушив би `deny`/baseline після реалізації; `name-clash` — `planned` ID збігається з наявним вузлом знімка; `external` — крок до пакета без `planned module external.<pkg>` і без вузла в знімку; `question` — з тікета 04. `keylang feature <slug> --gaps` друкує прогалини, згруповані за сходинками (`idea`, `behavior`, `structure`, `ready`), з файлом:рядком; `--format json` дає `gaps[]` з `kind`, `stage`, позицією й `reason`. MCP `feature_status` повертає той самий масив. Існуючі види `planned`/`static`/`rule`/`spec` зберігаються.

**Blocked by:** 03, 04

**Type:** code

**Status:** needs-triage

**Verify:** `npm run typecheck` · `npm test`

- [ ] e2e: фікстура з кожним видом дірки → рівно одна прогалина потрібного `kind` з позицією; чистий файл → нуль
- [ ] `deny` обчислюється з поточних `rules.md` + `rules.baseline.md`; зміна правила змінює результат
- [ ] `--gaps --format json` стабільний і відсортований за файлом/рядком
- [ ] MCP `feature_status.gaps` ідентичний CLI
- [ ] tools.md і SKILL.md описують `--gaps` і види

## Comments
