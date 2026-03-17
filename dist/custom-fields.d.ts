import { PipedriveClient } from './pipedrive';
export interface PipedriveFieldDef {
    id: number;
    key: string;
    name: string;
    field_type: string;
    options?: Array<{
        id: number;
        label: string;
    }>;
}
export type EntityType = 'deal' | 'person' | 'organization';
/**
 * Resolves custom field keys (40-char hex hashes) to human-readable names.
 * Returns the original data plus a `custom_fields` object with resolved values.
 * If no custom fields are found, returns data unchanged.
 */
export declare function resolveCustomFields(client: PipedriveClient, data: Record<string, unknown>, entityType: EntityType): Promise<Record<string, unknown>>;
/** Clear the field definitions cache (useful for testing or after field changes) */
export declare function clearFieldCache(): void;
//# sourceMappingURL=custom-fields.d.ts.map