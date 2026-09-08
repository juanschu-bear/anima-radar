import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

type ScanRow = {
  id: string;
  city: string;
  country: string;
  radius_m: number;
  categories?: string[] | null;
  sources?: string[] | null;
  status: string;
  counts?: Record<string, number> | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
};

export type ScanRecord = {
  id: string;
  city: string;
  country: string;
  radius_m: number;
  categories: string[];
  sources: string[];
  status: string;
  counts: Record<string, number>;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};

type ScanQueryResult = {
  data: ScanRecord[];
  usedCreatedAtFallback: boolean;
  error: PostgrestError | null;
};

function normalizeScan(row: ScanRow): ScanRecord {
  return {
    id: row.id,
    city: row.city,
    country: row.country,
    radius_m: row.radius_m,
    categories: Array.isArray(row.categories) ? row.categories : [],
    sources: Array.isArray(row.sources) ? row.sources : [],
    status: row.status,
    counts: row.counts ?? {},
    created_at: row.created_at ?? row.started_at ?? row.finished_at ?? null,
    started_at: row.started_at ?? null,
    finished_at: row.finished_at ?? null,
    error: row.error ?? null,
  };
}

function isMissingCreatedAt(error: PostgrestError | null) {
  return Boolean(error?.message && /created_at/i.test(error.message));
}

export async function listTenantScans(admin: SupabaseClient, tenantId: string, limit = 50): Promise<ScanQueryResult> {
  const primary = await admin
    .from("scans")
    .select("id,city,country,radius_m,categories,sources,status,counts,created_at,started_at,finished_at,error")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!primary.error) {
    return {
      data: (primary.data ?? []).map((row) => normalizeScan(row as ScanRow)),
      usedCreatedAtFallback: false,
      error: null,
    };
  }

  if (!isMissingCreatedAt(primary.error)) {
    return { data: [], usedCreatedAtFallback: false, error: primary.error };
  }

  const fallback = await admin
    .from("scans")
    .select("id,city,country,radius_m,categories,sources,status,counts,started_at,finished_at,error")
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (fallback.error) {
    return { data: [], usedCreatedAtFallback: true, error: fallback.error };
  }

  return {
    data: (fallback.data ?? []).map((row) => normalizeScan(row as ScanRow)),
    usedCreatedAtFallback: true,
    error: null,
  };
}

export async function loadLatestTenantScan(admin: SupabaseClient, tenantId: string) {
  const result = await listTenantScans(admin, tenantId, 1);
  return {
    latestScan: result.data[0] ?? null,
    usedCreatedAtFallback: result.usedCreatedAtFallback,
    error: result.error,
  };
}
