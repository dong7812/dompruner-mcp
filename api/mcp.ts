import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { runPipeline } from '../src/pipeline.js';

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'dompruner_fetch',
      'Fetches a URL and returns DOM-pruned Markdown with 90%+ token reduction. Optimized for Developer Documentation, API Specs, and Technical Blogs (Next.js/Nuxt/SSR).',
      {
        url: z.string().url().optional().describe('URL to fetch and refine.'),
        query: z.string().optional().describe('Search intent — enables BM25+ section filtering when provided.'),
      },
      async ({ url, query }) => {
        if (!url) {
          return {
            content: [{ type: 'text' as const, text: 'Please provide a URL to fetch.' }],
          };
        }

        const r = await runPipeline(url, { query });
        const saved    = r.originalTokens - r.refinedTokens;
        const pct      = (r.reductionRatio * 100).toFixed(1);
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

        return { content: [{ type: 'text' as const, text: statsBlock + '\n\n---\n\n' + r.markdown }] };
      },
    );

    server.tool(
      'dompruner_analyze',
      'Returns a token-reduction analysis report for a URL. Shows render type, original vs refined token counts, and top Semantic Anchors.',
      {
        url: z.string().url().describe('URL to analyze'),
      },
      async ({ url }) => {
        const r = await runPipeline(url);
        const topAnchors = r.anchors.anchors
          .slice(0, 5)
          .map(a => `  ${'#'.repeat(a.level)} ${a.text}`)
          .join('\n');

        const report = [
          `## DomPruner Analysis`,
          `- URL: ${r.url}`,
          `- Render type: ${r.renderType}`,
          `- Original tokens: ~${r.originalTokens.toLocaleString()}`,
          `- Refined tokens:  ~${r.refinedTokens.toLocaleString()}`,
          `- Token reduction: ${(r.reductionRatio * 100).toFixed(1)}%`,
          `- Fetch: ${r.fetchMs.toFixed(0)}ms  Parse: ${r.parseMs.toFixed(1)}ms`,
          `- Semantic Anchors (top 5):`,
          topAnchors || '  (none detected)',
        ].join('\n');

        return { content: [{ type: 'text' as const, text: report }] };
      },
    );
  },
  {},
  { basePath: '/api' },
);

export { handler as GET, handler as POST };
