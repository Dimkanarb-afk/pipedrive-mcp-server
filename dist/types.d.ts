export interface PaginationInfo {
    start: number;
    limit: number;
    more_items_in_collection: boolean;
    next_start?: number;
}
export interface PipedriveResponse<T> {
    success: boolean;
    data: T;
    error?: string;
    error_info?: string;
    additional_data?: {
        pagination?: PaginationInfo;
    };
}
export interface SearchItem<T> {
    result_score: number;
    item: T;
}
export interface SearchData<T> {
    items: Array<SearchItem<T>>;
}
export interface DealPersonRef {
    value: number;
    name: string;
    email?: Array<{
        value: string;
        primary: boolean;
    }>;
    phone?: Array<{
        value: string;
        primary: boolean;
    }>;
}
export interface DealOrgRef {
    value: number;
    name: string;
    address?: string;
}
export interface DealUserRef {
    id: number;
    name: string;
    email: string;
}
export interface Deal {
    [key: string]: unknown;
    id: number;
    title: string;
    value: number | null;
    currency: string;
    status: 'open' | 'won' | 'lost' | 'deleted';
    stage_id: number;
    pipeline_id: number;
    person_id: DealPersonRef | null;
    org_id: DealOrgRef | null;
    user_id: DealUserRef;
    expected_close_date: string | null;
    add_time: string;
    update_time: string;
    close_time: string | null;
    won_time: string | null;
    lost_time: string | null;
    weighted_value: number;
    lost_reason: string | null;
    probability: number | null;
    activities_count: number;
    notes_count: number;
}
export interface DealSearchResult {
    id: number;
    type: string;
    title: string;
    value: number;
    currency: string;
    status: string;
    visible_to: string;
    owner: {
        id: number;
    };
    stage: {
        id: number;
        name: string;
    };
    person: {
        id: number;
        name: string;
    } | null;
    organization: {
        id: number;
        name: string;
    } | null;
}
export interface EmailField {
    value: string;
    primary: boolean;
    label: string;
}
export interface PhoneField {
    value: string;
    primary: boolean;
    label: string;
}
export interface Person {
    [key: string]: unknown;
    id: number;
    name: string;
    first_name: string;
    last_name: string;
    email: EmailField[];
    phone: PhoneField[];
    org_id: {
        value: number;
        name: string;
        address?: string;
    } | null;
    owner_id: {
        id: number;
        name: string;
        email: string;
    };
    add_time: string;
    update_time: string;
    open_deals_count: number;
    closed_deals_count: number;
    won_deals_count: number;
    lost_deals_count: number;
    activities_count: number;
    notes_count: number;
    visible_to: string;
}
export interface PersonSearchResult {
    id: number;
    type: string;
    name: string;
    phones: string[];
    emails: string[];
    visible_to: string;
    owner: {
        id: number;
    };
    organization: {
        id: number;
        name: string;
    } | null;
}
export interface Organization {
    [key: string]: unknown;
    id: number;
    name: string;
    address: string | null;
    address_street_number: string | null;
    address_route: string | null;
    address_sublocality: string | null;
    address_locality: string | null;
    address_admin_area_level_1: string | null;
    address_country: string | null;
    owner_id: {
        id: number;
        name: string;
        email: string;
    };
    add_time: string;
    update_time: string;
    open_deals_count: number;
    closed_deals_count: number;
    people_count: number;
    activities_count: number;
    notes_count: number;
    visible_to: string;
}
export interface OrganizationSearchResult {
    id: number;
    type: string;
    name: string;
    address: string | null;
    visible_to: string;
    owner: {
        id: number;
    };
}
export interface Activity {
    [key: string]: unknown;
    id: number;
    type: string;
    subject: string;
    done: boolean;
    due_date: string;
    due_time: string | null;
    duration: string | null;
    deal_id: number | null;
    person_id: number | null;
    org_id: number | null;
    user_id: number;
    note: string | null;
    add_time: string;
    update_time: string;
    marked_as_done_time: string | null;
    created_by_user_id: number;
    owner_name: string;
    deal_title: string | null;
    person_name: string | null;
    org_name: string | null;
}
export interface Note {
    [key: string]: unknown;
    id: number;
    content: string;
    deal_id: number | null;
    person_id: number | null;
    org_id: number | null;
    user_id: number;
    add_time: string;
    update_time: string;
    active_flag: boolean;
    pinned_to_deal_flag: boolean;
    pinned_to_person_flag: boolean;
    pinned_to_organization_flag: boolean;
    deal?: {
        title: string;
    };
    person?: {
        name: string;
    };
    org?: {
        name: string;
    };
    user?: {
        name: string;
        email: string;
    };
}
export interface Pipeline {
    [key: string]: unknown;
    id: number;
    name: string;
    url_title: string;
    order_nr: number;
    active: boolean;
    deal_probability: boolean;
    add_time: string;
    update_time: string;
}
export interface Stage {
    [key: string]: unknown;
    id: number;
    name: string;
    pipeline_id: number;
    pipeline_name: string;
    order_nr: number;
    active_flag: boolean;
    deal_probability: number;
    rotten_flag: boolean;
    rotten_days: number | null;
    add_time: string;
    update_time: string;
}
//# sourceMappingURL=types.d.ts.map