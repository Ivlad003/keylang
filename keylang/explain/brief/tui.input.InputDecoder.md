<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=6d39aa6c09ad553d4f36f440f6a5aeb3050d69457fec5f25703a917cfede8822 lang=en detail=brief -->
Stateful decoder turning raw terminal input chunks into key, mouse and bracketed-paste events, buffering split sequences and grapheme clusters across chunks until `tui.input.InputDecoder.flush` resolves them.
