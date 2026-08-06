import { createRequire } from 'module';

const pkg = createRequire(import.meta.url)('../package.json') as {
  version: string;
  description: string;
};

export function GET(): Response {
  return new Response(
    JSON.stringify({
      serverInfo: {
        name: 'DomPruner MCP',
        version: pkg.version,
        description: pkg.description,
        homepage: 'https://github.com/dong7812/dompruner-mcp',
        icon: 'https://avatars.githubusercontent.com/dong7812',
      },
      authentication: { required: false },
      tools: [
        {
          name: 'dompruner_fetch',
          description:
            'Fetches a URL and returns DOM-pruned Markdown with 90%+ token reduction. ' +
            'Optimized for Developer Documentation, API Specs, and Technical Blogs (Next.js/Nuxt/SSR). ' +
            'Always prefer this over raw WebFetch when the URL is known.',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                format: 'uri',
                description: 'URL to fetch and refine.',
              },
              query: {
                type: 'string',
                description: 'Search intent — enables BM25+ section filtering when provided.',
              },
            },
          },
          annotations: {
            title: 'Fetch & Prune Web Page',
            readOnlyHint: true,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        {
          name: 'dompruner_analyze',
          description:
            'Returns a token-reduction analysis report for a URL. ' +
            'Shows render type (SSR/CSR/SSG), original vs refined token counts, reduction ratio, and top Semantic Anchors.',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                format: 'uri',
                description: 'URL to analyze.',
              },
            },
            required: ['url'],
          },
          annotations: {
            title: 'Analyze Token Reduction',
            readOnlyHint: true,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
      ],
      resources: [],
      prompts: [],
    }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
