import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/access";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { deriveWorkspaceReadiness } from "@/lib/workspace-readiness";

const CONTACTED_STATUSES = ["sent", "replied", "converted", "lost"] as const;

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const tenantId = auth.profile.tenant_id;

  const [profiles, scans, prospects, approvedProspects, sentProspects, messages, positiveReplies, outcomes] = await Promise.all([
    admin.from("business_profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("scans").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "approved"),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", [...CONTACTED_STATUSES]),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "replied_positive"),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);

  const workflow = {
    has_business_dna: (profiles.count ?? 0) > 0,
    scans: scans.count ?? 0,
    prospects: prospects.count ?? 0,
    approved_prospects: approvedProspects.count ?? 0,
    sent_prospects: sentProspects.count ?? 0,
    messages: messages.count ?? 0,
    outcomes: outcomes.count ?? 0,
    positive_replies: positiveReplies.count ?? 0,
  };

  return NextResponse.json({
    actor: {
      role: auth.profile.role,
      platform_admin: isPlatformAdmin(auth.profile),
      full_name: auth.profile.full_name ?? null,
    },
    providers: {
      supabase_browser: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabase_server: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      google_places: Boolean(process.env.GOOGLE_PLACES_API_KEY),
      exa: Boolean(process.env.EXA_API_KEY),
      radar_api_url: process.env.RADAR_API_URL ?? null,
      manual_prospect_fallback: true,
    },
    workflow,
    readiness: deriveWorkspaceReadiness({
      profiles: profiles.count ?? 0,
      scans: scans.count ?? 0,
      prospects: prospects.count ?? 0,
      approved: approvedProspects.count ?? 0,
      sent: sentProspects.count ?? 0,
      outcomes: outcomes.count ?? 0,
      positive_replies: positiveReplies.count ?? 0,
    }),
  });
}
