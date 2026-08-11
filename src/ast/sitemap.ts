/**
 * Sitemap fetcher — collects all page URLs from a sitemap or sitemap index.
 * Uses only Node.js built-ins (fetch) + regex; no XML parser dependency.
 */

const LOC_RE = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi;
const SITEMAP_INDEX_RE = /<sitemapindex[\s>]/i;

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'dompruner-sitemap/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching sitemap: ${url}`);
  return res.text();
}

/** Recursively collect all page URLs from a sitemap or sitemap index. */
export async function collectSitemapUrls(sitemapUrl: string): Promise<string[]> {
  let xml: string;
  try {
    xml = await fetchXml(sitemapUrl);
  } catch {
    return [];
  }

  if (SITEMAP_INDEX_RE.test(xml)) {
    // Sitemap index — recursively resolve each child sitemap
    const childUrls: string[] = [];
    let m: RegExpExecArray | null;
    LOC_RE.lastIndex = 0;
    while ((m = LOC_RE.exec(xml)) !== null) {
      childUrls.push(m[1]);
    }
    const batches = await Promise.all(childUrls.map(u => collectSitemapUrls(u)));
    return batches.flat();
  }

  // Regular urlset
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  LOC_RE.lastIndex = 0;
  while ((m = LOC_RE.exec(xml)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}
