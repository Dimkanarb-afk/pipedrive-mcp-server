import { z } from 'zod';
import { PipedriveResponse } from './types';
export declare class PipedriveError extends Error {
    readonly statusCode: number;
    readonly errorInfo?: string | undefined;
    constructor(statusCode: number, message: string, errorInfo?: string | undefined);
}
type QueryParams = Record<string, string | number | boolean | undefined | null>;
export declare class PipedriveClient {
    private readonly baseUrl;
    private readonly apiToken;
    constructor();
    private buildUrl;
    get<T>(endpoint: string, params?: QueryParams): Promise<PipedriveResponse<T>>;
    post<T>(endpoint: string, body: Record<string, unknown>): Promise<PipedriveResponse<T>>;
    put<T>(endpoint: string, body: Record<string, unknown>): Promise<PipedriveResponse<T>>;
    patch<T>(endpoint: string, body: Record<string, unknown>): Promise<PipedriveResponse<T>>;
    delete<T>(endpoint: string): Promise<PipedriveResponse<T>>;
    private parseResponse;
}
/** Zod raw shape for pagination parameters — spread into list tool input shapes */
export declare const paginationShape: {
    limit: z.ZodDefault<z.ZodNumber>;
    start: z.ZodDefault<z.ZodNumber>;
};
/** Truncate a response string if it exceeds CHARACTER_LIMIT */
export declare function truncateText(text: string, hint?: string): string;
type ToolErrorResult = {
    isError: true;
    content: Array<{
        type: 'text';
        text: string;
    }>;
    [key: string]: unknown;
};
export declare function handlePipedriveError(error: unknown, context: string): ToolErrorResult;
export {};
//# sourceMappingURL=pipedrive.d.ts.map