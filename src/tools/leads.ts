import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { PipedriveClient, handlePipedriveError, truncateText } from '../pipedrive';
import { registerTool } from '../utils';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadValue {
  amount: number;
  currency: string;
}

interface Lead {
  [key: string]: unknown;
  id: string;
  title: string;
  owner_id: number;
  creator_id: number;
  label_ids: string[];
  person_id: number | null;
  organization_id: number | null;
  source_name: string | null;
  is_archived: boolean;
  was_seen: boolean;
  value: LeadValue | null;
  expected_close_date: string | null;
  next_activity_id: number | null;
  add_time: string;
  update_time: string;
}

interface LeadLabel {
  [key: string]: unknown;
  id: string;
  name: string;
  color: string;
  add_time: string;
  update_time: string;
}

interface LeadSource {
  [key: string]: unknown;
  name: string;
}

interface LeadSearchResult {
  [key: string]: unknown;
  id: string;
  type: string;
  title: string;
  owner: { id: number };
  person: { id: number; name: string } | null;
  organization: { id: number; name: string } | null;
}

type ListLeadsParams = {
  limit: number;
  start: number;
  archived_status?: 'archived' | 'not_archived' | 'all';
  owner_id?: number;
  person_id?: number;
  organization_id?: number;
};

type GetLeadParams = { id: string };

type CreateLeadParams = {
  title: string;
  owner_id?: number;
  label_ids?: string[];
  person_id?: number;
  organization_id?: number;
  value?: number;
  currency?: string;
  expected_close_date?: string;
};

type UpdateLeadParams = {
  id: string;
  title?: string;
  owner_id?: number;
  label_ids?: string[];
  person_id?: number;
  organization_id?: number;
  value?: number;
  currency?: string;
  expected_close_date?: string;
  is_archived?: boolean;
};

type DeleteLeadParams = { id: string };
type SearchLeadsParams = { term: string; limit: number; start: number };

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatLead(lead: Lead): string {
  const lines: string[] = [
    `### Lead: ${lead.title}`,
    `- **ID**: ${lead.id}`,
    `- **Owner ID**: ${lead.owner_id}`,
  ];
  if (lead.value) {
    lines.push(`- **Value**: ${lead.value.amount} ${lead.value.currency}`);
  }
  if (lead.person_id) lines.push(`- **Person ID**: ${lead.person_id}`);
  if (lead.organization_id) lines.push(`- **Organization ID**: ${lead.organization_id}`);
  if (lead.source_name) lines.push(`- **Source**: ${lead.source_name}`);
  if (lead.label_ids?.length) lines.push(`- **Labels**: ${lead.label_ids.join(', ')}`);
  if (lead.expected_close_date) lines.push(`- **Expected Close**: ${lead.expected_close_date}`);
  lines.push(
    `- **Archived**: ${lead.is_archived ? 'Yes' : 'No'}`,
    `- **Added**: ${lead.add_time} | **Updated**: ${lead.update_time}`
  );
  return lines.join('\n');
}

// ─── Tool Registration ────────────────────────────────────────────────────────

