# 2. Нова фіча

[Додавання до кодової бази](README.md) · [English](../02-a-feature.md) · **Українською**

Крамниця вже оформлює покупку. Повернення ще немає. Запишіть специфікацію, поки функції ще немає. Функцію ви не пишете. Агент генерує її з цього файла.

Створіть `keylang/features/refund.md`. Ім'я файла — це slug. `refund` — slug.

```markdown
# flow refund

Покупець повертає замовлення. Правила замовлення збирають повернення. Екран не говорить з базою.

- planned fn application.purchase.refund (order: Order) → Refund
- trigger presentation.terminal.refund
  - step application.purchase.refund
    - step domain.orderAggregate.refund
```

Беріть id зі своєї карти. Карта крамниці вже має `application.purchase`, `presentation.terminal` і `domain.orderAggregate`. Посилання там — `src/app/purchase.ts`, `src/ui/terminal.ts` і `src/domain/order.ts`. У прикладі немає файлів коду, і `order.ts` не називається `orderAggregate`. У справжньому репозиторії копіюйте id, який друкує карта.

`planned fn` — це побажання. Посилання на нього не помилка. Крок лишається `unverified`, доки функції немає.

```sh
npx keylang feature refund
```

Код виходу 0 і `done` у stderr означають три речі. Кожен рядок `planned` у цьому файлі збігається з кодом (попередження K202). Кожен крок має статичний шлях виклику (`ok`). Жодне правило в репозиторії не падає, включно з baseline. Тести і trace друкуються. Вони не вирішують.

Доти stdout перелічує прогалини, код виходу 1. Немає функції — це `planned`. Функція іншого виду або з іншою сигнатурою — K201. Пробіли не важливі, `->` те саме, що `→`.

Для TypeScript або JavaScript це друкує заготовку і падаючий тест і нічого не пише:

```sh
npx keylang spec-to-code application.purchase.refund
npx keylang spec-to-code application.purchase.refund --apply
```

Воно будує лише `planned fn`. Запланований модуль — це файл, який створює агент. Ця команда його не створить. Тести пишуться як `node:test`. Для Python і Rust тест вона не пише. Його пише агент, із тієї самої специфікації. Id, який уже є в коді, вона не приймає.

Коли з'являється K202, `feature` уже може сказати done. Видаліть рядок `planned`, щоб попередження зникло.

Цей файл ви віддаєте агенту. Він генерує функції. keylang його не запускає. `check --changed` блокує хід лише на новому fail. Рядок `unverified` не блокує, тож читайте його самі. Зміна `rules.md` має прийти пропозицією в `.keylang/proposals/`. Ви її зливаєте або ні.

Далі: [інтеграція](03-an-integration.md).
