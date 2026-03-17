import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { PipedriveClient, handlePipedriveError } from '../pipedrive';
import { registerTool } from '../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipedriveUser {
  [key: string]: unknown;
  id: number;
  name: string;
  email: string;
  active_flag: boolean;
  role_id: number;
  created: string;
  modified: string;
}

// ─── Tool Registration ────────────────────────────────────────────────────────

export function registerUserTools(server: McpServer, client: PipedriveClient): void {
  registerTool(
    server,
    'pipedrive_get_users',
    {
      title: 'Get Pipedrive Users',
      description: `List all users in the Pipedrive account.

Returns each user's ID, name, email, and active status.

Use when:
  - Finding user IDs to filter deals/leads/activities by owner
  - Checking who is active in the account
  - Assigning ownership of deals, leads, or contacts

Returns: All users with id, name, email, active_flag, role_id, and timestamps.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const response = await client.get<PipedriveUser[]>('/users');
        const users = response.data ?? [];
        const structured = {
          users: users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            active_flag: u.active_flag,
          })),
          count: users.length,
        };

        let text = `# Pipedrive Users (${users.length})\n\n`;
        if (users.length === 0) {
          text += '_No users found._';
        } else {
          for (const user of users) {
            const status = user.active_flag ? '✓ Active' : '✗ Inactive';
            text += `### ${user.name} (ID: ${user.id})\n`;
            text += `- **Email**: ${user.email}\n`;
            text += `- **Status**: ${status}\n\n`;
          }
        }
        return {
          content: [{ type: 'text' as const, text }],
          structuredContent: structured,
        };
      } catch (error) {
        return handlePipedriveError(error, 'get users');
      }
    }
  );
}
