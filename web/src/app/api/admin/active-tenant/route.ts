import { NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { deriveWorkspaceReadiness } from "@/lib/workspace-readiness";

export async function POST(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  if (!isPlatformAdmin(auth.profile)) {
    return NextResponse.json({ detail: "Platform admin access required" }, { status: 403 });
  }
  const { tenant_id: tenantId, copy_profile_from: copyProfileFrom } = await request.json() as { tenant_id?: string; copy_profile_from?: string };
  if (!tenantId) return NextResponse.json({ detail: "Company is required" }, { status: 400 });
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id,name").eq("id", tenantId).maybeSingle();
  if (!tenant) return NextResponse.json({ detail: "Company not found" }, { status: 404 });
  let profileCopied = false;
  if (copyProfileFrom && copyProfileFrom !== tenant.id) {
    const [{ data: sourceProfile }, { data: targetProfile }] = await Promise.all([
      admin.from("business_profiles").select("raw_answers,version").eq("tenant_id", copyProfileFrom).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("business_profiles").select("id").eq("tenant_id", tenant.id).limit(1).maybeSingle(),
    ]);
    if (!sourceProfile) return NextResponse.json({ detail: "The current company has no Business DNA to copy" }, { status: 400 });
    if (!targetProfile) {
      const { error: copyError } = await admin.from("business_profiles").insert({ tenant_id: tenant.id, raw_answers: sourceProfile.raw_answers, version: sourceProfile.version });
      if (copyError) return NextResponse.json({ detail: copyError.message }, { status: 502 });
      profileCopied = true;
    }
  }
  const { error } = await admin.from("users").update({ tenant_id: tenant.id }).eq("id", auth.user.id);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  const [profiles, scans, prospects, outcomes] = await Promise.all([
    admin.from("business_profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    admin.from("scans").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    admin.from("prospects").select("id,status").eq("tenant_id", tenant.id),
    admin.from("outcomes").select("id,kind").eq("tenant_id", tenant.id),
  ]);

  const prospectRows = prospects.data ?? [];
  const outcomeRows = outcomes.data ?? [];
  const metrics = {
    profiles: profiles.count ?? 0,
    scans: scans.count ?? 0,
    prospects: prospectRows.length,
    approved: prospectRows.filter((row) => row.status === "approved").length,
    sent: prospectRows.filter((row) => ["sent", "replied", "converted", "lost"].includes(row.status)).length,
    outcomes: outcomeRows.length,
    positive_replies: outcomeRows.filter((row) => row.kind === "replied_positive").length,
  };

  return NextResponse.json({
    tenant: {
      ...tenant,
      has_profile: metrics.profiles > 0,
      metrics,
      workspace_readiness: deriveWorkspaceReadiness(metrics),
    },
    profile_copied: profileCopied,
  });
}
