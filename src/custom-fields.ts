import { PipedriveClient } from './pipedrive';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipedriveFieldDef {
  id: number;
  key: string;
  name: string;
  field_type: string;
  options?: Array<{ id: number; label: string }>;
}

export type EntityType = 'deal' | 'person' | 'organization';

// ─── Cache ────────────────────────────────────────────────────────────────────

const fieldCache = new Map<EntityType, PipedriveFieldDef[]>();

const FIELD_ENDPOINTS: Record<EntityType, string> = {
  deal: '/dealFields',
  person: '/personFields',
  organization: '/organizationFields',
};

// Pipedrive custom field keys are 40-character hex strings
const CUSTOM_FIELD_KEY_PATTERN = /^[0-9a-f]{40}$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchFieldDefs(client: PipedriveClient, entityType: EntityType): Promise<PipedriveFieldDef[]> {
  if (fieldCache.has(entityType)) {
    return fieldCache.get(entityType)!;
  }

  try {
    const response = await client.get<PipedriveFieldDef[]>(FIELD_ENDPOINTS[entityType], { limit: 500 });
    const customFields = (response.data ?? []).filter(
      (f) => CUSTOM_FIELD_KEY_PATTERN.test(f.key)
    );
    fieldCache.set(entityType, customFields);
    return customFields;
  } catch {
    // If we can't fetch field defs, return empty (degrade gracefully)
    return [];
  }
}

function resolveFieldValue(field: PipedriveFieldDef, rawValue: unknown): unknown {
  if (rawValue === null || rawValue === undefined) return rawValue;

  if ((field.field_type === 'enum' || field.field_type === 'set') && field.options?.length) {
    const ids = String(rawValue).split(',').map((s) => s.trim());
    const labels = ids.map(
      (id) => field.options!.find((o) => String(o.id) === id)?.label ?? id
    );
    return labels.join(', ');
  }

  return rawValue;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Resolves custom field keys (40-char hex hashes) to human-readable names.
 * Returns the original data plus a `custom_fields` object with resolved values.
 * If no custom fields are found, returns data unchanged.
 */
export async function resolveCustomFields(
  client: PipedriveClient,
  data: Record<string, unknown>,
  entityType: EntityType
): Promise<Record<string, unknown>> {
  const fieldDefs = await fetchFieldDefs(client, entityType);
  if (fieldDefs.length === 0) return data;

  const customFields: Record<string, unknown> = {};

  for (const field of fieldDefs) {
    if (field.key in data && data[field.key] !== null && data[field.key] !== undefined) {
      customFields[field.name] = resolveFieldValue(field, data[field.key]);
    }
  }

  if (Object.keys(customFields).length === 0) return data;

  return { ...data, custom_fields: customFields };
}

/** Clear the field definitions cache (useful for testing or after field changes) */
export function clearFieldCache(): void {
  fieldCache.clear();
}
