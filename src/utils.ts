import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';

/**
 * Thin wrapper for McpServer.registerTool that avoids TS2589
 * ("Type instantiation is excessively deep") which occurs when TypeScript
 * tries to infer ZodRawShape generics in the MCP SDK's registerTool signature.
 *
 * Runtime behavior is IDENTICAL — Zod validation, tool registration, and
 * tool execution all work exactly the same as calling server.registerTool directly.
 */
export function registerTool(
  server: McpServer,
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (params: any) => Promise<any>
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(name, config, handler);
}
