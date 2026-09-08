import { NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

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
  return NextResponse.json({ tenant, profile_copied: profileCopied });
}
