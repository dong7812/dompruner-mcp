# Contributing to dompruner-mcp

## Development setup

```bash
git clone https://github.com/dong7812/AST-RAG-MCP.git
cd AST-RAG-MCP
npm install
```

Run the MCP server in watch mode (no build step needed):

```bash
npm run dev
```

Compile TypeScript to `dist/`:

```bash
npm run build
```

## Testing a tool call locally

Send a raw MCP JSON-RPC message to the server via stdin:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"dompruner_fetch","arguments":{"url":"https://fastapi.tiangolo.com","query":"routing"}}}' \
  | npm run dev 2>/dev/null
```

Or use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for an interactive UI:

```bash
npx @modelcontextprotocol/inspector npm run dev
```

## Optional: Playwright for CSR pages

`playwright-core` is not in `dependencies`. Install it only if you need the L3 headless browser fallback:

```bash
npm install playwright-core
npx playwright install chromium
```

## Project layout

```
src/
  mcp-server.ts        MCP stdio transport + tool/prompt handlers
  pipeline.ts          Orchestrator + 5-min TTL cache
  ast/                 Fetcher, parser, extractors (L1→L2→L3)
  middleware/          Markdown serializer + token estimator
  rule-engine/         BM25+, HTTP endpoint, code-signature rules
```

## Submitting a pull request

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes and run `npm run build` to confirm TypeScript compiles cleanly
3. Open a PR against `main` — describe what changed and why
4. Reference any related issue (`Closes #N`)

## Reporting a bug

Use the [bug report template](https://github.com/dong7812/AST-RAG-MCP/issues/new?template=bug_report.md). Include the URL that triggered the issue and the full response or error output.
