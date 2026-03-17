"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPersonTools = registerPersonTools;
const zod_1 = require("zod");
const pipedrive_1 = require("../pipedrive");
const utils_1 = require("../utils");
const custom_fields_1 = require("../custom-fields");
const constants_1 = require("../constants");
// ─── Formatters ──────────────────────────────────────────────────────────────
function formatPerson(person) {
    const emails = person.email;
    const phones = person.phone;
    const org = person.org_id;
    const owner = person.owner_id;
    const primaryEmail = emails.find((e) => e.primary)?.value ?? emails[0]?.value ?? '—';
    const primaryPhone = phones.find((p) => p.primary)?.value ?? phones[0]?.value ?? '—';
    const lines = [
        `### Person #${person.id}: ${person.name}`,
        `- **Email**: ${primaryEmail}`,
        `- **Phone**: ${primaryPhone}`,
    ];
    if (emails.length > 1)
        lines.push(`- **All Emails**: ${emails.map((e) => e.value).join(', ')}`);
    if (phones.length > 1)
        lines.push(`- **All Phones**: ${phones.map((p) => p.value).join(', ')}`);
    if (org)
        lines.push(`- **Organization**: ${org.name} (ID: ${org.value})`);
    lines.push(`- **Deals**: ${person.open_deals_count} open, ${person.won_deals_count} won, ${person.lost_deals_count} lost`, `- **Owner**: ${owner.name}`, `- **Added**: ${person.add_time} | **Updated**: ${person.update_time}`);
    // Custom fields
    const custom = person.custom_fields;
    if (custom && Object.keys(custom).length > 0) {
        lines.push('- **Custom Fields**:');
        for (const [key, val] of Object.entries(custom)) {
            lines.push(`  - ${key}: ${String(val)}`);
        }
    }
    return lines.join('\n');
}
// ─── Tool Registration ───────────────────────────────────────────────────────
function registerPersonTools(server, client) {
    // ── pipedrive_list_persons ────────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_list_persons', {
        title: 'List Pipedrive Contacts',
        description: `List contacts (persons) from Pipedrive CRM.

Args:
  - limit: Max results per page (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT}).
  - start: Pagination offset (default: 0).

Returns: Paginated list of contacts with name, emails, phones, organization, deal counts, owner.

Use when: Browsing all contacts.
Don't use when: Looking for a specific contact (use pipedrive_search_persons).`,
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
            const response = await client.get('/persons', { limit, start });
            const persons = response.data;
            const pagination = response.additional_data?.pagination;
            const structured = {
                persons,
                count: persons.length,
                start,
                has_more: pagination?.more_items_in_collection ?? false,
                next_start: pagination?.next_start,
            };
            let text = `# Contacts (${persons.length} result${persons.length !== 1 ? 's' : ''})\n\n`;
            if (persons.length === 0)
                text += '_No contacts found._';
            else
                text += persons.map(formatPerson).join('\n\n');
            if (structured.has_more)
                text += `\n\n_More results available. Use \`start=${structured.next_start}\` for next page._`;
            return {
                content: [{ type: 'text', text: (0, pipedrive_1.truncateText)(text) }],
                structuredContent: structured,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, 'list persons');
        }
    });
    // ── pipedrive_get_person ──────────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_get_person', {
        title: 'Get Pipedrive Contact',
        description: `Get full details of a single contact (person) by ID, including resolved custom fields.

Args:
  - id: Person ID (required).

Returns: Complete contact record with name, emails, phones, organization,
  deal history, activities, notes count, owner, timestamps, and custom fields.`,
        inputSchema: { id: zod_1.z.number().int().positive().describe('Person ID to retrieve') },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (raw) => {
        const { id } = raw;
        try {
            const response = await client.get(`/persons/${id}`);
            const rawPerson = response.data;
            const person = await (0, custom_fields_1.resolveCustomFields)(client, rawPerson, 'person');
            return {
                content: [{ type: 'text', text: `# Contact #${person.id}\n\n${formatPerson(person)}` }],
                structuredContent: person,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `get person #${id}`);
        }
    });
    // ── pipedrive_create_person ───────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_create_person', {
        title: 'Create Pipedrive Contact',
        description: `Create a new contact (person) in Pipedrive CRM.

Args:
  - name: Full name of the contact (required).
  - email: Array of email addresses (e.g. ["john@example.com"]).
  - phone: Array of phone numbers (e.g. ["+1-555-0100"]).
  - org_id: Organization ID to associate this contact with.

Returns: The newly created contact object with assigned ID.

Note: Search first with pipedrive_search_persons to avoid duplicates.`,
        inputSchema: {
            name: zod_1.z.string().min(1).describe('Contact full name (required)'),
            email: zod_1.z.array(zod_1.z.string()).optional().describe('Email addresses'),
            phone: zod_1.z.array(zod_1.z.string()).optional().describe('Phone numbers'),
            org_id: zod_1.z.number().int().positive().optional().describe('Organization ID'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        try {
            const body = { name: params.name };
            if (params.email?.length)
                body.email = params.email.map((e, i) => ({ value: e, primary: i === 0, label: 'work' }));
            if (params.phone?.length)
                body.phone = params.phone.map((p, i) => ({ value: p, primary: i === 0, label: 'work' }));
            if (params.org_id)
                body.org_id = params.org_id;
            const response = await client.post('/persons', body);
            const person = response.data;
            return {
                content: [{ type: 'text', text: `# Contact Created Successfully\n\n${formatPerson(person)}` }],
                structuredContent: person,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, 'create person');
        }
    });
    // ── pipedrive_update_person ───────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_update_person', {
        title: 'Update Pipedrive Contact',
        description: `Update an existing contact (person). Only provided fields are changed.

Args:
  - id: Person ID to update (required).
  - name: New full name.
  - email: Replace all email addresses with this new array.
  - phone: Replace all phone numbers with this new array.
  - org_id: New organization association.

Returns: Updated contact object.`,
        inputSchema: {
            id: zod_1.z.number().int().positive().describe('Person ID to update (required)'),
            name: zod_1.z.string().min(1).optional().describe('New full name'),
            email: zod_1.z.array(zod_1.z.string()).optional().describe('New email addresses (replaces existing list)'),
            phone: zod_1.z.array(zod_1.z.string()).optional().describe('New phone numbers (replaces existing list)'),
            org_id: zod_1.z.number().int().positive().optional().describe('New organization ID'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        try {
            const body = {};
            if (params.name)
                body.name = params.name;
            if (params.email?.length)
                body.email = params.email.map((e, i) => ({ value: e, primary: i === 0, label: 'work' }));
            if (params.phone?.length)
                body.phone = params.phone.map((p, i) => ({ value: p, primary: i === 0, label: 'work' }));
            if (params.org_id !== undefined)
                body.org_id = params.org_id;
            const response = await client.put(`/persons/${params.id}`, body);
            const person = response.data;
            return {
                content: [{ type: 'text', text: `# Contact #${params.id} Updated Successfully\n\n${formatPerson(person)}` }],
                structuredContent: person,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `update person #${params.id}`);
        }
    });
    // ── pipedrive_delete_person ───────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_delete_person', {
        title: 'Delete Pipedrive Contact',
        description: `Permanently delete a contact (person) from Pipedrive. This action cannot be undone.

Args:
  - id: Person ID to permanently delete (required).

Returns: Confirmation of deletion.

Warning: This permanently deletes the contact and removes them from all associated deals,
activities, and notes. Consider merging duplicates instead of deleting.`,
        inputSchema: {
            id: zod_1.z.number().int().positive().describe('Person ID to permanently delete (required)'),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    }, async (raw) => {
        const { id } = raw;
        try {
            await client.delete(`/persons/${id}`);
            return {
                content: [{ type: 'text', text: `# Contact Deleted\n\nContact #${id} has been permanently deleted.` }],
                structuredContent: { deleted: true, id },
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `delete person #${id}`);
        }
    });
    // ── pipedrive_search_persons ──────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_search_persons', {
        title: 'Search Pipedrive Contacts',
        description: `Search for contacts (persons) by name, email, or phone number.

Args:
  - term: Search keyword (minimum 2 characters, required).
  - fields: Comma-separated fields to search — options: name, email, phone, notes, custom_fields.
  - exact_match: Require exact word match (default: false).
  - limit: Max results (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT}).
  - start: Pagination offset.

Returns: Matching contacts with relevance score, name, emails, phones, organization.`,
        inputSchema: {
            term: zod_1.z.string().min(2).describe('Search keyword — name, email, or phone (min 2 chars)'),
            fields: zod_1.z.string().optional().describe('Comma-separated fields to search (name, email, phone)'),
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
            const response = await client.get('/persons/search', {
                term: params.term,
                fields: params.fields,
                exact_match: params.exact_match ? 1 : undefined,
                limit,
                start,
            });
            const items = response.data?.items ?? [];
            const pagination = response.additional_data?.pagination;
            const structured = {
                results: items.map((i) => ({ score: i.result_score, person: i.item })),
                count: items.length,
                start,
                has_more: pagination?.more_items_in_collection ?? false,
                next_start: pagination?.next_start,
            };
            let text = `# Contact Search: "${params.term}" (${items.length} result${items.length !== 1 ? 's' : ''})\n\n`;
            if (items.length === 0) {
                text += `_No contacts found matching "${params.term}"._`;
            }
            else {
                for (const { result_score, item } of items) {
                    text += `### #${item.id}: ${item.name} _(score: ${result_score.toFixed(2)})_\n`;
                    if (item.emails.length)
                        text += `- **Emails**: ${item.emails.join(', ')}\n`;
                    if (item.phones.length)
                        text += `- **Phones**: ${item.phones.join(', ')}\n`;
                    if (item.organization)
                        text += `- **Organization**: ${item.organization.name} (ID: ${item.organization.id})\n`;
                    text += '\n';
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
            return (0, pipedrive_1.handlePipedriveError)(error, `search persons for "${params.term}"`);
        }
    });
}
//# sourceMappingURL=persons.js.map