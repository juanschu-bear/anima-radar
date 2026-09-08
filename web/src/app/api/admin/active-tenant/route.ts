import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

export async function POST(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  if (auth.profile.platform_admin !== true) {
    return NextResponse.json({ detail: "Platform admin access required" }, { status: 403 });
  }
  const { tenant_id: tenantId } = await request.json() as { tenant_id?: string };
  if (!tenantId) return NextResponse.json({ detail: "Company is required" }, { status: 400 });
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id,name").eq("id", tenantId).maybeSingle();
  if (!tenant) return NextResponse.json({ detail: "Company not found" }, { status: 404 });
  const { error } = await admin.from("users").update({ tenant_id: tenant.id }).eq("id", auth.user.id);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ tenant });
}
