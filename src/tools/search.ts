import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { PipedriveClient, handlePipedriveError, truncateText } from '../pipedrive';
import { registerTool } from '../utils';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlobalSearchItem {
  result_score: number;
  item: {
    id: number | string;
    type: string;
    title?: string;
    name?: string;
    [key: string]: unknown;
  };
}

interface GlobalSearchData {
  items: GlobalSearchItem[];
}

type SearchAllParams = {
  term: string;
  item_types?: string;
  fields?: string;
  exact_match?: boolean;
  limit: number;
  start: number;
};

// ─── Tool Registration ────────────────────────────────────────────────────────

export function registerSearchTools(server: McpServer, client: PipedriveClient): void {
  registerTool(
    server,
    'pipedrive_search_all',
    {
      title: 'Global Search Across All Pipedrive Items',
      description: `Search across all Pipedrive item types simultaneously using a single keyword.

Searches deals, persons, organizations, products, leads, and files in one call.
Useful when you don't know what type of record you're looking for.

Args:
  - term: Search keyword (minimum 2 characters, required).
  - item_types: Comma-separated list of item types to search:
      deal, person, organization, product, lead, file, mail_attachment, project.
      Omit to search all types.
  - fields: Comma-separated fields to search within. Options vary by type
      (e.g. custom_fields, notes, title, name, email, phone). Omit to search defaults.
  - exact_match: Require exact word match (default: false).
  - limit: Max results per page (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT}).
  - start: Pagination offset (default: 0).

Returns: Matching items grouped by type with relevance scores.

Use when: You want to find anything across all CRM records with a single search.
More efficient than calling individual search tools when the record type is unknown.`,
      inputSchema: {
        term: z.string().min(2).describe('Search keyword — at least 2 characters (required)'),
        item_types: z
          .string()
          .optional()
          .describe(
            'Comma-separated item types to include: deal, person, organization, product, lead, file. ' +
            'Omit to search all types.'
          ),
        fields: z
          .string()
          .optional()
          .describe('Comma-separated fields to search within (e.g. custom_fields, notes). Omit for defaults.'),
        exact_match: z.boolean().optional().describe('Require exact word match (default: false)'),
        limit: z.number().optional().describe(`Max results (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`),
        start: z.number().optional().describe('Pagination offset (default: 0)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as SearchAllParams;
      const limit = params.limit ?? DEFAULT_LIMIT;
      const start = params.start ?? 0;
      try {
        const queryParams: Record<string, string | number | boolean | undefined | null> = {
          term: params.term,
          limit,
          start,
        };
        if (params.item_types) queryParams.item_types = params.item_types;
        if (params.fields) queryParams.fields = params.fields;
        if (params.exact_match !== undefined) queryParams.exact_match = params.exact_match ? 1 : 0;

        const response = await client.get<GlobalSearchData>('/itemSearch', queryParams);
        const items = response.data?.items ?? [];
        const pagination = response.additional_data?.pagination;
        const structured = {
          results: items.map((i) => ({ score: i.result_score, type: i.item.type, item: i.item })),
          count: items.length,
          start,
          has_more: pagination?.more_items_in_collection ?? false,
          next_start: pagination?.next_start,
        };

        let text = `# Global Search: "${params.term}" (${items.length} result${items.length !== 1 ? 's' : ''})\n\n`;
        if (items.length === 0) {
          text += `_No items found matching "${params.term}"._\n`;
          text += `Try a shorter term, remove item_types filter, or set exact_match: false.`;
        } else {
          // Group by type for readability
          const byType = new Map<string, GlobalSearchItem[]>();
          for (const item of items) {
            const type = item.item.type ?? 'unknown';
            if (!byType.has(type)) byType.set(type, []);
            byType.get(type)!.push(item);
          }

          for (const [type, typeItems] of byType) {
            text += `## ${type.charAt(0).toUpperCase() + type.slice(1)}s (${typeItems.length})\n\n`;
            for (const { result_score, item } of typeItems) {
              const displayName = (item.title ?? item.name ?? String(item.id)) as string;
              text += `- **${displayName}** (ID: ${item.id}) — score: ${result_score.toFixed(2)}\n`;
            }
            text += '\n';
          }
        }
        if (structured.has_more) {
          text += `_More results available. Use \`start=${structured.next_start}\` for next page._`;
        }
        return {
          content: [{ type: 'text' as const, text: truncateText(text) }],
          structuredContent: structured,
        };
      } catch (error) {
        return handlePipedriveError(error, `global search for "${params.term}"`);
      }
    }
  );
}
