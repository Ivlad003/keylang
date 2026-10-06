# 05: Документація backend-а: snapshot.md §11, llm.txt, CONTEXT.md, design

**Status:** ready-for-agent

**Type:** docs

**Blocked by:** 03, 04

**Verify:** `grep -q '\*\*Семантичний backend' docs/format.md` · `grep -q 'semantic' llm.txt` · `grep -q 'semantic' CONTEXT.md` · `npm test` · `node bin/keylang.js check --strict`

**Джерело:** spec §4.5; [ADR 0020](../../../docs/adr/0020-typescript-semantic-backend.md); тікети 01–04 (їхні Notes)

**What to build:** Тікети 01–04 оновили документацію своїх контрактів: manifest, `edges`, формати, `doctor`, кеш. Цей тікет зводить решту, щоб людина й агент знали, коли backend працює і що з цього випливає.

- [ ] snapshot.md §11, «Мови» → **TypeScript**: абзац **Семантичний backend**. Що в ньому:
  - коли backend працює, звідки береться `typescript`, що буває без пакета;
  - що він розв'язує, а що лишає діркою (таблиця spec §4.2);
  - походження `semantic`;
  - запуск у CI після встановлення залежностей.

  Речення «`provenance: semantic` і `provenance: trace` лишаються дорожньою картою» виправлено: `semantic` уже є
- [ ] `llm.txt` для агентів:
  - `semantic` у вердиктах і MCP;
  - анотації заради keylang не потрібні, коли `typescript` встановлено;
  - `keylang check` запускати після встановлення залежностей;
  - як виглядає дірка, що лишилася (тип функції, член інтерфейсу)
- [ ] `CONTEXT.md`, визначення **Edge (ребро)**: походження `syntactic` (tree-sitter і резолвер keylang) або `semantic` (checker TypeScript, ADR 0020)
- [ ] design.md: §7 «Резолвінг» і рядок «точні посилання» в §7.4 описують реалізоване, рядок M10 у §9 має статус і дату, а §10 п. 7 посилається на результат виміру з `bench/results.md`
- [ ] ADR 0020: статус «реалізовано <дата>» і відповіді на відкриті питання, які дали тікети
- [ ] приклади у format.md, якщо додано, проходять `tests/format-examples.test.ts`; посилання між файлами ведуть на наявні файли

## Comments
