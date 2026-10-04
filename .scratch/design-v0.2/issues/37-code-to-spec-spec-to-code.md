# 37: `code-to-spec` і `spec-to-code`

**Етап:** M7 · **Джерело:** design §5.5, §9 критерій M7 (`refund`)

**What to build:** `code-to-spec <path[:line]>` пропонує чернетку спеки в режимі MERGE з тверджень, прив'язаних до актуального знімка; нові наміри — `planned`. `spec-to-code <id|file>` для `planned` створює заготовку в дозволеному шарі з очікуваною сигнатурою (уточнення шляху за неоднозначності), у режимі llm — тіло та e2e-сценарій; кандидат аналізується як новий знімок із diff, `allow`/`deny`, типи й потрібні докази перевіряються з явною неповнотою. На K001 спершу пропонується виправити посилання або оголосити намір.

**Blocked by:** 35, 20

**Status:** resolved

- [x] сценарій `refund`: `planned` → `spec-to-code` → прийнятий diff → `map` → окремі докази (ID ok, tests/trace unverified до тестів)
- [x] `code-to-spec` для функції з unresolved-викликами позначає їх, а не вигадує кроки

## Comments

- 2026-10-04 — тріаж (рішення 3А з HANDOFF-2026-10-02): усі критерії виконано тікетами m5-m7/19–21: «spec-to-code: refund goes planned → stub → map → separate evidence…» (`tests/draft.test.ts`); code-to-spec позначає нерозвʼязані виклики; llm-режими — m5-m7/21.
