import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { loadLatestTenantScan } from "@/lib/scan-queries";
import { deriveWorkspaceReadiness } from "@/lib/workspace-readiness";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const tenantId = auth.profile.tenant_id;
  const [tenant, profiles, scans, prospects, activeProspects, approvedProspects, sentProspects, replies, meetings, orders, messages, outcomes, latestScan] = await Promise.all([
    admin.from("tenants").select("id,name,default_market_lang").eq("id", tenantId).single(),
    admin.from("business_profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("scans").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["new", "approved"]),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "approved"),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "sent"),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "replied_positive"),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "meeting"),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "order"),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    loadLatestTenantScan(admin, tenantId),
  ]);

  if (tenant.error) return NextResponse.json({ detail: tenant.error.message }, { status: 502 });
  if (latestScan.error) return NextResponse.json({ detail: latestScan.error.message }, { status: 502 });

  const counts = {
    scans: scans.count ?? 0,
    profiles: profiles.count ?? 0,
    prospects: prospects.count ?? 0,
    active_prospects: activeProspects.count ?? 0,
    approved_prospects: approvedProspects.count ?? 0,
    sent_prospects: sentProspects.count ?? 0,
    positive_replies: replies.count ?? 0,
    meetings: meetings.count ?? 0,
    orders: orders.count ?? 0,
    messages: messages.count ?? 0,
    outcomes: outcomes.count ?? 0,
  };

  return NextResponse.json({
    tenant: tenant.data,
    counts,
    workspace_readiness: deriveWorkspaceReadiness({
      profiles: counts.profiles,
      scans: counts.scans,
      prospects: counts.prospects,
      approved: counts.approved_prospects,
      sent: counts.sent_prospects,
      outcomes: counts.outcomes,
      positive_replies: counts.positive_replies,
    }),
    latest_scan: latestScan.latestScan,
    compatibility: {
      scans_created_at_fallback: latestScan.usedCreatedAtFallback,
    },
  });
}
