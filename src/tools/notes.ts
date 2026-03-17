import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { PipedriveClient, handlePipedriveError, truncateText } from '../pipedrive';
import { registerTool } from '../utils';
import { Note } from '../types';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants';

// ─── Input Types ─────────────────────────────────────────────────────────────

type AddNoteParams = {
  content: string;
  deal_id?: number;
  person_id?: number;
  org_id?: number;
  pinned_to_deal_flag?: boolean;
  pinned_to_person_flag?: boolean;
  pinned_to_organization_flag?: boolean;
};

type ListNotesParams = {
  limit: number;
  start: number;
  deal_id?: number;
  person_id?: number;
  org_id?: number;
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatNote(note: Note): string {
  const lines: string[] = [`### Note #${note.id as number}`];

  const deal = note.deal as { title: string } | null;
  const person = note.person as { name: string } | null;
  const org = note.org as { name: string } | null;
  const user = note.user as { name: string } | null;

  if (deal) lines.push(`- **Deal**: ${deal.title} (ID: ${note.deal_id as number})`);
  if (person) lines.push(`- **Person**: ${person.name} (ID: ${note.person_id as number})`);
  if (org) lines.push(`- **Organization**: ${org.name} (ID: ${note.org_id as number})`);

  const flags: string[] = [];
  if (note.pinned_to_deal_flag) flags.push('pinned to deal');
  if (note.pinned_to_person_flag) flags.push('pinned to person');
  if (note.pinned_to_organization_flag) flags.push('pinned to org');
  if (flags.length) lines.push(`- **Pinned**: ${flags.join(', ')}`);

  if (user) lines.push(`- **Author**: ${user.name}`);
  lines.push(`- **Added**: ${note.add_time as string} | **Updated**: ${note.update_time as string}`);
  lines.push(`\n${note.content as string}`);

  return lines.join('\n');
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerNoteTools(server: McpServer, client: PipedriveClient): void {
  // ── pipedrive_add_note ────────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_add_note',
    {
      title: 'Add Note to Pipedrive',
      description: `Add a note to a deal, contact (person), or organization in Pipedrive.

Notes support plain text and basic HTML formatting.
A note can be linked to multiple entities simultaneously (deal + person + org).

Args:
  - content: The note text content (required). Supports HTML formatting.
  - deal_id: Link note to this deal ID.
  - person_id: Link note to this person/contact ID.
  - org_id: Link note to this organization ID.
  - pinned_to_deal_flag: Pin this note to the deal (shows prominently).
  - pinned_to_person_flag: Pin this note to the person.
  - pinned_to_organization_flag: Pin this note to the organization.

Returns: The newly created note object with assigned ID.

Use when: Recording meeting notes, call summaries, important context, or follow-up details.
Note: At least one of deal_id, person_id, or org_id should be provided.`,
      inputSchema: {
        content: z.string().min(1).describe('Note content — plain text or HTML (required)'),
        deal_id: z.number().int().positive().optional().describe('Deal ID to attach note to'),
        person_id: z.number().int().positive().optional().describe('Person/contact ID to attach note to'),
        org_id: z.number().int().positive().optional().describe('Organization ID to attach note to'),
        pinned_to_deal_flag: z.boolean().optional().describe('Pin this note to the deal (shows prominently on deal page)'),
        pinned_to_person_flag: z.boolean().optional().describe('Pin this note to the person'),
        pinned_to_organization_flag: z.boolean().optional().describe('Pin this note to the organization'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as AddNoteParams;
      try {
        const body: Record<string, unknown> = { content: params.content };
        if (params.deal_id) body.deal_id = params.deal_id;
        if (params.person_id) body.person_id = params.person_id;
        if (params.org_id) body.org_id = params.org_id;
        if (params.pinned_to_deal_flag !== undefined) body.pinned_to_deal_flag = params.pinned_to_deal_flag ? 1 : 0;
        if (params.pinned_to_person_flag !== undefined) body.pinned_to_person_flag = params.pinned_to_person_flag ? 1 : 0;
        if (params.pinned_to_organization_flag !== undefined) body.pinned_to_organization_flag = params.pinned_to_organization_flag ? 1 : 0;

        const response = await client.post<Note>('/notes', body);
        const note = response.data;
        return {
          content: [{ type: 'text' as const, text: `# Note Added Successfully\n\n${formatNote(note)}` }],
          structuredContent: note,
        };
      } catch (error) {
        return handlePipedriveError(error, 'add note');
      }
    }
  );

  // ── pipedrive_list_notes ──────────────────────────────────────────────────

  registerTool(
    server,
    'pipedrive_list_notes',
    {
      title: 'List Pipedrive Notes',
      description: `List notes attached to a deal, contact, or organization.

Args:
  - deal_id: Filter notes linked to this deal ID.
  - person_id: Filter notes linked to this person/contact ID.
  - org_id: Filter notes linked to this organization ID.
  - limit: Max results per page (1–100, default: 20).
  - start: Pagination offset (default: 0).

Returns: Paginated list of notes with content, author, linked entities, timestamps.

Use when: Reviewing history, call logs, or meeting notes for a deal or contact.
Tip: Provide exactly one of deal_id, person_id, or org_id for focused results.`,
      inputSchema: {
        limit: z.number().optional().describe(`Max results (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`),
        start: z.number().optional().describe('Pagination offset (default: 0)'),
        deal_id: z.number().int().positive().optional().describe('Filter notes for this deal ID'),
        person_id: z.number().int().positive().optional().describe('Filter notes for this person/contact ID'),
        org_id: z.number().int().positive().optional().describe('Filter notes for this organization ID'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (raw) => {
      const params = raw as ListNotesParams;
      const limit = params.limit ?? DEFAULT_LIMIT;
      const start = params.start ?? 0;
      try {
        const queryParams: Record<string, string | number | boolean | undefined | null> = { limit, start };
        if (params.deal_id !== undefined) queryParams.deal_id = params.deal_id;
        if (params.person_id !== undefined) queryParams.person_id = params.person_id;
        if (params.org_id !== undefined) queryParams.org_id = params.org_id;

        const response = await client.get<Note[]>('/notes', queryParams);
        const notes = response.data;
        const pagination = response.additional_data?.pagination;
        const structured = {
          notes,
          count: notes.length,
          start,
          has_more: pagination?.more_items_in_collection ?? false,
          next_start: pagination?.next_start,
        };
        let text = `# Notes (${notes.length} result${notes.length !== 1 ? 's' : ''})\n\n`;
        if (notes.length === 0) text += '_No notes found matching the given filters._';
        else text += notes.map(formatNote).join('\n\n---\n\n');
        if (structured.has_more) text += `\n\n_More results available. Use \`start=${structured.next_start}\` for next page._`;
        return {
          content: [{ type: 'text' as const, text: truncateText(text) }],
          structuredContent: structured,
        };
      } catch (error) {
        return handlePipedriveError(error, 'list notes');
      }
    }
  );
}
