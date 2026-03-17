"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationShape = exports.PipedriveClient = exports.PipedriveError = void 0;
exports.truncateText = truncateText;
exports.handlePipedriveError = handlePipedriveError;
const zod_1 = require("zod");
const constants_1 = require("./constants");
// ─── Error Class ─────────────────────────────────────────────────────────────
class PipedriveError extends Error {
    statusCode;
    errorInfo;
    constructor(statusCode, message, errorInfo) {
        super(message);
        this.statusCode = statusCode;
        this.errorInfo = errorInfo;
        this.name = 'PipedriveError';
    }
}
exports.PipedriveError = PipedriveError;
class PipedriveClient {
    baseUrl;
    apiToken;
    constructor() {
        const domain = process.env.PIPEDRIVE_COMPANY_DOMAIN;
        const token = process.env.PIPEDRIVE_API_TOKEN;
        if (!domain || !token) {
            throw new Error('Missing required environment variables. ' +
                'Both PIPEDRIVE_COMPANY_DOMAIN and PIPEDRIVE_API_TOKEN must be set.\n' +
                'Example: PIPEDRIVE_COMPANY_DOMAIN=mycompany PIPEDRIVE_API_TOKEN=abc123');
        }
        this.baseUrl = `https://${domain}.pipedrive.com/v1`;
        this.apiToken = token;
    }
    buildUrl(endpoint, params) {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        url.searchParams.set('api_token', this.apiToken);
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null) {
                    url.searchParams.set(key, String(value));
                }
            }
        }
        return url.toString();
    }
    async get(endpoint, params) {
        const url = this.buildUrl(endpoint, params);
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        return this.parseResponse(response);
    }
    async post(endpoint, body) {
        const url = this.buildUrl(endpoint);
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
        return this.parseResponse(response);
    }
    async put(endpoint, body) {
        const url = this.buildUrl(endpoint);
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
        return this.parseResponse(response);
    }
    async patch(endpoint, body) {
        const url = this.buildUrl(endpoint);
        const response = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
        return this.parseResponse(response);
    }
    async delete(endpoint) {
        const url = this.buildUrl(endpoint);
        const response = await fetch(url, {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
        });
        return this.parseResponse(response);
    }
    async parseResponse(response) {
        let data;
        try {
            data = await response.json();
        }
        catch {
            throw new PipedriveError(response.status, `Failed to parse API response (HTTP ${response.status}): ${response.statusText}`);
        }
        const parsed = data;
        if (!response.ok || !parsed.success) {
            throw new PipedriveError(response.status, parsed.error ?? `API request failed with status ${response.status}`, parsed.error_info);
        }
        return parsed;
    }
}
exports.PipedriveClient = PipedriveClient;
// ─── Shared Utilities ────────────────────────────────────────────────────────
/** Zod raw shape for pagination parameters — spread into list tool input shapes */
exports.paginationShape = {
    limit: zod_1.z
        .number()
        .int()
        .min(1)
        .max(constants_1.MAX_LIMIT)
        .default(constants_1.DEFAULT_LIMIT)
        .describe(`Maximum results to return (1–${constants_1.MAX_LIMIT}, default: ${constants_1.DEFAULT_LIMIT})`),
    start: zod_1.z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Pagination offset — number of results to skip (default: 0)'),
};
/** Truncate a response string if it exceeds CHARACTER_LIMIT */
function truncateText(text, hint = 'Use pagination or filters to narrow results.') {
    if (text.length <= constants_1.CHARACTER_LIMIT)
        return text;
    return text.slice(0, constants_1.CHARACTER_LIMIT) + `\n\n[Response truncated. ${hint}]`;
}
function handlePipedriveError(error, context) {
    let message;
    if (error instanceof PipedriveError) {
        const info = error.errorInfo ? ` (${error.errorInfo})` : '';
        switch (error.statusCode) {
            case 401:
                message =
                    `Authentication failed. Verify your PIPEDRIVE_API_TOKEN is correct and active.\n` +
                        `Details: ${error.message}${info}`;
                break;
            case 403:
                message =
                    `Permission denied for ${context}. Your API token may lack required permissions.\n` +
                        `Details: ${error.message}${info}`;
                break;
            case 404:
                message =
                    `Not found: ${context}. Verify the ID is correct and the resource hasn't been deleted.\n` +
                        `Details: ${error.message}${info}`;
                break;
            case 422:
                message =
                    `Validation error for ${context}. Check required fields and data formats.\n` +
                        `Details: ${error.message}${info}`;
                break;
            case 429:
                message =
                    `Rate limit exceeded during ${context}. Pipedrive allows ~80 requests/2 seconds.\n` +
                        `Please wait a moment and retry.`;
                break;
            default:
                message = `Pipedrive API error (HTTP ${error.statusCode}) for ${context}: ${error.message}${info}`;
        }
    }
    else if (error instanceof Error) {
        message = `Error during ${context}: ${error.message}`;
    }
    else {
        message = `Unknown error during ${context}: ${String(error)}`;
    }
    return {
        isError: true,
        content: [{ type: 'text', text: message }],
    };
}
//# sourceMappingURL=pipedrive.js.map