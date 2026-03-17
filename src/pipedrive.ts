import { z } from 'zod';
import { PipedriveResponse } from './types';
import { CHARACTER_LIMIT, DEFAULT_LIMIT, MAX_LIMIT } from './constants';

// ─── Error Class ─────────────────────────────────────────────────────────────

export class PipedriveError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errorInfo?: string
  ) {
    super(message);
    this.name = 'PipedriveError';
  }
}

// ─── API Client ──────────────────────────────────────────────────────────────

type QueryParams = Record<string, string | number | boolean | undefined | null>;

export class PipedriveClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;

  constructor() {
    const domain = process.env.PIPEDRIVE_COMPANY_DOMAIN;
    const token = process.env.PIPEDRIVE_API_TOKEN;

    if (!domain || !token) {
      throw new Error(
        'Missing required environment variables. ' +
        'Both PIPEDRIVE_COMPANY_DOMAIN and PIPEDRIVE_API_TOKEN must be set.\n' +
        'Example: PIPEDRIVE_COMPANY_DOMAIN=mycompany PIPEDRIVE_API_TOKEN=abc123'
      );
    }

    this.baseUrl = `https://${domain}.pipedrive.com/v1`;
    this.apiToken = token;
  }

  private buildUrl(endpoint: string, params?: QueryParams): string {
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

  async get<T>(endpoint: string, params?: QueryParams): Promise<PipedriveResponse<T>> {
    const url = this.buildUrl(endpoint, params);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return this.parseResponse<T>(response);
  }

  async post<T>(endpoint: string, body: Record<string, unknown>): Promise<PipedriveResponse<T>> {
    const url = this.buildUrl(endpoint);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parseResponse<T>(response);
  }

  async put<T>(endpoint: string, body: Record<string, unknown>): Promise<PipedriveResponse<T>> {
    const url = this.buildUrl(endpoint);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parseResponse<T>(response);
  }

  async patch<T>(endpoint: string, body: Record<string, unknown>): Promise<PipedriveResponse<T>> {
    const url = this.buildUrl(endpoint);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parseResponse<T>(response);
  }

  async delete<T>(endpoint: string): Promise<PipedriveResponse<T>> {
    const url = this.buildUrl(endpoint);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<PipedriveResponse<T>> {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new PipedriveError(
        response.status,
        `Failed to parse API response (HTTP ${response.status}): ${response.statusText}`
      );
    }

    const parsed = data as PipedriveResponse<T>;

    if (!response.ok || !parsed.success) {
      throw new PipedriveError(
        response.status,
        parsed.error ?? `API request failed with status ${response.status}`,
        parsed.error_info
      );
    }

    return parsed;
  }
}

// ─── Shared Utilities ────────────────────────────────────────────────────────

/** Zod raw shape for pagination parameters — spread into list tool input shapes */
export const paginationShape = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`Maximum results to return (1–${MAX_LIMIT}, default: ${DEFAULT_LIMIT})`),
  start: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Pagination offset — number of results to skip (default: 0)'),
};

/** Truncate a response string if it exceeds CHARACTER_LIMIT */
export function truncateText(text: string, hint = 'Use pagination or filters to narrow results.'): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + `\n\n[Response truncated. ${hint}]`;
}

// ─── Error Handler ───────────────────────────────────────────────────────────

type ToolErrorResult = {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
};

export function handlePipedriveError(error: unknown, context: string): ToolErrorResult {
  let message: string;

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
  } else if (error instanceof Error) {
    message = `Error during ${context}: ${error.message}`;
  } else {
    message = `Unknown error during ${context}: ${String(error)}`;
  }

  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}
