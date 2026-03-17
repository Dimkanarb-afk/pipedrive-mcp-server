"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTool = registerTool;
/**
 * Thin wrapper for McpServer.registerTool that avoids TS2589
 * ("Type instantiation is excessively deep") which occurs when TypeScript
 * tries to infer ZodRawShape generics in the MCP SDK's registerTool signature.
 *
 * Runtime behavior is IDENTICAL — Zod validation, tool registration, and
 * tool execution all work exactly the same as calling server.registerTool directly.
 */
function registerTool(server, name, config, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
handler) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.registerTool(name, config, handler);
}
//# sourceMappingURL=utils.js.map