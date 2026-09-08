import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ detail: "Authentication required" }, { status: 401 }) };
  const { data: actor, error } = await supabase.from("users").select("tenant_id,platform_admin,role").eq("id", user.id).maybeSingle();
  if (error || !actor || (actor.platform_admin !== true && actor.role !== "owner")) return { error: NextResponse.json({ detail: "Platform admin access required" }, { status: 403 }) };
  return { admin: createAdminClient(), actor, userId: user.id };
}

export async function GET() {
  const auth = await requirePlatformAdmin();
  if (auth.error) return auth.error;
  const [{ data, error }, { data: profiles }] = await Promise.all([
    auth.admin.from("tenants").select("id,name,default_market_lang,created_at").order("created_at", { ascending: true }),
    auth.admin.from("business_profiles").select("tenant_id"),
  ]);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  const configured = new Set((profiles ?? []).map((profile) => profile.tenant_id));
  return NextResponse.json({ tenants: (data ?? []).map((tenant) => ({ ...tenant, has_profile: configured.has(tenant.id) })), active_tenant_id: auth.actor.tenant_id });
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
  return NextResponse.json({ tenant: { ...data, has_profile: false }, active_tenant_id: data.id }, { status: 201 });
}
