"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerActivityTools = registerActivityTools;
const zod_1 = require("zod");
const pipedrive_1 = require("../pipedrive");
const utils_1 = require("../utils");
const constants_1 = require("../constants");
// ─── Formatters ──────────────────────────────────────────────────────────────
function formatActivity(activity) {
    const statusIcon = activity.done ? '✓' : '○';
    const lines = [
        `### ${statusIcon} Activity #${activity.id}: ${activity.subject}`,
        `- **Type**: ${activity.type} | **Done**: ${activity.done ? 'Yes' : 'No'}`,
        `- **Due**: ${activity.due_date}${activity.due_time ? ` at ${activity.due_time}` : ''}`,
    ];
    if (activity.duration)
        lines.push(`- **Duration**: ${activity.duration}`);
    if (activity.deal_title)
        lines.push(`- **Deal**: ${activity.deal_title} (ID: ${activity.deal_id})`);
    if (activity.person_name)
        lines.push(`- **Person**: ${activity.person_name} (ID: ${activity.person_id})`);
    if (activity.org_name)
        lines.push(`- **Organization**: ${activity.org_name} (ID: ${activity.org_id})`);
    if (activity.note)
        lines.push(`- **Note**: ${activity.note}`);
    if (activity.marked_as_done_time)
        lines.push(`- **Completed**: ${activity.marked_as_done_time}`);
    lines.push(`- **Owner**: ${activity.owner_name}`, `- **Added**: ${activity.add_time}`);
    return lines.join('\n');
}
// ─── Tool Registration ───────────────────────────────────────────────────────
function registerActivityTools(server, client) {
    // ── pipedrive_list_activities ─────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_list_activities', {
        title: 'List Pipedrive Activities',
        description: `List activities (calls, meetings, emails, tasks) from Pipedrive CRM.

Args:
  - deal_id: Filter activities linked to a specific deal.
  - person_id: Filter activities linked to a specific contact.
  - org_id: Filter activities linked to a specific organization.
  - done: Filter by completion — true for done, false for pending, omit for all.
  - limit: Max results per page (1–100, default: 20).
  - start: Pagination offset (default: 0).

Returns: Activities with type, subject, due date/time, linked deal/person/org, notes, status.

Use when: Reviewing scheduled activities, finding follow-ups, checking what's due.`,
        inputSchema: {
            deal_id: zod_1.z.number().int().positive().optional().describe('Filter to activities for this deal ID'),
            person_id: zod_1.z.number().int().positive().optional().describe('Filter to activities for this person ID'),
            org_id: zod_1.z.number().int().positive().optional().describe('Filter to activities for this organization ID'),
            done: zod_1.z.boolean().optional().describe('true = done only, false = pending only, omit = all'),
            limit: zod_1.z.number().optional().describe(`Max results (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT})`),
            start: zod_1.z.number().optional().describe('Pagination offset (default: 0)'),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        const limit = params.limit ?? constants_1.DEFAULT_LIMIT;
        const start = params.start ?? 0;
        try {
            const queryParams = { limit, start };
            if (params.deal_id !== undefined)
                queryParams.deal_id = params.deal_id;
            if (params.person_id !== undefined)
                queryParams.person_id = params.person_id;
            if (params.org_id !== undefined)
                queryParams.org_id = params.org_id;
            if (params.done !== undefined)
                queryParams.done = params.done ? 1 : 0;
            const response = await client.get('/activities', queryParams);
            const activities = response.data;
            const pagination = response.additional_data?.pagination;
            const structured = {
                activities,
                count: activities.length,
                start,
                has_more: pagination?.more_items_in_collection ?? false,
                next_start: pagination?.next_start,
            };
            let text = `# Activities (${activities.length} result${activities.length !== 1 ? 's' : ''})\n\n`;
            if (activities.length === 0)
                text += '_No activities found matching the given filters._';
            else
                text += activities.map(formatActivity).join('\n\n');
            if (structured.has_more)
                text += `\n\n_More results available. Use \`start=${structured.next_start}\` for next page._`;
            return {
                content: [{ type: 'text', text: (0, pipedrive_1.truncateText)(text) }],
                structuredContent: structured,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, 'list activities');
        }
    });
    // ── pipedrive_create_activity ─────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_create_activity', {
        title: 'Create Pipedrive Activity',
        description: `Create a new activity (call, meeting, email, task, etc.) in Pipedrive.

Args:
  - subject: Activity title/subject (required).
  - type: Activity type — call, meeting, email, task, deadline, lunch, or any custom type (required).
  - due_date: Due date in YYYY-MM-DD format (required).
  - due_time: Due time in HH:MM format.
  - duration: Duration in HH:MM format.
  - deal_id: Link to a deal ID.
  - person_id: Link to a person/contact ID.
  - org_id: Link to an organization ID.
  - note: Activity notes or description.

Returns: The newly created activity with assigned ID.`,
        inputSchema: {
            subject: zod_1.z.string().min(1).describe('Activity subject/title (required)'),
            type: zod_1.z.string().min(1).describe('Activity type: call, meeting, email, task, deadline, lunch (required)'),
            due_date: zod_1.z.string().describe('Due date (YYYY-MM-DD, required)'),
            due_time: zod_1.z.string().optional().describe('Due time (HH:MM, e.g. 14:30)'),
            duration: zod_1.z.string().optional().describe('Duration (HH:MM, e.g. 01:00)'),
            deal_id: zod_1.z.number().int().positive().optional().describe('Deal ID to link this activity to'),
            person_id: zod_1.z.number().int().positive().optional().describe('Person/contact ID to link'),
            org_id: zod_1.z.number().int().positive().optional().describe('Organization ID to link'),
            note: zod_1.z.string().optional().describe('Activity notes or description'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        try {
            const body = {
                subject: params.subject,
                type: params.type,
                due_date: params.due_date,
            };
            if (params.due_time)
                body.due_time = params.due_time;
            if (params.duration)
                body.duration = params.duration;
            if (params.deal_id)
                body.deal_id = params.deal_id;
            if (params.person_id)
                body.person_id = params.person_id;
            if (params.org_id)
                body.org_id = params.org_id;
            if (params.note)
                body.note = params.note;
            const response = await client.post('/activities', body);
            const activity = response.data;
            return {
                content: [{ type: 'text', text: `# Activity Created Successfully\n\n${formatActivity(activity)}` }],
                structuredContent: activity,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, 'create activity');
        }
    });
    // ── pipedrive_update_activity ─────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_update_activity', {
        title: 'Update Pipedrive Activity',
        description: `Update an existing activity. Only provided fields are changed.

Common uses:
  - Mark as done: set done=true
  - Reschedule: update due_date and/or due_time
  - Update notes: provide new note content

Args:
  - id: Activity ID to update (required).
  - done: Mark as done (true) or reopen (false).
  - subject: New subject/title.
  - type: New activity type.
  - due_date: New due date (YYYY-MM-DD).
  - due_time: New due time (HH:MM).
  - duration: New duration (HH:MM).
  - note: New or updated notes.

Returns: Updated activity object.`,
        inputSchema: {
            id: zod_1.z.number().int().positive().describe('Activity ID to update (required)'),
            done: zod_1.z.boolean().optional().describe('Mark as done (true) or reopen (false)'),
            subject: zod_1.z.string().min(1).optional().describe('New subject'),
            type: zod_1.z.string().min(1).optional().describe('New activity type'),
            due_date: zod_1.z.string().optional().describe('New due date (YYYY-MM-DD)'),
            due_time: zod_1.z.string().optional().describe('New due time (HH:MM)'),
            duration: zod_1.z.string().optional().describe('New duration (HH:MM)'),
            note: zod_1.z.string().optional().describe('New or updated notes'),
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
            const response = await client.put(`/activities/${id}`, body);
            const activity = response.data;
            return {
                content: [{ type: 'text', text: `# Activity #${id} Updated Successfully\n\n${formatActivity(activity)}` }],
                structuredContent: activity,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, `update activity #${params.id}`);
        }
    });
}
//# sourceMappingURL=activities.js.map