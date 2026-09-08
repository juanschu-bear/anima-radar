import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const tenantId = auth.profile.tenant_id;
  const [tenant, profiles, prospects, activeProspects, replies, messages, outcomes, scans] = await Promise.all([
    admin.from("tenants").select("id,name,default_market_lang").eq("id", tenantId).single(),
    admin.from("business_profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["new", "approved"]),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "replied_positive"),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("scans").select("id,city,country,radius_m,status,counts,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1),
  ]);
  if (tenant.error) return NextResponse.json({ detail: tenant.error.message }, { status: 502 });
  return NextResponse.json({ tenant: tenant.data, counts: { profiles: profiles.count ?? 0, prospects: prospects.count ?? 0, active_prospects: activeProspects.count ?? 0, positive_replies: replies.count ?? 0, messages: messages.count ?? 0, outcomes: outcomes.count ?? 0 }, latest_scan: scans.data?.[0] ?? null });
}