export function registerLeadTools(server: McpServer, client: PipedriveClient): void {
  // ── pipedrive_list_leads ──────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_list_leads',
    {
      title: 'List Pipedrive Leads',
      description: `List leads from Pipedrive CRM with optional filters.

Leads are potential deals not yet in a pipeline. They represent early-stage opportunities.

Args:
  - limit: Max results per page (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT}).
  - start: Pagination offset (default: 0).
  - archived_status: Filter by archive status — archived, not_archived (default), or all.
  - owner_id: Filter leads by owner user ID.
  - person_id: Filter leads linked to a specific person/contact ID.
  - organization_id: Filter leads linked to a specific organization ID.

Returns: Paginated list of leads with title, value, owner, linked contacts/orgs, labels, dates.

Use when: Reviewing leads pipeline, finding unworked opportunities, checking lead ownership.
Don't use when: Searching for a lead by keyword (use pipedrive_search_leads).`,
      inputSchema: {
        limit: z.number().optional().describe(`Max results (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`),
        start: z.number().optional().describe('Pagination offset (default: 0)'),
        archived_status: z
          .enum(['archived', 'not_archived', 'all'])
          .optional()
          .describe('Filter by archive status. Default: not_archived'),
        owner_id: z.number().int().positive().optional().describe('Filter by owner user ID'),
        person_id: z.number().int().positive().optional().describe('Filter by linked person/contact ID'),
        organization_id: z.number().int().positive().optional().describe('Filter by linked organization ID'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as ListLeadsParams;
      const limit = params.limit ?? DEFAULT_LIMIT;
      const start = params.start ?? 0;
      try {
        const queryParams: Record<string, string | number | boolean | undefined | null> = { limit, start };
        if (params.archived_status) queryParams.archived_status = params.archived_status;
        if (params.owner_id) queryParams.owner_id = params.owner_id;
        if (params.person_id) queryParams.person_id = params.person_id;
        if (params.organization_id) queryParams.organization_id = params.organization_id;

        const response = await client.get<Lead[]>('/leads', queryParams);
        const leads = response.data ?? [];
        const pagination = response.additional_data?.pagination;
        const structured = {
          leads,
          count: leads.length,
          start,
          has_more: pagination?.more_items_in_collection ?? false,
          next_start: pagination?.next_start,
        };
        let text = `# Leads (${leads.length} result${leads.length !== 1 ? 's' : ''})\n\n`;
        if (leads.length === 0) text += '_No leads found matching the given filters._';
        else text += leads.map(formatLead).join('\n\n');
        if (structured.has_more) {
          text += `\n\n_More results available. Use \`start=${structured.next_start}\` for next page._`;
        }
        return {
          content: [{ type: 'text' as const, text: truncateText(text) }],
          structuredContent: structured,
        };
      } catch (error) {
        return handlePipedriveError(error, 'list leads');
      }
    }
  );

  // ── pipedrive_get_lead ────────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_get_lead',
    {
      title: 'Get Pipedrive Lead',
      description: `Get full details of a single lead by its UUID.

Args:
  - id: The lead UUID (required). Lead IDs are UUID strings, not integers.

Returns: Complete lead object including title, value, owner, linked person/organization,
  source, labels, archived status, expected close date, timestamps.

Use when: You have a specific lead ID and need full details.
Don't use when: You don't know the ID (use pipedrive_search_leads or pipedrive_list_leads).`,
      inputSchema: {
        id: z.string().uuid().describe('Lead UUID to retrieve (e.g. "adf21080-0e10-11eb-879b-05d71fb426ec")'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (raw) => {
      const { id } = raw as GetLeadParams;
      try {
        const response = await client.get<Lead>(`/leads/${id}`);
        const lead = response.data;
        return {
          content: [{ type: 'text' as const, text: `# Lead: ${lead.title}\n\n${formatLead(lead)}` }],
          structuredContent: lead,
        };
      } catch (error) {
        return handlePipedriveError(error, `get lead ${id}`);
      }
    }
  );

  // ── pipedrive_create_lead ─────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_create_lead',
    {
      title: 'Create Pipedrive Lead',
      description: `Create a new lead in Pipedrive CRM.

Leads are unqualified opportunities that haven't been added to a pipeline yet.
Once qualified, convert a lead to a deal using the Pipedrive UI or update tools.

Args:
  - title: Lead title/name (required).
  - owner_id: User ID of the lead owner. Defaults to the authenticated user.
  - label_ids: Array of lead label UUIDs. Get labels via pipedrive_get_lead_labels.
  - person_id: Link to an existing contact/person by ID.
  - organization_id: Link to an existing organization by ID.
  - value: Monetary value estimate for the lead.
  - currency: 3-letter currency code (e.g. USD, EUR). Default: USD.
  - expected_close_date: Expected close date in YYYY-MM-DD format.

Returns: The newly created lead with assigned UUID.`,
      inputSchema: {
        title: z.string().min(1).describe('Lead title/name (required)'),
        owner_id: z.number().int().positive().optional().describe('Owner user ID. Defaults to authenticated user'),
        label_ids: z.array(z.string()).optional().describe('Array of lead label UUIDs. Get labels with pipedrive_get_lead_labels'),
        person_id: z.number().int().positive().optional().describe('Link to an existing person/contact ID'),
        organization_id: z.number().int().positive().optional().describe('Link to an existing organization ID'),
        value: z.number().min(0).optional().describe('Monetary value estimate'),
        currency: z.string().length(3).optional().describe('Currency code (3 letters, e.g. USD, EUR). Default: USD'),
        expected_close_date: z.string().optional().describe('Expected close date (YYYY-MM-DD)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as CreateLeadParams;
      try {
        const body: Record<string, unknown> = { title: params.title };
        if (params.owner_id) body.owner_id = params.owner_id;
        if (params.label_ids?.length) body.label_ids = params.label_ids;
        if (params.person_id) body.person_id = params.person_id;
        if (params.organization_id) body.organization_id = params.organization_id;
        if (params.value !== undefined) {
          body.value = { amount: params.value, currency: params.currency ?? 'USD' };
        }
        if (params.expected_close_date) body.expected_close_date = params.expected_close_date;

        const response = await client.post<Lead>('/leads', body);
        const lead = response.data;
        return {
          content: [{ type: 'text' as const, text: `# Lead Created Successfully\n\n${formatLead(lead)}` }],
          structuredContent: lead,
        };
      } catch (error) {
        return handlePipedriveError(error, 'create lead');
      }
    }
  );

  // ── pipedrive_update_lead ─────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_update_lead',
    {
      title: 'Update Pipedrive Lead',
      description: `Update fields of an existing lead. Only provided fields are changed.

Args:
  - id: Lead UUID to update (required).
  - title: New lead title.
  - owner_id: New owner user ID.
  - label_ids: Replace all label associations with this new array of label UUIDs.
  - person_id: New linked person/contact ID.
  - organization_id: New linked organization ID.
  - value: New monetary value estimate.
  - currency: New currency code (3 letters).
  - expected_close_date: New expected close date (YYYY-MM-DD).
  - is_archived: Set to true to archive this lead, false to unarchive.

Returns: Updated lead object.`,
      inputSchema: {
        id: z.string().describe('Lead UUID to update (required)'),
        title: z.string().min(1).optional().describe('New lead title'),
        owner_id: z.number().int().positive().optional().describe('New owner user ID'),
        label_ids: z.array(z.string()).optional().describe('New label UUID array (replaces existing labels)'),
        person_id: z.number().int().positive().optional().describe('New linked person/contact ID'),
        organization_id: z.number().int().positive().optional().describe('New linked organization ID'),
        value: z.number().min(0).optional().describe('New monetary value estimate'),
        currency: z.string().length(3).optional().describe('New currency code (3 letters)'),
        expected_close_date: z.string().optional().describe('New expected close date (YYYY-MM-DD)'),
        is_archived: z.boolean().optional().describe('Archive (true) or unarchive (false) this lead'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as UpdateLeadParams;
      try {
        const { id, value, currency, ...rest } = params;
        const body: Record<string, unknown> = {};
        if (rest.title !== undefined) body.title = rest.title;
        if (rest.owner_id !== undefined) body.owner_id = rest.owner_id;
        if (rest.label_ids !== undefined) body.label_ids = rest.label_ids;
        if (rest.person_id !== undefined) body.person_id = rest.person_id;
        if (rest.organization_id !== undefined) body.organization_id = rest.organization_id;
        if (rest.expected_close_date !== undefined) body.expected_close_date = rest.expected_close_date;
        if (rest.is_archived !== undefined) body.is_archived = rest.is_archived;
        if (value !== undefined) {
          body.value = { amount: value, currency: currency ?? 'USD' };
        }

        const response = await client.patch<Lead>(`/leads/${id}`, body);
        const lead = response.data;
        return {
          content: [{ type: 'text' as const, text: `# Lead Updated Successfully\n\n${formatLead(lead)}` }],
          structuredContent: lead,
        };
      } catch (error) {
        return handlePipedriveError(error, `update lead ${params.id}`);
      }
    }
  );

  // ── pipedrive_delete_lead ─────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_delete_lead',
    {
      title: 'Delete Pipedrive Lead',
      description: `Permanently delete a lead from Pipedrive. This action cannot be undone.

Args:
  - id: Lead UUID to delete (required).

Returns: Confirmation of deletion with the lead ID.

Warning: This permanently deletes the lead. Consider archiving (via pipedrive_update_lead
  with is_archived: true) if you may need the data later.`,
      inputSchema: {
        id: z.string().describe('Lead UUID to permanently delete (required)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (raw) => {
      const { id } = raw as DeleteLeadParams;
      try {
        await client.delete<{ id: string }>(`/leads/${id}`);
        return {
          content: [{ type: 'text' as const, text: `# Lead Deleted\n\nLead \`${id}\` has been permanently deleted.` }],
          structuredContent: { deleted: true, id },
        };
      } catch (error) {
        return handlePipedriveError(error, `delete lead ${id}`);
      }
    }
  );

  // ── pipedrive_search_leads ────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_search_leads',
    {
      title: 'Search Pipedrive Leads',
      description: `Search for leads by keyword across title and associated contacts/organizations.

Args:
  - term: Search keyword (minimum 2 characters, required).
  - limit: Max results (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT}).
  - start: Pagination offset (default: 0).

Returns: Matching leads with title, owner, linked contacts/organizations.

Use when: Looking for a lead by name or associated entity without knowing the exact ID.`,
      inputSchema: {
        term: z.string().min(2).describe('Search keyword — at least 2 characters (required)'),
        limit: z.number().optional().describe(`Max results (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`),
        start: z.number().optional().describe('Pagination offset (default: 0)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as SearchLeadsParams;
      const limit = params.limit ?? DEFAULT_LIMIT;
      const start = params.start ?? 0;
      try {
        const response = await client.get<{ items: Array<{ result_score: number; item: LeadSearchResult }> }>(
          '/leads/search',
          { term: params.term, limit, start }
        );
        const items = response.data?.items ?? [];
        const pagination = response.additional_data?.pagination;
        const structured = {
          results: items.map((i) => ({ score: i.result_score, lead: i.item })),
          count: items.length,
          start,
          has_more: pagination?.more_items_in_collection ?? false,
          next_start: pagination?.next_start,
        };

        let text = `# Lead Search: "${params.term}" (${items.length} result${items.length !== 1 ? 's' : ''})\n\n`;
        if (items.length === 0) {
          text += `_No leads found matching "${params.term}"._\nTry a shorter term or different keyword.`;
        } else {
          for (const { result_score, item } of items) {
            text += `### ${item.title} _(score: ${result_score.toFixed(2)})_\n`;
            text += `- **ID**: ${item.id}\n`;
            if (item.person) text += `- **Person**: ${item.person.name} (ID: ${item.person.id})\n`;
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
        return handlePipedriveError(error, `search leads for "${params.term}"`);
      }
    }
  );

  // ── pipedrive_get_lead_labels ─────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_get_lead_labels',
    {
      title: 'Get Pipedrive Lead Labels',
      description: `List all available lead labels configured in Pipedrive.

Lead labels are tags used to categorize and filter leads (e.g. "Hot", "Cold", "Qualified").

Returns: All lead labels with UUID, name, color, and timestamps.

Use when: You need label IDs before creating or updating leads with label_ids.
Also useful for understanding how leads are categorized in the account.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const response = await client.get<LeadLabel[]>('/leadLabels');
        const labels = response.data ?? [];
        const structured = { labels, count: labels.length };

        let text = `# Lead Labels (${labels.length})\n\n`;
        if (labels.length === 0) text += '_No lead labels configured._';
        else {
          for (const label of labels) {
            text += `### ${label.name}\n`;
            text += `- **ID**: ${label.id}\n`;
            text += `- **Color**: ${label.color}\n\n`;
          }
        }
        return {
          content: [{ type: 'text' as const, text }],
          structuredContent: structured,
        };
      } catch (error) {
        return handlePipedriveError(error, 'get lead labels');
      }
    }
  );

  // ── pipedrive_get_lead_sources ────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_get_lead_sources',
    {
      title: 'Get Pipedrive Lead Sources',
      description: `List all available lead sources configured in Pipedrive.

Lead sources track where a lead originated (e.g. "Website", "Referral", "Cold Call").

Returns: All lead source names.

Use when: You want to understand what lead source values are available,
or to filter/report on leads by their origin channel.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const response = await client.get<LeadSource[]>('/leadSources');
        const sources = response.data ?? [];
        const structured = { sources, count: sources.length };

        let text = `# Lead Sources (${sources.length})\n\n`;
        if (sources.length === 0) text += '_No lead sources configured._';
        else {
          text += sources.map((s) => `- ${s.name}`).join('\n');
        }
        return {
          content: [{ type: 'text' as const, text }],
          structuredContent: structured,
        };
      } catch (error) {
        return handlePipedriveError(error, 'get lead sources');
      }
    }
  );
}
