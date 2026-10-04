# 14: `check --format human|json|sarif|github`

**Етап:** M1.1 · **Джерело:** design §4.1 «Цільовий CI-запуск», §7.5 «CI та хуки»

**What to build:** Той самий набір результатів (діагностики, вердикти, покриття, `snapshotId`) друкується в одному з форматів: `human` (поточний), `json` (лише JSON у stdout, підсумок у stderr), `sarif` 2.1.0 для GitHub code scanning, `github` (workflow-команди `::error file=…`). Формат не змінює вердикт і код виходу.

**Blocked by:** 07 (вердикти)

**Status:** resolved

- [x] `--format json` дає валідний JSON у stdout зі списком результатів, кожен із критерієм, областю, verdict, evidence, snapshotId
- [x] `--format sarif` проходить схему SARIF 2.1.0 (перевірка структури в тесті без мережі)
- [x] код виходу однаковий для всіх форматів у тому самому стані; `--strict` працює з усіма
- [x] `--help` описує `--format`; невідоме значення — код 2 з переліком допустимих

## Answer

JSON: `warning` окремо від `ok`, критерій/область вердикту для діагностик, `coverage`. SARIF: rules, `ruleIndex`, warning і `unverified` (`note`). github: екранування. Структура SARIF перевіряється в тесті офлайн.
