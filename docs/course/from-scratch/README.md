# Starting a project

[Course](../README.md) · **English** · [Українською](uk/README.md)

![Ключ до розробки і розуміння проєктів](../images/banner.png)

keylang does not create the app for you. A bot has its own library, a CRUD app has its own framework, and Nest has `nest new`, so you create that empty project first. Then you write a short text that says who may know whom. An agent generates the code from that text, so you do not write the functions, and keylang does not start the agent. What keylang does is fail the check when the code drifts away from the text.

There are three sketches, and each uses the same three files every time: `keylang.json`, `keylang/rules.md`, and one file under `keylang/features/`. The agent fills in the code until `keylang feature <slug>` says done. In part 5 you draw the layers and a process instead, and `keylang web --new` writes those three files from the picture.

If the words are new to you, read the [pre-course](../pre/README.md) first. The commands on these pages are the same ones as in [lesson 2](../02-install-and-check.md).

| Part | The project |
|---|---|
| [1. The shape](01-the-shape.md) | Four jobs, before any of the three apps |
| [2. A Telegram bot](02-telegram-bot.md) | `/start` saves a note, and the bot library stays at the edge |
| [3. A Python CRUD](03-python-crud.md) | Create a task; the HTTP route does not talk to the database |
| [4. A NestJS app](04-nestjs.md) | The same cut, in TypeScript, with Nest's decorators in mind |
| [5. From a diagram](05-from-diagram.md) | Draw the lanes and a process; keylang writes the first files |

Once the files exist, copy ids from `keylang map`. The ids on these pages are what you get when your folders match the globs shown here.
