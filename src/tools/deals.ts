import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { PipedriveClient, handlePipedriveError, truncateText } from '../pipedrive';
import { registerTool } from '../utils';
import { resolveCustomFields } from '../custom-fields';
import { Deal, DealSearchResult, PipedriveResponse, SearchData } from '../types';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants';

// ─── Input Types ─────────────────────────────────────────────────────────────

type ListDealsParams = {
  limit: number;
  start: number;
  status?: 'open' | 'won' | 'lost' | 'deleted' | 'all_not_deleted';
  stage_id?: number;
  user_id?: number;
  pipeline_id?: number;
  // Advanced filters
  search_title?: string;
  days_back?: number;
  min_value?: number;
  max_value?: number;
};

type GetDealParams = { id: number };

type CreateDealParams = {
  title: string;
  value?: number;
  currency?: string;
  person_id?: number;
  org_id?: number;
  stage_id?: number;
  status?: 'open' | 'won' | 'lost';
  expected_close_date?: string;
};

type UpdateDealParams = {
  id: number;
  title?: string;
  value?: number;
  currency?: string;
  person_id?: number;
  org_id?: number;
  stage_id?: number;
  status?: 'open' | 'won' | 'lost';
  expected_close_date?: string;
  lost_reason?: string;
};

type SearchDealsParams = {
  term: string;
  fields?: string;
  exact_match?: boolean;
  limit: number;
  start: number;
};

