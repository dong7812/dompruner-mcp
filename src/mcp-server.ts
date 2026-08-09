#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'module';
import { runPipeline, type PipelineResult } from './pipeline.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const server = new Server(
  { name: 'dompruner', version },
  { capabilities: { tools: {}, prompts: {} } },
);

// ── Prompts ───────────────────────────────────────────────────────────────────
// Claude Code / Cursor / Codex 등 어느 환경에서든 올바른 사용 패턴을 주입한다.
// LLM이 직접 URL 탐색(native search)을 하고 DomPruner는 정제만 담당하는 역할 분리.

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'dompruner_workflow',
      description: 'How to retrieve web content with DomPruner — URL known vs unknown',
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== 'dompruner_workflow') {
    throw new Error(`Unknown prompt: ${request.params.name}`);
  }
  return {
    description: 'DomPruner web retrieval workflow',
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            'When retrieving web content using DomPruner:',
            '',
            '**URL is known** → call dompruner_fetch(url) directly.',
            '',
            '**URL is unknown** (e.g. "check the latest FastAPI changelog"):',
            '1. Use your native web search to find the most relevant official URL.',
            '2. Call dompruner_fetch(url) with that URL.',
            '3. DomPruner prunes the DOM and returns 90%+ token-reduced Markdown.',
            '',
            'You handle URL discovery. DomPruner handles content refinement.',
            'No external search API or API key required on either side.',
          ].join('\n'),
        },
      },
    ],
  };
});

// ── Stats block ───────────────────────────────────────────────────────────────

function buildStatsBlock(r: PipelineResult): string {
  const hostname = (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })();
  const saved = r.originalTokens - r.refinedTokens;
  const pct   = (r.reductionRatio * 100).toFixed(1);
  // BM25 score 0 = 쿼리 용어 미매칭 → BM25 필터 없이 전체 DomPruner 출력으로 자동 전환
  const bm25Tag = r.bm25Confidence === 0 ? '  `[BM25: no match → full content]`' : '';

  return [
    `> **[DomPruner]** \`${hostname}\`${bm25Tag}`,
    `> | | Tokens |`,
    `> |---|---|`,
    `> | Raw HTML | ${r.originalTokens.toLocaleString()} |`,
    `> | DomPruner 정제 후 | **${r.refinedTokens.toLocaleString()}** |`,
    `> | 절감 | **${saved.toLocaleString()} (${pct}%)** |`,
    `> Fetch: ${r.fetchMs.toFixed(0)}ms · Parse: ${r.parseMs.toFixed(1)}ms`,
  ].join('\n');
}

// ── Tools ─────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'dompruner_fetch',
      description:
        'DEFAULT tool for retrieving web content. Fetches a URL directly and returns DOM-refined compact Markdown with 90%+ token reduction. '
        + 'Always prefer this over dompruner_search when the URL is known or can be inferred (e.g. official docs, changelogs, blog posts, API references). '
        + 'Equivalent to WebFetch but with DomPruner token reduction applied.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          url: {
            type: 'string',
            description: 'URL to fetch and refine. Required unless query is provided.',
          },
          query: {
            type: 'string',
            description:
              'Search intent (e.g. "Java JVM release notes"). '
              + 'When url is omitted, DomPruner requests a URL from the host LLM via sampling (if supported), '
              + 'then fetches it. Also enables BM25 section filtering when url is provided.',
          },
        },
      },
    },
    {
      name: 'dompruner_analyze',
      description:
        'Returns a token-reduction analysis report for a URL. Shows render type, original vs refined token counts, and top Semantic Anchors.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          url: { type: 'string', description: 'URL to analyze' },
        },
        required: ['url'],
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ── dompruner_fetch ────────────────────────────────────────────────────────────
  if (name === 'dompruner_fetch') {
    const { url: rawUrl, query } = args as { url?: string; query?: string };
    let resolvedUrl = rawUrl;

    // URL 없이 query만 온 경우 — 환경 감지 후 처리
    if (!resolvedUrl && query) {
      const caps = server.getClientCapabilities();

      if (caps?.sampling) {
        // sampling 지원 환경(Claude Code 등): 호스트 LLM에게 URL 탐색 위임
        try {
          const response = await server.createMessage({
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Find the single best official URL for the following query.\n`
                      + `Query: "${query}"\n\n`
                      + `Reply with ONLY the URL — no explanation, no markdown, just the URL.`,
                },
              },
            ],
            maxTokens: 200,
          });

          const text = response.content.type === 'text' ? response.content.text.trim() : '';
          const urlMatch = text.match(/https?:\/\/[^\s"'>]+/);
          resolvedUrl = urlMatch?.[0];
        } catch {
          // sampling 호출 실패 — fallback으로 내려감
        }
      }

      // sampling 미지원이거나 sampling 실패 → 호스트에게 native search 요청
      if (!resolvedUrl) {
        return {
          content: [
            {
              type: 'text',
              text: [
                `**DomPruner**: URL이 필요합니다.`,
                ``,
                `"${query}"에 대해 다음 단계로 진행해 주세요:`,
                `1. 네이티브 웹 검색으로 가장 관련성 높은 공식 URL을 찾습니다.`,
                `2. 찾은 URL로 \`dompruner_fetch(url)\`을 다시 호출합니다.`,
                ``,
                `DomPruner는 URL → 정제를 담당하고, URL 탐색은 현재 환경의 검색 기능을 활용합니다.`,
              ].join('\n'),
            },
          ],
        };
      }
    }

    if (!resolvedUrl) {
      throw new Error('dompruner_fetch requires either url or query');
    }

    const r = await runPipeline(resolvedUrl, { query });
    return { content: [{ type: 'text', text: buildStatsBlock(r) + '\n\n---\n\n' + r.markdown }] };
  }

  // ── dompruner_analyze ──────────────────────────────────────────────────────────
  if (name === 'dompruner_analyze') {
    const { url } = args as { url: string };
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

    return { content: [{ type: 'text', text: report }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
