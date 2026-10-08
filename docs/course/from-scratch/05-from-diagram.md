# 5. From a diagram

[Starting a project](README.md) · **English** · [Українською](uk/05-from-diagram.md)

The other parts start from an empty app and a text you write. This one starts from a picture: you draw the layers and the processes, and keylang writes the first files for you. It is the only time keylang writes `keylang.json` itself, and it does so only into a folder that has none.

```sh
npx keylang web --new shop
```

The folder is created if it is not there. The printed address opens the diagram editor on an empty canvas, in «чернетка», with the «Новий проєкт» panel above it and the lanes of «4 шари»: presentation, application, infrastructure, domain. The template list also has «hexagonal» (adapters, ports, domain) and «порожньо». A lane is a layer, and the top lane is the highest one.

Draw a process the way lesson 1 describes the four jobs:

1. Drop a **тригер** into the presentation lane and name it in the panel on the right, for example `planned:presentation.placeOrder`; pick its kind (`route`, `cron`, `webhook`, …). The last part of the ID becomes the feature's name.
2. Drop **кроки** into the lanes where they belong, and join them from the trigger with sequence lines (the arrow on the right edge of a shape). A `when`, a `parallel` pair, an event, a timer and an external system come from the same palette.
3. Give a step its signature and its tests in the panel, such as `(cart: Cart) => Order` and `test tests/place.test.ts "refuses an empty cart"`.
4. A `deny` line between two lanes is a rule; so is `allow`.

Pick the languages, write the idea in one or two sentences, and press «Створити специфікацію». You get:

- `keylang.json`, with one `src/<layer>/**` glob per lane, plus an empty `src/<layer>/` folder for each;
- `keylang/rules.md`, with `- layers domain < infrastructure < application < presentation` in lane order and the drawn `deny`/`allow` lines;
- `keylang/features/placeOrder.md`, which holds the flow plus a `- planned fn …` line for every shape, because none of that code exists yet;
- `keylang/README.md`, with the idea as a quote, and the layout of the drawing in `keylang/diagrams/`.

If a file is already there, nothing is written and the panel tells you which one. A project that already has `keylang.json` has no «Новий проєкт» button, and a drawing there becomes proposals instead.

From here on it is the loop from the other parts:

```sh
cd shop
npx keylang agents --agents=claude
npx keylang check
npx keylang feature placeOrder
```

`check` exits 0 right away: each step is `unverified`, with the note «planned fn, not implemented». `feature` lists every planned line until the agent writes the code. Open `keylang web` again and pick the flow under «Діаграми». Its shapes are planned ◇ at first. After the agent writes code and you run `keylang map`, each turns into ✓, or ✗ if a step's route is broken.

Back to the [course](../README.md).
