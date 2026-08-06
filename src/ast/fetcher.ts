export type RenderType = 'SSR' | 'SSG' | 'CSR';

export interface FetchResult {
  url: string;
  html: string;
  renderType: RenderType;
  ssgPayload?: unknown;
}

const SSG_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'next.js',  pattern: /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/ },
  { name: 'nuxt',     pattern: /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});/ },
  { name: 'gatsby',   pattern: /window\.page\s*=\s*(\{[\s\S]*?\});/ },
];

function detectRenderType(html: string): { renderType: RenderType; ssgPayload?: unknown } {
  for (const { pattern } of SSG_PATTERNS) {
    const m = html.match(pattern);
    if (m) {
      try {
        return { renderType: 'SSG', ssgPayload: JSON.parse(m[1]) };
      } catch {
        return { renderType: 'SSG' };
      }
    }
  }

  // CSR 판별: body 콘텐츠가 거의 없고 <div id="root"> 또는 <div id="app"> 만 있는 경우
  const bodyContent = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                          .replace(/<style[\s\S]*?<\/style>/gi, '');
  const textDensity = (bodyContent.match(/[a-zA-Z가-힣]/g) ?? []).length / bodyContent.length;

  if (textDensity < 0.02) {
    return { renderType: 'CSR' };
  }

  return { renderType: 'SSR' };
}

const USER_AGENTS = [
  'Mozilla/5.0 (compatible; AstRAG/1.0)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
];

async function httpFetch(
  url: string,
  userAgent: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Level 3: playwright-core를 사용해 CSR 페이지 렌더링 (선택적 의존성).
 * playwright-core가 설치되어 있지 않으면 null 반환 → 이전 결과 사용.
 */
async function tryPlaywright(url: string, timeoutMs: number): Promise<string | null> {
  try {
    // @ts-ignore — 선택적 의존성: 미설치 시 graceful skip
    const pw = await import('playwright-core');
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

export async function fetchPage(url: string, timeoutMs = 10_000): Promise<FetchResult> {
  // Level 1: 기본 HTTP fetch
  let res = await httpFetch(url, USER_AGENTS[0], timeoutMs);

  // Level 2: 403/429 → User-Agent 순환 재시도
  if (res.status === 403 || res.status === 429) {
    for (let i = 1; i < USER_AGENTS.length; i++) {
      res = await httpFetch(url, USER_AGENTS[i], timeoutMs);
      if (res.ok) break;
    }
  }

  if (!res.ok && res.status !== 200) {
    // Level 3: playwright-core 동적 임포트 시도 (CSR / anti-bot 페이지)
    const playwrightHtml = await tryPlaywright(url, timeoutMs);
    if (playwrightHtml) {
      const { renderType, ssgPayload } = detectRenderType(playwrightHtml);
      return { url, html: playwrightHtml, renderType, ssgPayload };
    }
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  const html = await res.text();

  // CSR 판별 후 텍스트 밀도 < 2%: playwright Level 3 시도
  const detected = detectRenderType(html);
  if (detected.renderType === 'CSR') {
    const playwrightHtml = await tryPlaywright(url, timeoutMs);
    if (playwrightHtml) {
      const full = detectRenderType(playwrightHtml);
      return { url, html: playwrightHtml, renderType: full.renderType, ssgPayload: full.ssgPayload };
    }
  }

  return { url, html, renderType: detected.renderType, ssgPayload: detected.ssgPayload };
}
