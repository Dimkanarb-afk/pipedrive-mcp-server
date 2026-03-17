"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerOrganizationTools = registerOrganizationTools;
const zod_1 = require("zod");
const pipedrive_1 = require("../pipedrive");
const utils_1 = require("../utils");
const custom_fields_1 = require("../custom-fields");
const constants_1 = require("../constants");
// ─── Formatters ──────────────────────────────────────────────────────────────
function formatOrganization(org) {
    const owner = org.owner_id;
    const lines = [`### Organization #${org.id}: ${org.name}`];
    if (org.address)
        lines.push(`- **Address**: ${org.address}`);
    lines.push(`- **People**: ${org.people_count}`, `- **Deals**: ${org.open_deals_count} open, ${org.closed_deals_count} closed`, `- **Activities**: ${org.activities_count} | **Notes**: ${org.notes_count}`, `- **Owner**: ${owner.name}`, `- **Added**: ${org.add_time} | **Updated**: ${org.update_time}`);
    // Custom fields
    const custom = org.custom_fields;
    if (custom && Object.keys(custom).length > 0) {
        lines.push('- **Custom Fields**:');
        for (const [key, val] of Object.entries(custom)) {
            lines.push(`  - ${key}: ${String(val)}`);
        }
    }
    return lines.join('\n');
}
// ─── Tool Registration ───────────────────────────────────────────────────────
function registerOrganizationTools(server, client) {
    // ── pipedrive_list_organizations ──────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_list_organizations', {
        title: 'List Pipedrive Organizations',
        description: `List organizations (companies/accounts) from Pipedrive CRM.

Args:
  - limit: Max results per page (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT}).
  - start: Pagination offset (default: 0).

Returns: Paginated list of organizations with name, address, people count,
  deal counts, activities, notes, owner.

Use when: Browsing all organizations.
Don't use when: Looking for a specific company by name (use pipedrive_search_organizations).`,
        inputSchema: {
            limit: zod_1.z.number().optional().describe(`Max results (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT})`),
            start: zod_1.z.number().optional().describe('Pagination offset (default: 0)'),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        const limit = params.limit ?? constants_1.DEFAULT_LIMIT;
        const start = params.start ?? 0;
        try {
            const response = await client.get('/organizations', { limit, start });
            const orgs = response.data;
            const pagination = response.additional_data?.pagination;
            const structured = {
                organizations: orgs,
                count: orgs.length,
                start,
                has_more: pagination?.more_items_in_collection ?? false,
                next_start: pagination?.next_start,
            };
            let text = `# Organizations (${orgs.length} result${orgs.length !== 1 ? 's' : ''})\n\n`;
            if (orgs.length === 0)
                text += '_No organizations found._';
            else
                text += orgs.map(formatOrganization).join('\n\n');
            if (structured.has_more)
                text += `\n\n_More results available. Use \`start=${structured.next_start}\` for next page._`;
            return {
                content: [{ type: 'text', text: (0, pipedrive_1.truncateText)(text) }],
                structuredContent: structured,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, 'list organizations');
        }
    });
    // ── pipedrive_get_organization ────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_get_organization', {
        title: 'Get Pipedrive Organization',
        description: `Get full details of a single organization by ID, including resolved custom fields.

Args:
  - id: Organization ID (required).

Returns: Complete organization record with name, address, people count,
  deal history, activities, notes, owner, timestamps, and custom fields.`,
        inputSchema: { id: zod_1.z.number().int().positive().describe('Organization ID to retrieve') },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (raw) => {
        const { id } = raw;
        try {
            const response = await client.get(`/organizations/${id}`);
            const rawOrg = response.data;
            const org = await (0, custom_fields_1.resolveCustomFields)(client, rawOrg, 'organization');
            return {
                content: [{ type: 'text', text: `# Organization #${org.id}\n\n${formatOrganization(org)}` }],
                structuredContent: org,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `get organization #${id}`);
        }
    });
    // ── pipedrive_create_organization ─────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_create_organization', {
        title: 'Create Pipedrive Organization',
        description: `Create a new organization (company/account) in Pipedrive CRM.

Args:
  - name: Organization name (required).
  - address: Full address of the organization.

Returns: The newly created organization object with assigned ID.

Note: Search first with pipedrive_search_organizations to avoid duplicates.`,
        inputSchema: {
            name: zod_1.z.string().min(1).describe('Organization name (required)'),
            address: zod_1.z.string().optional().describe('Full address (street, city, country)'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        try {
            const body = { name: params.name };
            if (params.address)
                body.address = params.address;
            const response = await client.post('/organizations', body);
            const org = response.data;
            return {
                content: [{ type: 'text', text: `# Organization Created Successfully\n\n${formatOrganization(org)}` }],
                structuredContent: org,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, 'create organization');
        }
    });
    // ── pipedrive_delete_organization ─────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_delete_organization', {
        title: 'Delete Pipedrive Organization',
        description: `Permanently delete an organization from Pipedrive. This action cannot be undone.

Args:
  - id: Organization ID to permanently delete (required).

Returns: Confirmation of deletion.

Warning: This permanently deletes the organization. Associated persons and deals are NOT
deleted but will be unlinked from the organization. Consider merging duplicates instead.`,
        inputSchema: {
            id: zod_1.z.number().int().positive().describe('Organization ID to permanently delete (required)'),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    }, async (raw) => {
        const { id } = raw;
        try {
            await client.delete(`/organizations/${id}`);
            return {
                content: [{ type: 'text', text: `# Organization Deleted\n\nOrganization #${id} has been permanently deleted.` }],
                structuredContent: { deleted: true, id },
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `delete organization #${id}`);
        }
    });
    // ── pipedrive_search_organizations ───────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_search_organizations', {
        title: 'Search Pipedrive Organizations',
        description: `Search for organizations (companies) by name or address.

Args:
  - term: Search keyword (minimum 2 characters, required).
  - fields: Comma-separated fields to search — options: name, address, notes, custom_fields.
  - exact_match: Require exact word match (default: false).
  - limit: Max results (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT}).
  - start: Pagination offset.

Returns: Matching organizations with relevance score, name, address, owner.`,
        inputSchema: {
            term: zod_1.z.string().min(2).describe('Search keyword — company name or address (min 2 chars)'),
            fields: zod_1.z.string().optional().describe('Comma-separated fields (name, address, notes, custom_fields)'),
            exact_match: zod_1.z.boolean().optional().describe('Require exact match (default: false)'),
            limit: zod_1.z.number().optional().describe(`Max results (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT})`),
            start: zod_1.z.number().optional().describe('Pagination offset (default: 0)'),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        const limit = params.limit ?? constants_1.DEFAULT_LIMIT;
        const start = params.start ?? 0;
        try {
            const response = await client.get('/organizations/search', {
                term: params.term,
                fields: params.fields,
                exact_match: params.exact_match ? 1 : undefined,
                limit,
                start,
            });
            const items = response.data?.items ?? [];
            const pagination = response.additional_data?.pagination;
            const structured = {
                results: items.map((i) => ({ score: i.result_score, organization: i.item })),
                count: items.length,
                start,
                has_more: pagination?.more_items_in_collection ?? false,
                next_start: pagination?.next_start,
            };
            let text = `# Organization Search: "${params.term}" (${items.length} result${items.length !== 1 ? 's' : ''})\n\n`;
            if (items.length === 0) {
                text += `_No organizations found matching "${params.term}"._`;
            }
            else {
                for (const { result_score, item } of items) {
                    text += `### #${item.id}: ${item.name} _(score: ${result_score.toFixed(2)})_\n`;
                    if (item.address)
                        text += `- **Address**: ${item.address}\n`;
                    text += `- **Owner ID**: ${item.owner.id}\n\n`;
                }
            }
            if (structured.has_more)
                text += `_More results available. Use \`start=${structured.next_start}\` for next page._`;
            return {
                content: [{ type: 'text', text: (0, pipedrive_1.truncateText)(text) }],
                structuredContent: structured,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `search organizations for "${params.term}"`);
        }
    });
}
//# sourceMappingURL=organizations.js.map