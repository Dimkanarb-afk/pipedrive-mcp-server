import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
/**
 * Thin wrapper for McpServer.registerTool that avoids TS2589
 * ("Type instantiation is excessively deep") which occurs when TypeScript
 * tries to infer ZodRawShape generics in the MCP SDK's registerTool signature.
 *
 * Runtime behavior is IDENTICAL — Zod validation, tool registration, and
 * tool execution all work exactly the same as calling server.registerTool directly.
 */
export declare function registerTool(server: McpServer, name: string, config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
    };
}, handler: (params: any) => Promise<any>): void;
//# sourceMappingURL=utils.d.ts.map