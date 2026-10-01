# 3. Інтеграція

[Додавання до кодової бази](README.md) · [English](../03-an-integration.md) · **Українською**

Фіча кличе код, який згенерував агент. Інтеграція кличе ще й чужий пакет. Крамниця збирається брати картки. Пакет — `stripe`. Правила замовлення не мають його імпортувати.

`keylang/features/pay.md`:

```markdown
# flow pay

- planned module external.stripe
- planned fn infrastructure.payments.charge (order: Order) → Receipt
- trigger application.purchase.buy
  - step infrastructure.payments.charge
```

Пакет, названий у `package.json` (у `dependencies` і в інших полях залежностей), уже відомий як `external.<ім'я>`. Один сегмент: `stripe` стає `external.stripe`. Ім'я з дефісом лишається одним сегментом (`node-fetch`). Назвати — не те саме, що імпортувати. `planned module` стає K202 лише коли якийсь файл імпортує пакет і у знімку є цей вузол.

Файли залежностей Python не читаються. Пакет з pip лишається невідомим, доки не видно імпорту, а пропущений імпорт лишається діркою.

У `keylang/rules.md` тримайте ядро далі від пакета:

```markdown
- deny domain external.stripe
- deny domain infrastructure.payments
- deny presentation external.stripe
```

`application.purchase` може кликати `charge`. Domain не може. Екран не імпортує `stripe` сам.

```sh
npx keylang feature pay
```

Готово означає: імпорт є, `charge` є з цією сигнатурою, і тіло `buy` доходить до `charge` викликом, який keylang бачить. `charge` пише агент із рядка `planned`. Ви — ні. `spec-to-code` може зробити заготовку `charge`, якщо це `planned fn` у TypeScript. Залежність `stripe` у `package.json` він не додасть. Пакет ставите ви.

Виклик, записаний як `obj[k]()`, або схований за декоратором, якого keylang не знає, лишається `unverified`. Фіча лишається відкритою. Справжній виклик у звичайну функцію кладе агент.

Та сама форма підходить для будь-якої бібліотеки: пошта, черга, сховище. Один `planned module external.<pkg>`, одна функція, якій можна його імпортувати, і `deny` для всіх інших.

Далі — [курс](../../uk/README.md).
