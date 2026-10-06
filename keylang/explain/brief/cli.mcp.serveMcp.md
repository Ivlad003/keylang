<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=8a68b6bf45821555867eb7eeddd1f449a396f9fb931e7de568a74857260772ae lang=en detail=brief -->
Builds the MCP server via `cli.mcp.mcpServer`, connects it to a stdio transport, and blocks until the client closes stdin. Then it resolves with exit code 0, so it acts as the CLI's long-running MCP entry point.
