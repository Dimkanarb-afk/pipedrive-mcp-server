"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPipelineTools = registerPipelineTools;
const zod_1 = require("zod");
const pipedrive_1 = require("../pipedrive");
const utils_1 = require("../utils");
// ─── Formatters ──────────────────────────────────────────────────────────────
function formatPipeline(pipeline) {
    const lines = [
        `### Pipeline #${pipeline.id}: ${pipeline.name}`,
        `- **Active**: ${pipeline.active ? 'Yes' : 'No'}`,
        `- **Deal Probability**: ${pipeline.deal_probability ? 'Enabled' : 'Disabled'}`,
        `- **Order**: ${pipeline.order_nr}`,
        `- **Added**: ${pipeline.add_time}`,
    ];
    return lines.join('\n');
}
function formatStage(stage) {
    const lines = [
        `### Stage #${stage.id}: ${stage.name}`,
        `- **Pipeline**: ${stage.pipeline_name} (ID: ${stage.pipeline_id})`,
        `- **Order**: ${stage.order_nr}`,
        `- **Active**: ${stage.active_flag ? 'Yes' : 'No'}`,
        `- **Deal Probability**: ${stage.deal_probability}%`,
    ];
    if (stage.rotten_flag) {
        lines.push(`- **Rotten after**: ${stage.rotten_days ?? '?'} days`);
    }
    return lines.join('\n');
}
// ─── Tool Registration ───────────────────────────────────────────────────────
function registerPipelineTools(server, client) {
    // ── pipedrive_list_pipelines ──────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_list_pipelines', {
        title: 'List Pipedrive Pipelines',
        description: `List all sales pipelines configured in Pipedrive.

Returns: All pipelines with ID, name, active status, deal probability setting, order.

Use when: Finding pipeline IDs before filtering deals or listing stages.
Typically called first to discover available pipelines and their IDs.`,
        inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async () => {
        try {
            const response = await client.get('/pipelines');
            const pipelines = response.data;
            const structured = { pipelines, count: pipelines.length };
            let text = `# Pipelines (${pipelines.length})\n\n`;
            if (pipelines.length === 0)
                text += '_No pipelines found._';
            else
                text += pipelines.map(formatPipeline).join('\n\n');
            return {
                content: [{ type: 'text', text }],
                structuredContent: structured,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, 'list pipelines');
        }
    });
    // ── pipedrive_list_stages ─────────────────────────────────────────────────
    (0, utils_1.registerTool)(server, 'pipedrive_list_stages', {
        title: 'List Pipedrive Stages',
        description: `List pipeline stages — optionally filtered to a specific pipeline.

Args:
  - pipeline_id: Filter to stages in this pipeline (omit to get all stages from all pipelines).

Returns: Stages with ID, name, pipeline, order, deal probability percentage, rotten deal settings.

Use when:
  - Finding stage IDs before creating or moving deals
  - Understanding the sales process structure
  - Checking deal probability by stage

Note: Use pipedrive_list_pipelines first to get pipeline IDs.`,
        inputSchema: {
            pipeline_id: zod_1.z.number().int().positive().optional().describe('Filter to stages in this pipeline ID. Omit to list all stages across all pipelines.'),
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (raw) => {
        const params = raw;
        try {
            const queryParams = {};
            if (params.pipeline_id !== undefined)
                queryParams.pipeline_id = params.pipeline_id;
            const response = await client.get('/stages', queryParams);
            const stages = response.data;
            const structured = { stages, count: stages.length, pipeline_id: params.pipeline_id };
            const title = params.pipeline_id
                ? `Stages for Pipeline #${params.pipeline_id}`
                : 'All Pipeline Stages';
            let text = `# ${title} (${stages.length})\n\n`;
            if (stages.length === 0)
                text += '_No stages found._';
            else
                text += stages.map(formatStage).join('\n\n');
            return {
                content: [{ type: 'text', text }],
                structuredContent: structured,
            };
        }
        catch (error) {
            return (0, pipedrive_1.handlePipedriveError)(error, params.pipeline_id ? `list stages for pipeline #${params.pipeline_id}` : 'list stages');
        }
    });
}
//# sourceMappingURL=pipelines.js.map