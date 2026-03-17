"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDealTools = registerDealTools;
const zod_1 = require("zod");
const pipedrive_1 = require("../pipedrive");
const utils_1 = require("../utils");
const custom_fields_1 = require("../custom-fields");
const constants_1 = require("../constants");
// ─── Formatters ──────────────────────────────────────────────────────────────
function formatDeal(deal) {
    const lines = [
        `### Deal #${deal.id}: ${deal.title}`,
        `- **Status**: ${deal.status}`,
        `- **Value**: ${deal.value ?? 0} ${deal.currency}`,
        `- **Stage ID**: ${deal.stage_id} | **Pipeline ID**: ${deal.pipeline_id}`,
    ];
    const person = deal.person_id;
    const org = deal.org_id;
    const owner = deal.user_id;
    if (person)
        lines.push(`- **Contact**: ${person.name} (ID: ${person.value})`);
    if (org)
        lines.push(`- **Organization**: ${org.name} (ID: ${org.value})`);
    if (deal.expected_close_date)
        lines.push(`- **Expected Close**: ${deal.expected_close_date}`);
    if (deal.lost_reason)
        lines.push(`- **Lost Reason**: ${deal.lost_reason}`);
    lines.push(`- **Activities**: ${deal.activities_count} | **Notes**: ${deal.notes_count}`, `- **Owner**: ${owner.name}`, `- **Added**: ${deal.add_time} | **Updated**: ${deal.update_time}`);
    // Custom fields
    const custom = deal.custom_fields;
    if (custom && Object.keys(custom).length > 0) {
        lines.push('- **Custom Fields**:');
        for (const [key, val] of Object.entries(custom)) {
            lines.push(`  - ${key}: ${String(val)}`);
        }
    }
    return lines.join('\n');
}
// ─── Tool Registration ───────────────────────────────────────────────────────
function registerDealTools(server, client) {
    // ── pipedrive_list_deals ──────────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_list_deals', {
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
  - limit: Max results per page (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT}).
  - start: Pagination offset (default: 0).

Returns: List of deals with title, value, status, stage, contact, organization, owner, dates.
  Includes has_more and next_start for pagination.

