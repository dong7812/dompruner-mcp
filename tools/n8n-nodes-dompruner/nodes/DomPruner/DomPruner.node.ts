import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import * as https from 'https';
import * as http from 'http';

// ── HTTP 호출 분리 — 나중에 번들 로직으로 교체 가능 ───────────────────────────
interface RefineRequest {
  html: string;
  query?: string;
  url?: string;
}

interface RefineResponse {
  markdown: string;
  originalChars: number;
  refinedChars: number;
  estimatedTokens: number;
  reductionRatio: number;
  renderType: string;
}

function callDomPruner(
  endpoint: string,
  payload: RefineRequest,
): Promise<RefineResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(endpoint);
    const isHttps = parsed.protocol === 'https:';
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          const data = JSON.parse(text) as RefineResponse & { error?: string };
          if (data.error) return reject(new Error(data.error));
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
// ─────────────────────────────────────────────────────────────────────────────

export class DomPruner implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DomPruner',
    name: 'domPruner',
    group: ['transform'],
    version: 1,
    description:
      'Refines HTML to LLM-ready Markdown (90%+ token reduction). ' +
      'Connect after an HTTP Request node — pass the HTML body, not a URL.',
    defaults: { name: 'DomPruner' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'HTML Input Field',
        name: 'htmlField',
        type: 'string',
        default: 'data',
        description: 'Name of the field in the input item that contains the raw HTML string',
      },
      {
        displayName: 'Query (optional)',
        name: 'query',
        type: 'string',
        default: '',
        description:
          'Search intent for BM25 section filtering. Leave empty to return full refined content.',
      },
      {
        displayName: 'Page URL (optional)',
        name: 'pageUrl',
        type: 'string',
        default: '',
        description:
          'Original URL of the page — used only for FQN routing heuristics, not for fetching.',
      },
      {
        displayName: 'DomPruner Endpoint',
        name: 'endpoint',
        type: 'string',
        default: 'https://dompruner-mcp.vercel.app/api/refine',
        description: 'DomPruner /api/refine endpoint URL',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const results: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const htmlField = this.getNodeParameter('htmlField', i) as string;
      const query     = (this.getNodeParameter('query', i) as string).trim();
      const pageUrl   = (this.getNodeParameter('pageUrl', i) as string).trim();
      const endpoint  = this.getNodeParameter('endpoint', i) as string;

      const html = items[i].json[htmlField] as string | undefined;
      if (typeof html !== 'string' || html.length === 0) {
        throw new NodeOperationError(
          this.getNode(),
          `Field "${htmlField}" is missing or not a string in item ${i}`,
        );
      }

      const payload: RefineRequest = { html };
      if (query)   payload.query = query;
      if (pageUrl) payload.url   = pageUrl;

      const refined = await callDomPruner(endpoint, payload);

      results.push({
        json: {
          ...items[i].json,
          dompruner: {
            markdown:        refined.markdown,
            originalChars:   refined.originalChars,
            refinedChars:    refined.refinedChars,
            estimatedTokens: refined.estimatedTokens,
            reductionRatio:  refined.reductionRatio,
            renderType:      refined.renderType,
          },
        },
      });
    }

    return [results];
  }
}
