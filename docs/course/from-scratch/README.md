# Starting a project

[Course](../README.md) · **English** · [Українською](uk/README.md)

![Ключ до розробки і розуміння проектів](../images/banner.png)

keylang does not create the app. A bot has its own library. A CRUD app has its own framework. Nest has `nest new`. You create that empty project first. Then you write the short text that says who may know whom. An agent generates the code from that text. You do not write the functions. keylang does not start the agent. It fails the check when the code drifts.

Three sketches. The same four files every time: `keylang.json`, `keylang/rules.md`, and one file under `keylang/features/`. The agent fills in the code until `keylang feature <slug>` says done.

If the words are new, read the [pre-course](../pre/README.md) first. The commands in these pages are the same ones as [lesson 2](../02-install-and-check.md).

| Part | The project |
|---|---|
| [1. The shape](01-the-shape.md) | Four jobs, before any of the three apps |
| [2. A Telegram bot](02-telegram-bot.md) | `/start` saves a note. The bot library stays at the edge |
| [3. A Python CRUD](03-python-crud.md) | Create a task. The HTTP route does not talk to the database |
| [4. A NestJS app](04-nestjs.md) | The same cut, in TypeScript, with Nest's decorators in mind |

Copy ids from `keylang map` once the files exist. The ids below are what you get when the folders match the globs on this page.