Use when: Browsing deals, finding deals by status/stage/pipeline, reviewing pipeline.
Don't use when: Searching for a specific deal by keyword (use pipedrive_search_deals).`,
        inputSchema: {
            limit: zod_1.z.number().optional().describe(`Max results (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT})`),
            start: zod_1.z.number().optional().describe('Pagination offset (default: 0)'),
            status: zod_1.z
                .enum(['open', 'won', 'lost', 'deleted', 'all_not_deleted'])
                .optional()
                .describe('Filter by deal status'),
            stage_id: zod_1.z.number().int().positive().optional().describe('Filter to a specific pipeline stage ID'),
            user_id: zod_1.z.number().int().positive().optional().describe('Filter by deal owner user ID'),
            pipeline_id: zod_1.z.number().int().positive().optional().describe('Filter to deals in this pipeline ID'),
            search_title: zod_1.z.string().optional().describe('Filter deals whose title contains this string'),
            days_back: zod_1.z.number().int().positive().optional().describe('Return only deals from the last N days'),
            min_value: zod_1.z.number().optional().describe('Return only deals with value >= this amount'),
            max_value: zod_1.z.number().optional().describe('Return only deals with value <= this amount'),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        const limit = params.limit ?? constants_1.DEFAULT_LIMIT;
        const start = params.start ?? 0;
        try {
            const queryParams = {
                status: params.status,
                stage_id: params.stage_id,
                user_id: params.user_id,
                pipeline_id: params.pipeline_id,
                limit,
                start,
            };
            const response = await client.get('/deals', queryParams);
            let deals = response.data;
            const pagination = response.additional_data?.pagination;
            // Client-side advanced filters (Pipedrive API doesn't support these natively)
            if (params.search_title) {
                const term = params.search_title.toLowerCase();
                deals = deals.filter((d) => d.title.toLowerCase().includes(term));
            }
            if (params.days_back) {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - params.days_back);
                deals = deals.filter((d) => new Date(d.update_time) >= cutoff);
            }
            if (params.min_value !== undefined) {
                deals = deals.filter((d) => (d.value ?? 0) >= params.min_value);
            }
            if (params.max_value !== undefined) {
                deals = deals.filter((d) => (d.value ?? 0) <= params.max_value);
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
            }
            else {
                text += deals.map(formatDeal).join('\n\n');
            }
            if (structured.has_more) {
                text += `\n\n_More results available. Use \`start=${structured.next_start}\` for next page._`;
            }
            return {
                content: [{ type: 'text', text: (0, pipedrive_1.truncateText)(text) }],
                structuredContent: structured,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, 'list deals');
        }
    });
    // ── pipedrive_get_deal ────────────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_get_deal', {
        title: 'Get Pipedrive Deal',
        description: `Get full details of a single deal by its ID, including resolved custom fields.

Args:
  - id: The deal ID (required).

Returns: Complete deal object including title, value, currency, status, stage, pipeline,
  contact, organization, owner, expected close date, activities count, notes count,
  timestamps, and any custom fields resolved to human-readable names.

Use when: You have a specific deal ID and need full details.
Don't use when: You don't know the ID (use pipedrive_search_deals or pipedrive_list_deals first).`,
        inputSchema: { id: zod_1.z.number().int().positive().describe('Deal ID to retrieve') },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (raw) => {
        const { id } = raw;
        try {
            const response = await client.get(`/deals/${id}`);
            const rawDeal = response.data;
            const deal = await (0, custom_fields_1.resolveCustomFields)(client, rawDeal, 'deal');
            return {
                content: [{ type: 'text', text: `# Deal #${deal.id}\n\n${formatDeal(deal)}` }],
                structuredContent: deal,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `get deal #${id}`);
        }
    });
    // ── pipedrive_create_deal ─────────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_create_deal', {
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
            title: zod_1.z.string().min(1).describe('Deal title/name (required)'),
            value: zod_1.z.number().min(0).optional().describe('Deal monetary value'),
            currency: zod_1.z.string().optional().describe('Currency code — 3 letters (e.g. USD, EUR). Default: USD'),
            person_id: zod_1.z.number().int().positive().optional().describe('Person/contact ID to associate'),
            org_id: zod_1.z.number().int().positive().optional().describe('Organization ID to associate'),
            stage_id: zod_1.z.number().int().positive().optional().describe('Pipeline stage ID'),
            status: zod_1.z.enum(['open', 'won', 'lost']).optional().describe('Deal status. Default: open'),
            expected_close_date: zod_1.z.string().optional().describe('Expected close date (YYYY-MM-DD)'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        try {
            const body = { title: params.title };
            if (params.value !== undefined)
                body.value = params.value;
            body.currency = params.currency ?? 'USD';
            if (params.person_id)
                body.person_id = params.person_id;
            if (params.org_id)
                body.org_id = params.org_id;
            if (params.stage_id)
                body.stage_id = params.stage_id;
            body.status = params.status ?? 'open';
            if (params.expected_close_date)
                body.expected_close_date = params.expected_close_date;
            const response = await client.post('/deals', body);
            const deal = response.data;
            return {
                content: [{ type: 'text', text: `# Deal Created Successfully\n\n${formatDeal(deal)}` }],
                structuredContent: deal,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, 'create deal');
        }
    });
    // ── pipedrive_update_deal ─────────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_update_deal', {
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
            id: zod_1.z.number().int().positive().describe('Deal ID to update (required)'),
            title: zod_1.z.string().min(1).optional().describe('New deal title'),
            value: zod_1.z.number().min(0).optional().describe('New deal value'),
            currency: zod_1.z.string().optional().describe('New currency code (3 letters)'),
            person_id: zod_1.z.number().int().positive().optional().describe('New contact/person ID'),
            org_id: zod_1.z.number().int().positive().optional().describe('New organization ID'),
            stage_id: zod_1.z.number().int().positive().optional().describe('New pipeline stage ID'),
            status: zod_1.z.enum(['open', 'won', 'lost']).optional().describe('New status'),
            expected_close_date: zod_1.z.string().optional().describe('New expected close date (YYYY-MM-DD)'),
            lost_reason: zod_1.z.string().optional().describe('Reason for losing (use with status: "lost")'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        try {
            const { id, ...fields } = params;
            const body = {};
            for (const [key, value] of Object.entries(fields)) {
                if (value !== undefined)
                    body[key] = value;
            }
            const response = await client.put(`/deals/${id}`, body);
            const deal = response.data;
            return {
                content: [{ type: 'text', text: `# Deal #${id} Updated Successfully\n\n${formatDeal(deal)}` }],
                structuredContent: deal,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `update deal #${params.id}`);
        }
    });
    // ── pipedrive_delete_deal ─────────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_delete_deal', {
        title: 'Delete Pipedrive Deal',
        description: `Permanently delete a deal from Pipedrive. This action cannot be undone.

Args:
  - id: Deal ID to permanently delete (required).

Returns: Confirmation of deletion.

Warning: This permanently deletes the deal and all its associated data (notes, activities links, etc.).
Consider setting status to "lost" instead if you want to keep the deal history.`,
        inputSchema: {
            id: zod_1.z.number().int().positive().describe('Deal ID to permanently delete (required)'),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    }, async (raw) => {
        const { id } = raw;
        try {
            await client.delete(`/deals/${id}`);
            return {
                content: [{ type: 'text', text: `# Deal Deleted\n\nDeal #${id} has been permanently deleted.` }],
                structuredContent: { deleted: true, id },
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `delete deal #${id}`);
        }
    });
    // ── pipedrive_search_deals ────────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_search_deals', {
        title: 'Search Pipedrive Deals',
        description: `Search for deals by keyword across title, notes, and custom fields.

Args:
  - term: Search keyword (minimum 2 characters, required).
  - fields: Comma-separated fields to search — options: title, notes, custom_fields.
  - exact_match: If true, requires exact word match. Default: false.
  - limit: Max results (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT}).
  - start: Pagination offset (default: 0).

Returns: Matching deals with relevance score, title, value, status, stage, contact, organization.

Use when: Looking for deals by name or keyword without knowing the exact ID.`,
        inputSchema: {
            term: zod_1.z.string().min(2).describe('Search keyword — at least 2 characters'),
            fields: zod_1.z.string().optional().describe('Comma-separated fields to search (title, notes, custom_fields)'),
            exact_match: zod_1.z.boolean().optional().describe('Require exact word match (default: false)'),
            limit: zod_1.z.number().optional().describe(`Max results (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT})`),
            start: zod_1.z.number().optional().describe('Pagination offset (default: 0)'),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        const limit = params.limit ?? constants_1.DEFAULT_LIMIT;
        const start = params.start ?? 0;
        try {
            const response = await client.get('/deals/search', {
                term: params.term,
                fields: params.fields,
                exact_match: params.exact_match ? 1 : undefined,
                limit,
                start,
            });
            const items = response.data?.items ?? [];
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
            }
            else {
                for (const { result_score, item } of items) {
                    text += `### #${item.id}: ${item.title} _(score: ${result_score.toFixed(2)})_\n`;
                    text += `- **Status**: ${item.status} | **Value**: ${item.value} ${item.currency}\n`;
                    if (item.stage)
                        text += `- **Stage**: ${item.stage.name} (ID: ${item.stage.id})\n`;
                    if (item.person)
                        text += `- **Contact**: ${item.person.name} (ID: ${item.person.id})\n`;
                    if (item.organization)
                        text += `- **Organization**: ${item.organization.name} (ID: ${item.organization.id})\n`;
                    text += '\n';
                }
            }
            if (structured.has_more) {
                text += `_More results available. Use \`start=${structured.next_start}\` for next page._`;
            }
            return {
                content: [{ type: 'text', text: (0, pipedrive_1.truncateText)(text) }],
                structuredContent: structured,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `search deals for "${params.term}"`);
        }
    });
}
//# sourceMappingURL=deals.js.map