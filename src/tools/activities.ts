import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { PipedriveClient, handlePipedriveError, truncateText } from '../pipedrive';
import { registerTool } from '../utils';
import { Activity } from '../types';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants';

// ─── Input Types ─────────────────────────────────────────────────────────────

type ListActivitiesParams = {
  deal_id?: number;
  person_id?: number;
  org_id?: number;
  done?: boolean;
  limit: number;
  start: number;
};

type CreateActivityParams = {
  subject: string;
  type: string;
  due_date: string;
  due_time?: string;
  duration?: string;
  deal_id?: number;
  person_id?: number;
  org_id?: number;
  note?: string;
};

type UpdateActivityParams = {
  id: number;
  done?: boolean;
  subject?: string;
  type?: string;
  due_date?: string;
  due_time?: string;
  duration?: string;
  note?: string;
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatActivity(activity: Activity): string {
  const statusIcon = activity.done ? '✓' : '○';
  const lines: string[] = [
    `### ${statusIcon} Activity #${activity.id as number}: ${activity.subject as string}`,
    `- **Type**: ${activity.type as string} | **Done**: ${activity.done ? 'Yes' : 'No'}`,
    `- **Due**: ${activity.due_date as string}${activity.due_time ? ` at ${activity.due_time as string}` : ''}`,
  ];
  if (activity.duration) lines.push(`- **Duration**: ${activity.duration as string}`);
  if (activity.deal_title) lines.push(`- **Deal**: ${activity.deal_title as string} (ID: ${activity.deal_id as number})`);
  if (activity.person_name) lines.push(`- **Person**: ${activity.person_name as string} (ID: ${activity.person_id as number})`);
  if (activity.org_name) lines.push(`- **Organization**: ${activity.org_name as string} (ID: ${activity.org_id as number})`);
  if (activity.note) lines.push(`- **Note**: ${activity.note as string}`);
  if (activity.marked_as_done_time) lines.push(`- **Completed**: ${activity.marked_as_done_time as string}`);
  lines.push(`- **Owner**: ${activity.owner_name as string}`, `- **Added**: ${activity.add_time as string}`);
  return lines.join('\n');
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerActivityTools(server: McpServer, client: PipedriveClient): void {
  // ── pipedrive_list_activities ─────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_list_activities',
    {
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
        deal_id: z.number().int().positive().optional().describe('Filter to activities for this deal ID'),
        person_id: z.number().int().positive().optional().describe('Filter to activities for this person ID'),
        org_id: z.number().int().positive().optional().describe('Filter to activities for this organization ID'),
        done: z.boolean().optional().describe('true = done only, false = pending only, omit = all'),
        limit: z.number().optional().describe(`Max results (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`),
        start: z.number().optional().describe('Pagination offset (default: 0)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as ListActivitiesParams;
      const limit = params.limit ?? DEFAULT_LIMIT;
      const start = params.start ?? 0;
      try {
        const queryParams: Record<string, string | number | boolean | undefined | null> = { limit, start };
        if (params.deal_id !== undefined) queryParams.deal_id = params.deal_id;
        if (params.person_id !== undefined) queryParams.person_id = params.person_id;
        if (params.org_id !== undefined) queryParams.org_id = params.org_id;
        if (params.done !== undefined) queryParams.done = params.done ? 1 : 0;

        const response = await client.get<Activity[]>('/activities', queryParams);
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
        if (activities.length === 0) text += '_No activities found matching the given filters._';
        else text += activities.map(formatActivity).join('\n\n');
        if (structured.has_more) text += `\n\n_More results available. Use \`start=${structured.next_start}\` for next page._`;
        return {
          content: [{ type: 'text' as const, text: truncateText(text) }],
          structuredContent: structured,
        };
      } catch (error) {
        return handlePipedriveError(error, 'list activities');
      }
    }
  );

  // ── pipedrive_create_activity ─────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_create_activity',
    {
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
        subject: z.string().min(1).describe('Activity subject/title (required)'),
        type: z.string().min(1).describe('Activity type: call, meeting, email, task, deadline, lunch (required)'),
        due_date: z.string().describe('Due date (YYYY-MM-DD, required)'),
        due_time: z.string().optional().describe('Due time (HH:MM, e.g. 14:30)'),
        duration: z.string().optional().describe('Duration (HH:MM, e.g. 01:00)'),
        deal_id: z.number().int().positive().optional().describe('Deal ID to link this activity to'),
        person_id: z.number().int().positive().optional().describe('Person/contact ID to link'),
        org_id: z.number().int().positive().optional().describe('Organization ID to link'),
        note: z.string().optional().describe('Activity notes or description'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as CreateActivityParams;
      try {
        const body: Record<string, unknown> = {
          subject: params.subject,
          type: params.type,
          due_date: params.due_date,
        };
        if (params.due_time) body.due_time = params.due_time;
        if (params.duration) body.duration = params.duration;
        if (params.deal_id) body.deal_id = params.deal_id;
        if (params.person_id) body.person_id = params.person_id;
        if (params.org_id) body.org_id = params.org_id;
        if (params.note) body.note = params.note;

        const response = await client.post<Activity>('/activities', body);
        const activity = response.data;
        return {
          content: [{ type: 'text' as const, text: `# Activity Created Successfully\n\n${formatActivity(activity)}` }],
          structuredContent: activity,
        };
      } catch (error) {
        return handlePipedriveError(error, 'create activity');
      }
    }
  );

  // ── pipedrive_update_activity ─────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_update_activity',
    {
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
        id: z.number().int().positive().describe('Activity ID to update (required)'),
        done: z.boolean().optional().describe('Mark as done (true) or reopen (false)'),
        subject: z.string().min(1).optional().describe('New subject'),
        type: z.string().min(1).optional().describe('New activity type'),
        due_date: z.string().optional().describe('New due date (YYYY-MM-DD)'),
        due_time: z.string().optional().describe('New due time (HH:MM)'),
        duration: z.string().optional().describe('New duration (HH:MM)'),
        note: z.string().optional().describe('New or updated notes'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as UpdateActivityParams;
      try {
        const { id, ...fields } = params;
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) body[key] = value;
        }
        const response = await client.put<Activity>(`/activities/${id}`, body);
        const activity = response.data;
        return {
          content: [{ type: 'text' as const, text: `# Activity #${id} Updated Successfully\n\n${formatActivity(activity)}` }],
          structuredContent: activity,
        };
      } catch (error) {
        return handlePipedriveError(error, `update activity #${params.id}`);
      }
    }
  );
}
