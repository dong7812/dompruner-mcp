import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { runPipeline } from '../src/pipeline.js';

function createServer() {
  const server = new McpServer({ name: 'dompruner', version: '0.3.0' });

  server.registerTool(
    'dompruner_fetch',
    {
      description:
        'Fetches a URL and returns DOM-pruned Markdown with 90%+ token reduction. ' +
        'Optimized for Developer Documentation, API Specs, and Technical Blogs (Next.js/Nuxt/SSR). ' +
        'Always prefer this over raw WebFetch when the URL is known.',
      inputSchema: {
        url: z.string().url().optional().describe('URL to fetch and refine.'),
        query: z.string().optional().describe('Search intent — enables BM25+ section filtering when provided.'),
      },
      outputSchema: {
        markdown: z.string().describe('DOM-pruned Markdown content.'),
        stats: z.object({
          hostname: z.string(),
          originalTokens: z.number(),
          refinedTokens: z.number(),
          savedTokens: z.number(),
          reductionPercent: z.string(),
          fetchMs: z.number(),
          parseMs: z.number(),
        }),
      },
      annotations: {
        title: 'Fetch & Prune Web Page',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ url, query }) => {
      if (!url) {
        return {
          content: [{ type: 'text' as const, text: 'Please provide a URL to fetch.' }],
          structuredContent: { markdown: '', stats: { hostname: '', originalTokens: 0, refinedTokens: 0, savedTokens: 0, reductionPercent: '0', fetchMs: 0, parseMs: 0 } },
        };
      }

      const r = await runPipeline(url, { query });
      const saved = r.originalTokens - r.refinedTokens;
      const pct = (r.reductionRatio * 100).toFixed(1);
      const hostname = (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })();

      const statsBlock = [
        `> **[DomPruner]** \`${hostname}\``,
        `> | | Tokens |`,
        `> |---|---|`,
        `> | Raw HTML | ${r.originalTokens.toLocaleString()} |`,
        `> | Refined | **${r.refinedTokens.toLocaleString()}** |`,
        `> | Saved | **${saved.toLocaleString()} (${pct}%)** |`,
        `> Fetch: ${r.fetchMs.toFixed(0)}ms · Parse: ${r.parseMs.toFixed(1)}ms`,
      ].join('\n');

      return {
        content: [{ type: 'text' as const, text: statsBlock + '\n\n---\n\n' + r.markdown }],
        structuredContent: {
          markdown: r.markdown,
          stats: {
            hostname,
            originalTokens: r.originalTokens,
            refinedTokens: r.refinedTokens,
            savedTokens: saved,
            reductionPercent: pct,
            fetchMs: r.fetchMs,
            parseMs: r.parseMs,
          },
        },
      };
    },
  );

  server.registerTool(
    'dompruner_analyze',
    {
      description:
        'Returns a token-reduction analysis report for a URL. ' +
        'Shows render type (SSR/CSR/SSG), original vs refined token counts, reduction ratio, and top Semantic Anchors.',
      inputSchema: {
        url: z.string().url().describe('URL to analyze.'),
      },
      outputSchema: {
        url: z.string(),
        renderType: z.string().describe('SSR, CSR, or SSG'),
        originalTokens: z.number(),
        refinedTokens: z.number(),
        reductionPercent: z.string(),
        fetchMs: z.number(),
        parseMs: z.number(),
        topAnchors: z.array(z.string()).describe('Top 5 semantic section headings.'),
      },
      annotations: {
        title: 'Analyze Token Reduction',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ url }) => {
      const r = await runPipeline(url);
      const pct = (r.reductionRatio * 100).toFixed(1);
      const topAnchors = r.anchors.anchors
        .slice(0, 5)
        .map(a => `${'#'.repeat(a.level)} ${a.text}`);

      const report = [
        `## DomPruner Analysis`,
        `- URL: ${r.url}`,
        `- Render type: ${r.renderType}`,
        `- Original tokens: ~${r.originalTokens.toLocaleString()}`,
        `- Refined tokens:  ~${r.refinedTokens.toLocaleString()}`,
        `- Token reduction: ${pct}%`,
        `- Fetch: ${r.fetchMs.toFixed(0)}ms  Parse: ${r.parseMs.toFixed(1)}ms`,
        `- Semantic Anchors (top 5):`,
        ...(topAnchors.length ? topAnchors.map(a => `  ${a}`) : ['  (none detected)']),
      ].join('\n');

      return {
        content: [{ type: 'text' as const, text: report }],
        structuredContent: {
          url: r.url,
          renderType: r.renderType,
          originalTokens: r.originalTokens,
          refinedTokens: r.refinedTokens,
          reductionPercent: pct,
          fetchMs: r.fetchMs,
          parseMs: r.parseMs,
          topAnchors,
        },
      };
    },
  );

  return server;
}

async function handler(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handler as GET, handler as POST };
