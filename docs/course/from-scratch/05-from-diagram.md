# 5. From a diagram

[Starting a project](README.md) · **English** · [Українською](uk/05-from-diagram.md)

The other parts start from an empty app and a text you write. This one starts from a picture: you draw the layers and the processes, and keylang writes the first files for you. This is the only case where keylang writes `keylang.json` itself, and only into a folder that has none.

```sh
npx keylang web --new shop
```

keylang creates the folder if it is not there. The printed address opens the diagram editor on an empty canvas in «чернетка», with the «Новий проєкт» panel above it and the lanes of the «4 шари» template: presentation, application, infrastructure, domain. The template list also has «hexagonal» (adapters, ports, domain) and «порожньо». Each lane is a layer, and the top lane is the highest one.

Draw a process the way lesson 1 describes the four jobs:

1. Drop a **тригер** into the presentation lane and name it in the panel on the right, for example `planned:presentation.placeOrder`; pick its kind (`route`, `cron`, `webhook`, …). The last part of the ID becomes the feature's name.
2. Drop **кроки** into the lanes where they belong, and join them from the trigger with sequence lines (the arrow on the right edge of a shape). A `when`, a `parallel` pair, an event, a timer and an external system come from the same palette.
3. Give a step its signature and its tests in the panel, such as `(cart: Cart) => Order` and `test tests/place.test.ts "refuses an empty cart"`.
4. Draw a `deny` line between two lanes to make a rule; `allow` works the same way.

The editor keeps the shortcuts of diagrams.net: `Ctrl+Z` undoes, `Ctrl+Y` redoes, and `Ctrl+C`/`Ctrl+V` copy shapes, even into another `keylang web` tab. The «SVG» and «PNG» buttons save the canvas as a picture.

Pick the languages, write the idea in one or two sentences, and press «Створити специфікацію». You get:

- `keylang.json`, with one `src/<layer>/**` glob per lane, plus an empty `src/<layer>/` folder for each;
- `keylang/rules.md`, with `- layers domain < infrastructure < application < presentation` in lane order and the drawn `deny`/`allow` lines;
- `keylang/features/placeOrder.md`, which holds the flow plus a `- planned fn …` line for every shape, because none of that code exists yet (shapes no trigger reaches go to `keylang/features/structure.md`);
- `keylang/README.md`, with the idea as a quote, and the layout of the drawing in `keylang/diagrams/`.

If any of these files already exists, nothing is written, and the panel tells you which one. A project that already has `keylang.json` has no «Новий проєкт» button; a drawing there becomes proposals instead.

From here on, you follow the same loop as in the other parts:

```sh
cd shop
npx keylang agents --agents=claude
npx keylang check
npx keylang feature placeOrder
```

`check` exits 0 right away, with each step `unverified` and the note «planned fn, not implemented». `feature` lists every planned line until the agent writes the code. Open `keylang web` again and pick the flow under «Діаграми». At first its shapes are planned ◇. After the agent writes code and you run `keylang map`, each turns into ✓, or ✗ if a step's route is broken.

The drawing is not locked in the browser. `npx keylang export drawio placeOrder --out place.drawio` and `npx keylang export bpmn placeOrder --out place.bpmn` hand the same diagram to draw.io or a BPMN tool. If you rename or add a shape in draw.io, `npx keylang import drawio place.drawio` brings it back as one proposal for the spec, which you accept or reject.

Back to the [course](../README.md).
