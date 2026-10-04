<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=26a98583f9cfc3c9550403ec33b8dedc20d7177a5600d3c7527d8ebae0ee21cd lang=en detail=brief -->
Union type covering every event the terminal input layer can emit: a keypress, a mouse action, or a bracketed paste. Consumers in the `tui` layer switch on it to dispatch handling by event kind.