type DeleteDealParams = { id: number };

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatDeal(deal: Deal): string {
  const lines: string[] = [
    `### Deal #${deal.id as number}: ${deal.title as string}`,
    `- **Status**: ${deal.status as string}`,
    `- **Value**: ${(deal.value as number | null) ?? 0} ${deal.currency as string}`,
    `- **Stage ID**: ${deal.stage_id as number} | **Pipeline ID**: ${deal.pipeline_id as number}`,
  ];
  const person = deal.person_id as { value: number; name: string } | null;
  const org = deal.org_id as { value: number; name: string } | null;
  const owner = deal.user_id as { id: number; name: string };
  if (person) lines.push(`- **Contact**: ${person.name} (ID: ${person.value})`);
  if (org) lines.push(`- **Organization**: ${org.name} (ID: ${org.value})`);
  if (deal.expected_close_date) lines.push(`- **Expected Close**: ${deal.expected_close_date as string}`);
  if (deal.lost_reason) lines.push(`- **Lost Reason**: ${deal.lost_reason as string}`);
  lines.push(
    `- **Activities**: ${deal.activities_count as number} | **Notes**: ${deal.notes_count as number}`,
    `- **Owner**: ${owner.name}`,
    `- **Added**: ${deal.add_time as string} | **Updated**: ${deal.update_time as string}`
  );
  // Custom fields
  const custom = deal.custom_fields as Record<string, unknown> | undefined;
  if (custom && Object.keys(custom).length > 0) {
    lines.push('- **Custom Fields**:');
    for (const [key, val] of Object.entries(custom)) {
      lines.push(`  - ${key}: ${String(val)}`);
    }
  }
  return lines.join('\n');
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerDealTools(server: McpServer, client: PipedriveClient): void {
  // ── pipedrive_list_deals ──────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_list_deals',
    {
      title: 'List Pipedrive Deals',
      description: `List deals from Pipedrive CRM with optional filters.

Returns a paginated list of deals. Use filters to narrow results by status, stage, owner, pipeline, value range, or age.

Args:
  - status: Filter by deal status (open/won/lost/deleted/all_not_deleted).
  - stage_id: Filter by pipeline stage ID (get stage IDs via pipedrive_list_stages).
  - user_id: Filter by deal owner user ID.
  - pipeline_id: Filter by pipeline ID (get pipeline IDs via pipedrive_list_pipelines).
  - search_title: Filter deals whose title contains this string (case-insensitive).
  - days_back: Return only deals added/updated in the last N days.
  - min_value: Return only deals with value >= this amount.
  - max_value: Return only deals with value <= this amount.
  - limit: Max results per page (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT}).
  - start: Pagination offset (default: 0).

Returns: List of deals with title, value, status, stage, contact, organization, owner, dates.
  Includes has_more and next_start for pagination.

Use when: Browsing deals, finding deals by status/stage/pipeline, reviewing pipeline.
Don't use when: Searching for a specific deal by keyword (use pipedrive_search_deals).`,
      inputSchema: {
        limit: z.number().optional().describe(`Max results (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`),
        start: z.number().optional().describe('Pagination offset (default: 0)'),
        status: z
          .enum(['open', 'won', 'lost', 'deleted', 'all_not_deleted'])
          .optional()
          .describe('Filter by deal status'),
        stage_id: z.number().int().positive().optional().describe('Filter to a specific pipeline stage ID'),
        user_id: z.number().int().positive().optional().describe('Filter by deal owner user ID'),
        pipeline_id: z.number().int().positive().optional().describe('Filter to deals in this pipeline ID'),
        search_title: z.string().optional().describe('Filter deals whose title contains this string'),
        days_back: z.number().int().positive().optional().describe('Return only deals from the last N days'),
        min_value: z.number().optional().describe('Return only deals with value >= this amount'),
        max_value: z.number().optional().describe('Return only deals with value <= this amount'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as ListDealsParams;
      const limit = params.limit ?? DEFAULT_LIMIT;
      const start = params.start ?? 0;
      try {
        const queryParams: Record<string, string | number | boolean | undefined | null> = {
          status: params.status,
          stage_id: params.stage_id,
          user_id: params.user_id,
          pipeline_id: params.pipeline_id,
          limit,
          start,
        };

        const response = await client.get<Deal[]>('/deals', queryParams);
        let deals = response.data;
        const pagination = response.additional_data?.pagination;

        // Client-side advanced filters (Pipedrive API doesn't support these natively)
        if (params.search_title) {
          const term = params.search_title.toLowerCase();
          deals = deals.filter((d) => (d.title as string).toLowerCase().includes(term));
        }
        if (params.days_back) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - params.days_back);
          deals = deals.filter((d) => new Date(d.update_time as string) >= cutoff);
        }
        if (params.min_value !== undefined) {
          deals = deals.filter((d) => ((d.value as number | null) ?? 0) >= params.min_value!);
        }
        if (params.max_value !== undefined) {
          deals = deals.filter((d) => ((d.value as number | null) ?? 0) <= params.max_value!);
        }

        const structured = {
          deals,
          count: deals.length,
          start,
          has_more: pagination?.more_items_in_collection ?? false,
          next_start: pagination?.next_start,
        };
        let text = `# Deals (${deals.length} result${deals.length !== 1 ? 's' : ''})\n\n`;
        if (deals.length === 0) {
          text += '_No deals found matching the given filters._';
        } else {
          text += deals.map(formatDeal).join('\n\n');
        }
        if (structured.has_more) {
          text += `\n\n_More results available. Use \`start=${structured.next_start}\` for next page._`;
        }
        return {
          content: [{ type: 'text' as const, text: truncateText(text) }],
          structuredContent: structured,
        };
      } catch (error) {
        return handlePipedriveError(error, 'list deals');
      }
    }
  );

  // ── pipedrive_get_deal ────────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_get_deal',
    {
      title: 'Get Pipedrive Deal',
      description: `Get full details of a single deal by its ID, including resolved custom fields.

Args:
  - id: The deal ID (required).

Returns: Complete deal object including title, value, currency, status, stage, pipeline,
  contact, organization, owner, expected close date, activities count, notes count,
  timestamps, and any custom fields resolved to human-readable names.

Use when: You have a specific deal ID and need full details.
Don't use when: You don't know the ID (use pipedrive_search_deals or pipedrive_list_deals first).`,
      inputSchema: { id: z.number().int().positive().describe('Deal ID to retrieve') },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (raw) => {
      const { id } = raw as GetDealParams;
      try {
        const response = await client.get<Deal>(`/deals/${id}`);
        const rawDeal = response.data;
        const deal = await resolveCustomFields(client, rawDeal as Record<string, unknown>, 'deal') as unknown as Deal;
        return {
          content: [{ type: 'text' as const, text: `# Deal #${deal.id as number}\n\n${formatDeal(deal)}` }],
          structuredContent: deal,
        };
      } catch (error) {
        return handlePipedriveError(error, `get deal #${id}`);
      }
    }
  );

  // ── pipedrive_create_deal ─────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_create_deal',
    {
      title: 'Create Pipedrive Deal',
      description: `Create a new deal in Pipedrive CRM.

Args:
  - title: Deal name/title (required).
  - value: Monetary value of the deal.
  - currency: 3-letter currency code (e.g. USD, EUR, GBP). Default: USD.
  - person_id: ID of the contact/person to associate.
  - org_id: ID of the organization to associate.
  - stage_id: Pipeline stage ID. Get stages via pipedrive_list_stages.
  - status: Deal status — open, won, or lost. Default: open.
  - expected_close_date: Target close date in YYYY-MM-DD format.

Returns: The newly created deal object with assigned ID.`,
      inputSchema: {
        title: z.string().min(1).describe('Deal title/name (required)'),
        value: z.number().min(0).optional().describe('Deal monetary value'),
        currency: z.string().optional().describe('Currency code — 3 letters (e.g. USD, EUR). Default: USD'),
        person_id: z.number().int().positive().optional().describe('Person/contact ID to associate'),
        org_id: z.number().int().positive().optional().describe('Organization ID to associate'),
        stage_id: z.number().int().positive().optional().describe('Pipeline stage ID'),
        status: z.enum(['open', 'won', 'lost']).optional().describe('Deal status. Default: open'),
        expected_close_date: z.string().optional().describe('Expected close date (YYYY-MM-DD)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as CreateDealParams;
      try {
        const body: Record<string, unknown> = { title: params.title };
        if (params.value !== undefined) body.value = params.value;
        body.currency = params.currency ?? 'USD';
        if (params.person_id) body.person_id = params.person_id;
        if (params.org_id) body.org_id = params.org_id;
        if (params.stage_id) body.stage_id = params.stage_id;
        body.status = params.status ?? 'open';
        if (params.expected_close_date) body.expected_close_date = params.expected_close_date;

        const response = await client.post<Deal>('/deals', body);
        const deal = response.data;
        return {
          content: [{ type: 'text' as const, text: `# Deal Created Successfully\n\n${formatDeal(deal)}` }],
          structuredContent: deal,
        };
      } catch (error) {
        return handlePipedriveError(error, 'create deal');
      }
    }
  );

  // ── pipedrive_update_deal ─────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_update_deal',
    {
      title: 'Update Pipedrive Deal',
      description: `Update fields of an existing deal. Only provided fields are updated.

Args:
  - id: Deal ID to update (required).
  - title: New deal title.
  - value: New deal value.
  - currency: New currency code (3 letters).
  - person_id: New associated contact ID.
  - org_id: New associated organization ID.
  - stage_id: New pipeline stage ID (moves deal to this stage).
  - status: New status — open, won, or lost. Setting to "won"/"lost" closes the deal.
  - expected_close_date: New expected close date (YYYY-MM-DD).
  - lost_reason: Reason for losing (use when setting status to "lost").

Returns: Updated deal object.`,
      inputSchema: {
        id: z.number().int().positive().describe('Deal ID to update (required)'),
        title: z.string().min(1).optional().describe('New deal title'),
        value: z.number().min(0).optional().describe('New deal value'),
        currency: z.string().optional().describe('New currency code (3 letters)'),
        person_id: z.number().int().positive().optional().describe('New contact/person ID'),
        org_id: z.number().int().positive().optional().describe('New organization ID'),
        stage_id: z.number().int().positive().optional().describe('New pipeline stage ID'),
        status: z.enum(['open', 'won', 'lost']).optional().describe('New status'),
        expected_close_date: z.string().optional().describe('New expected close date (YYYY-MM-DD)'),
        lost_reason: z.string().optional().describe('Reason for losing (use with status: "lost")'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as UpdateDealParams;
      try {
        const { id, ...fields } = params;
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) body[key] = value;
        }
        const response = await client.put<Deal>(`/deals/${id}`, body);
        const deal = response.data;
        return {
          content: [{ type: 'text' as const, text: `# Deal #${id} Updated Successfully\n\n${formatDeal(deal)}` }],
          structuredContent: deal,
        };
      } catch (error) {
        return handlePipedriveError(error, `update deal #${params.id}`);
      }
    }
  );

  // ── pipedrive_delete_deal ─────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_delete_deal',
    {
      title: 'Delete Pipedrive Deal',
      description: `Permanently delete a deal from Pipedrive. This action cannot be undone.

Args:
  - id: Deal ID to permanently delete (required).

Returns: Confirmation of deletion.

Warning: This permanently deletes the deal and all its associated data (notes, activities links, etc.).
Consider setting status to "lost" instead if you want to keep the deal history.`,
      inputSchema: {
        id: z.number().int().positive().describe('Deal ID to permanently delete (required)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (raw) => {
      const { id } = raw as DeleteDealParams;
      try {
        await client.delete<{ id: number }>(`/deals/${id}`);
        return {
          content: [{ type: 'text' as const, text: `# Deal Deleted\n\nDeal #${id} has been permanently deleted.` }],
          structuredContent: { deleted: true, id },
        };
      } catch (error) {
        return handlePipedriveError(error, `delete deal #${id}`);
      }
    }
  );

  // ── pipedrive_search_deals ────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_search_deals',
    {
      title: 'Search Pipedrive Deals',
      description: `Search for deals by keyword across title, notes, and custom fields.

Args:
  - term: Search keyword (minimum 2 characters, required).
  - fields: Comma-separated fields to search — options: title, notes, custom_fields.
  - exact_match: If true, requires exact word match. Default: false.
  - limit: Max results (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT}).
  - start: Pagination offset (default: 0).

Returns: Matching deals with relevance score, title, value, status, stage, contact, organization.

Use when: Looking for deals by name or keyword without knowing the exact ID.`,
      inputSchema: {
        term: z.string().min(2).describe('Search keyword — at least 2 characters'),
        fields: z.string().optional().describe('Comma-separated fields to search (title, notes, custom_fields)'),
        exact_match: z.boolean().optional().describe('Require exact word match (default: false)'),
        limit: z.number().optional().describe(`Max results (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`),
        start: z.number().optional().describe('Pagination offset (default: 0)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as SearchDealsParams;
      const limit = params.limit ?? DEFAULT_LIMIT;
      const start = params.start ?? 0;
      try {
        const response = await client.get<SearchData<DealSearchResult>>('/deals/search', {
          term: params.term,
          fields: params.fields,
          exact_match: params.exact_match ? 1 : undefined,
          limit,
          start,
        });
        const items = (response as PipedriveResponse<SearchData<DealSearchResult>>).data?.items ?? [];
        const pagination = response.additional_data?.pagination;
        const structured = {
          results: items.map((i) => ({ score: i.result_score, deal: i.item })),
          count: items.length,
          start,
          has_more: pagination?.more_items_in_collection ?? false,
          next_start: pagination?.next_start,
        };
        let text = `# Deal Search: "${params.term}" (${items.length} result${items.length !== 1 ? 's' : ''})\n\n`;
        if (items.length === 0) {
          text += `_No deals found matching "${params.term}"._\nTry a shorter term or use exact_match: false.`;
        } else {
          for (const { result_score, item } of items) {
            text += `### #${item.id}: ${item.title} _(score: ${result_score.toFixed(2)})_\n`;
            text += `- **Status**: ${item.status} | **Value**: ${item.value} ${item.currency}\n`;
            if (item.stage) text += `- **Stage**: ${item.stage.name} (ID: ${item.stage.id})\n`;
            if (item.person) text += `- **Contact**: ${item.person.name} (ID: ${item.person.id})\n`;
            if (item.organization) text += `- **Organization**: ${item.organization.name} (ID: ${item.organization.id})\n`;
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
        return handlePipedriveError(error, `search deals for "${params.term}"`);
      }
    }
  );
}
