import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveWorkspaceReadiness } from "@/lib/workspace-readiness";

const CONTACTED_STATUSES = new Set(["sent", "replied", "converted", "lost"]);

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ detail: "Authentication required" }, { status: 401 }) };
  const { data: actor, error } = await supabase.from("users").select("tenant_id,platform_admin,role").eq("id", user.id).maybeSingle();
  if (error || !actor || actor.platform_admin !== true) return { error: NextResponse.json({ detail: "Platform admin access required" }, { status: 403 }) };
  return { admin: createAdminClient(), actor, userId: user.id };
}

export async function GET() {
  const auth = await requirePlatformAdmin();
  if (auth.error) return auth.error;
  const [{ data, error }, { data: profiles }, { data: scans }, { data: prospects }, { data: outcomes }] = await Promise.all([
    auth.admin.from("tenants").select("id,name,default_market_lang,created_at").order("created_at", { ascending: true }),
    auth.admin.from("business_profiles").select("tenant_id"),
    auth.admin.from("scans").select("tenant_id,status"),
    auth.admin.from("prospects").select("tenant_id,status"),
    auth.admin.from("outcomes").select("tenant_id,kind"),
  ]);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  const profileCounts = countByTenant(profiles ?? []);
  const scanCounts = countByTenant(scans ?? []);
  const outcomeCounts = countByTenant(outcomes ?? []);
  const positiveReplies = countByTenant((outcomes ?? []).filter((row) => row.kind === "replied_positive"));
  const prospectCounts = countByTenant(prospects ?? []);
  const approvedProspects = countByTenant((prospects ?? []).filter((row) => row.status === "approved"));
  const sentProspects = countByTenant((prospects ?? []).filter((row) => CONTACTED_STATUSES.has(row.status)));
  return NextResponse.json({
    tenants: (data ?? []).map((tenant) => {
      const metrics = {
        profiles: profileCounts.get(tenant.id) ?? 0,
        scans: scanCounts.get(tenant.id) ?? 0,
        prospects: prospectCounts.get(tenant.id) ?? 0,
        approved: approvedProspects.get(tenant.id) ?? 0,
        sent: sentProspects.get(tenant.id) ?? 0,
        outcomes: outcomeCounts.get(tenant.id) ?? 0,
        positive_replies: positiveReplies.get(tenant.id) ?? 0,
      };
      return {
        ...tenant,
        has_profile: metrics.profiles > 0,
        metrics,
        workspace_readiness: deriveWorkspaceReadiness(metrics),
      };
    }),
    active_tenant_id: auth.actor.tenant_id,
  });
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if (auth.error) return auth.error;
  const payload = await request.json() as { name?: string; default_market_lang?: string };
  const name = String(payload.name ?? "").trim();
  if (name.length < 2) return NextResponse.json({ detail: "Company name is required" }, { status: 400 });
  const { data, error } = await auth.admin.from("tenants").insert({ name, default_market_lang: payload.default_market_lang ?? "en-CA" }).select("id,name,default_market_lang,created_at").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  const { error: activationError } = await auth.admin.from("users").update({ tenant_id: data.id }).eq("id", auth.userId);
  if (activationError) {
    await auth.admin.from("tenants").delete().eq("id", data.id);
    return NextResponse.json({ detail: "The company could not be activated. Nothing was created." }, { status: 502 });
  }
  const metrics = {
    profiles: 0,
    scans: 0,
    prospects: 0,
    approved: 0,
    sent: 0,
    outcomes: 0,
    positive_replies: 0,
  };
  return NextResponse.json({
    tenant: {
      ...data,
      has_profile: false,
      metrics,
      workspace_readiness: deriveWorkspaceReadiness(metrics),
    },
    active_tenant_id: data.id,
  }, { status: 201 });
}

function countByTenant(rows: Array<{ tenant_id: string }>) {
  return rows.reduce((map, row) => {
    map.set(row.tenant_id, (map.get(row.tenant_id) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
}
