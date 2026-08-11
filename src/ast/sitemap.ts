/**
 * Sitemap fetcher — collects all page URLs from a sitemap or sitemap index.
 *
 * ## Sitemap 포맷 두 종류
 *
 * 1. **urlset** (일반 사이트맵): 페이지 URL을 직접 나열
 *    ```xml
 *    <urlset>
 *      <url><loc>https://example.com/page-a</loc></url>
 *      <url><loc>https://example.com/page-b</loc></url>
 *    </urlset>
 *    ```
 *
 * 2. **sitemapindex** (인덱스 사이트맵): 다른 사이트맵 파일들을 가리킴
 *    ```xml
 *    <sitemapindex>
 *      <sitemap><loc>https://example.com/sitemap-blog.xml</loc></sitemap>
 *      <sitemap><loc>https://example.com/sitemap-docs.xml</loc></sitemap>
 *    </sitemapindex>
 *    ```
 *    대형 사이트(URL 50,000개 초과)가 사이트맵을 분할할 때 사용.
 *
 * ## 재귀 전략
 *
 *   collectSitemapUrls(root)
 *     └─ XML 가져옴
 *     └─ sitemapindex 감지?
 *         YES → <loc>들을 꺼내 각각 collectSitemapUrls() 재귀 호출
 *               → Promise.all로 병렬 처리 → 결과 flat merge
 *         NO  → urlset으로 간주 → <loc>들을 그대로 반환
 *
 * XML 파서 의존성 없이 regex만 사용 (sitemaps are well-structured & trusted content).
 */

// <loc>...</loc> 안의 URL을 캡처. /g 플래그로 반복 매칭.
const LOC_RE = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi;

// 루트 태그가 <sitemapindex>인지 판별. 속성이 붙을 수 있으므로 [\s>]로 처리.
const SITEMAP_INDEX_RE = /<sitemapindex[\s>]/i;

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'dompruner-sitemap/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching sitemap: ${url}`);
  return res.text();
}

/**
 * 사이트맵 URL 하나를 받아 페이지 URL 목록을 반환한다.
 * sitemapindex면 자식 사이트맵들을 병렬로 재귀 탐색해 평탄화(flat)된 배열로 합친다.
 * 네트워크 오류가 발생한 자식은 빈 배열로 처리해 전체 수집이 중단되지 않는다.
 */
export async function collectSitemapUrls(sitemapUrl: string): Promise<string[]> {
  let xml: string;
  try {
    xml = await fetchXml(sitemapUrl);
  } catch {
    // 이 사이트맵 파일 자체를 가져오지 못하면 빈 배열 반환 (부모 재귀에서 무시됨)
    return [];
  }

  if (SITEMAP_INDEX_RE.test(xml)) {
    // ── sitemapindex 분기 ──────────────────────────────────────────────────
    // <loc>으로 감싸진 자식 사이트맵 URL을 모두 수집
    const childUrls: string[] = [];
    let m: RegExpExecArray | null;
    LOC_RE.lastIndex = 0; // /g 플래그는 상태를 가지므로 반드시 리셋
    while ((m = LOC_RE.exec(xml)) !== null) {
      childUrls.push(m[1]);
    }
    // 자식 사이트맵들을 병렬로 재귀 탐색 (각 자식도 sitemapindex일 수 있음)
    const batches = await Promise.all(childUrls.map(u => collectSitemapUrls(u)));
    return batches.flat(); // [[url1, url2], [url3]] → [url1, url2, url3]
  }

  // ── 일반 urlset 분기 ─────────────────────────────────────────────────────
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  LOC_RE.lastIndex = 0;
  while ((m = LOC_RE.exec(xml)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}
