<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=4042e4e28098ae6f49282c93635342270ba9b5bf3571f98d80c463079fc46dc0 lang=en detail=brief -->
Dispatches the draft subcommand: `rules` or `map` go to `cmdDraftLayout`, while `flow <trigger>` checks the trigger and mode (algo, llm or hybrid) and then calls `draftFlowPrinter` from the root that `findRoot` locates.
