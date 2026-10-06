<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=b4a8c792b3bdff5aa70aee364e5d3417b8dc3e7392968898b67a75aedb0b23e2 lang=en detail=brief -->
Decodes raw terminal input via `tui.input.InputDecoder.feed`, sending multi-key runs judged pasted by `tui.app.pastedRun` as one paste event and other keys singly through `tui.app.App.safely`, then redraws.
