#!/usr/bin/env node
"use strict";
/**
 * Pipedrive MCP Server — Ultimate Edition
 *
 * Full-featured Pipedrive CRM integration for Claude Desktop.
 * Supports deals, leads, persons, organizations, notes, activities,
 * pipelines, stages, users, and global search via natural language.
 *
 * Required environment variables:
 *   PIPEDRIVE_API_TOKEN      — Your Pipedrive API token
 *   PIPEDRIVE_COMPANY_DOMAIN — Your Pipedrive subdomain (e.g. "mycompany")
 */
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const pipedrive_1 = require("./pipedrive");
const rate_limiter_1 = require("./rate-limiter");
const deals_1 = require("./tools/deals");
const persons_1 = require("./tools/persons");
const organizations_1 = require("./tools/organizations");
const activities_1 = require("./tools/activities");
const notes_1 = require("./tools/notes");
const pipelines_1 = require("./tools/pipelines");
const leads_1 = require("./tools/leads");
const users_1 = require("./tools/users");
const search_1 = require("./tools/search");
async function main() {
    // Validate environment and initialize rate-limited API client
    const rawClient = new pipedrive_1.PipedriveClient();
    const client = (0, rate_limiter_1.withRateLimit)(rawClient);
    // Create MCP server
    const server = new mcp_js_1.McpServer({
        name: 'pipedrive-mcp',
        version: '1.0.0',
    });
    // ── Register all tool groups ──────────────────────────────────────────────
    (0, deals_1.registerDealTools)(server, client);
    (0, persons_1.registerPersonTools)(server, client);
    (0, organizations_1.registerOrganizationTools)(server, client);
    (0, activities_1.registerActivityTools)(server, client);
    (0, notes_1.registerNoteTools)(server, client);
    (0, pipelines_1.registerPipelineTools)(server, client);
    (0, leads_1.registerLeadTools)(server, client);
    (0, users_1.registerUserTools)(server, client);
    (0, search_1.registerSearchTools)(server, client);
    // ── Register predefined prompts ───────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = server;
    s.registerPrompt('list-all-deals', {
        title: 'List All Deals',
        description: 'Get a complete overview of all deals in Pipedrive, organized by status',
    }, () => ({
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Please list all deals in Pipedrive. Show open deals first, then won, then lost. ' +
                        'For each deal include the title, value, stage, owner, and expected close date. ' +
                        'Summarize the total pipeline value at the end.',
                },
            },
        ],
    }));
    s.registerPrompt('list-all-persons', {
        title: 'List All Contacts',
        description: 'Get a complete list of all contacts (persons) in Pipedrive',
    }, () => ({
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Please list all contacts (persons) in Pipedrive. ' +
                        'For each contact show their name, primary email, phone, organization, and number of open deals. ' +
                        'Group them by organization if possible.',
                },
            },
        ],
    }));
    s.registerPrompt('analyze-deals', {
        title: 'Analyze Deal Pipeline',
        description: 'Deep analysis of the deal pipeline — values, stages, win rates, and trends',
    }, () => ({
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Analyze the Pipedrive deal pipeline. Please:\n' +
                        '1. Calculate total open pipeline value and average deal size\n' +
                        '2. Break down deals by stage and show value at each stage\n' +
                        '3. Show win rate (won vs total closed deals)\n' +
                        '4. Identify deals that are overdue (past expected close date)\n' +
                        '5. List the top 5 highest-value open deals\n' +
                        '6. Show deals by owner and their pipeline values',
                },
            },
        ],
    }));
    s.registerPrompt('analyze-contacts', {
        title: 'Analyze Contacts & Organizations',
        description: 'Overview of contacts and organizations, with deal activity and engagement stats',
    }, () => ({
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Analyze the contacts and organizations in Pipedrive. Please:\n' +
                        '1. Count total contacts and organizations\n' +
                        '2. List top organizations by number of open deals\n' +
                        '3. Identify contacts with the most active deals\n' +
                        '4. Find contacts who have no associated deals (potential cold outreach)\n' +
                        '5. Show recent contact additions (last 30 days)',
                },
            },
        ],
    }));
    s.registerPrompt('find-high-value-deals', {
        title: 'Find High-Value Deals',
        description: 'Identify and prioritize the highest-value deals in the pipeline',
    }, () => ({
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Find and analyze the highest-value deals in Pipedrive. Please:\n' +
                        '1. List all open deals sorted by value (highest first)\n' +
                        '2. Show total value of top 10 deals\n' +
                        '3. For each top deal, show the stage, owner, expected close date, and associated contact/org\n' +
                        '4. Flag any high-value deals with no recent activity (no activities in 14+ days)\n' +
                        '5. Calculate what percentage of total pipeline the top 10 deals represent',
                },
            },
        ],
    }));
    s.registerPrompt('analyze-leads', {
        title: 'Analyze Leads Pipeline',
        description: 'Overview and analysis of all leads — volume, sources, owners, and conversion opportunities',
    }, () => ({
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Analyze the leads in Pipedrive. Please:\n' +
                        '1. Count total active (non-archived) leads\n' +
                        '2. Show leads by owner and their counts\n' +
                        '3. List available lead labels and how many leads have each label\n' +
                        '4. Show total estimated value of all leads\n' +
                        '5. Identify leads with expected close dates in the next 30 days\n' +
                        '6. List the 10 most recently added leads with their details',
                },
            },
        ],
    }));
    s.registerPrompt('compare-pipelines', {
        title: 'Compare Sales Pipelines',
        description: 'Side-by-side comparison of all pipelines — deal counts, values, and conversion rates',
    }, () => ({
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'Compare all sales pipelines in Pipedrive. Please:\n' +
                        '1. List all pipelines and their stages\n' +
                        '2. For each pipeline, show: number of open deals, total open value, average deal size\n' +
                        '3. Show won and lost deal counts per pipeline\n' +
                        '4. Calculate conversion rate (won / total closed) per pipeline\n' +
                        '5. Identify which pipeline has the highest average deal value\n' +
                        '6. Show which stages have the most deals stuck (highest deal count)',
                },
            },
        ],
    }));
    // ── Connect via stdio transport ───────────────────────────────────────────
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    const domain = process.env.PIPEDRIVE_COMPANY_DOMAIN;
    console.error(`Pipedrive MCP server running — connected to ${domain}.pipedrive.com`);
    console.error(`Rate limiting: 70 req/2s via Bottleneck`);
}
main().catch((error) => {
    console.error('Fatal error starting Pipedrive MCP server:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map