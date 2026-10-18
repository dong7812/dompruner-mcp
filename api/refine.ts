import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runPipeline } from '../src/pipeline.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { html, query, url } = req.body as { html?: string; query?: string; url?: string };

  if (typeof html !== 'string' || html.length === 0) {
    return res.status(400).json({ error: '`html` (string) is required in request body' });
  }

  const targetUrl = url ?? 'https://unknown.local/';

  try {
    const result = await runPipeline(targetUrl, {
      prefetched: { html, renderType: 'SSR' },
      query: query ?? '',
    });

    const originalChars = html.length;
    const refinedChars  = result.markdown.length;

    res.status(200).json({
      markdown:       result.markdown,
      originalChars,
      refinedChars,
      estimatedTokens: result.refinedTokens,
      reductionRatio:  result.reductionRatio,
      renderType:      result.renderType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}
