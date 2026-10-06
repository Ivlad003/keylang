<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=b63a3c204971f05bb901783ee52eeaebfd79eb7c712fb960d806ec2ae4d95f10 lang=en detail=brief -->
Renders the FILES panel listing open files, appending " +" for dirty buffers (`tui.buffer.isDirty`) and " ≈" for pending proposals, highlighting the current file via `tui.view.drawPanelList` scrolled by `tui.view.filesTop`.
