import { createRequire } from 'module';

const pkg = createRequire(import.meta.url)('../package.json') as {
  version: string;
  description: string;
};

export function GET(): Response {
  return new Response(
    JSON.stringify({
      name: 'dompruner',
      version: pkg.version,
      description: pkg.description,
      url: 'https://dompruner-mcp.vercel.app/api/mcp',
      tools: [
        {
          name: 'dompruner_fetch',
          description:
            'Fetches a URL and returns DOM-pruned Markdown with 90%+ token reduction. ' +
            'Optimized for Developer Documentation, API Specs, and Technical Blogs.',
        },
        {
          name: 'dompruner_analyze',
          description:
            'Returns a token-reduction analysis report for a URL. Shows render type, ' +
            'original vs refined token counts, and top Semantic Anchors.',
        },
      ],
    }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
