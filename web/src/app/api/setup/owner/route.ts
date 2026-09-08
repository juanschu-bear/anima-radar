import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const LOGIN_DOMAIN = process.env.LOGIN_DOMAIN ?? "animaradar.com";

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
}

export async function GET() {
  const admin = createAdminClient();
  const { count, error } = await admin.from("tenants").select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ can_setup: (count ?? 0) === 0, login_domain: LOGIN_DOMAIN });
}

export async function POST(request: Request) {
  const payload = await request.json() as { full_name?: string; workspace_name?: string; password?: string };
  const fullName = String(payload.full_name ?? "").trim(); const workspaceName = String(payload.workspace_name ?? "").trim(); const password = String(payload.password ?? "");
  if (fullName.length < 2 || workspaceName.length < 2) return NextResponse.json({ detail: "Full name and workspace name are required" }, { status: 400 });
  if (password.length < 10) return NextResponse.json({ detail: "Password must contain at least 10 characters" }, { status: 400 });
  const base = slugify(fullName); if (!base) return NextResponse.json({ detail: "Full name must contain letters or numbers" }, { status: 400 });
  const admin = createAdminClient();
  const { count, error: countError } = await admin.from("tenants").select("id", { count: "exact", head: true });
  if (countError) return NextResponse.json({ detail: countError.message }, { status: 502 });
  if ((count ?? 0) > 0) return NextResponse.json({ detail: "The initial admin setup is already complete. Ask the existing owner to provision access." }, { status: 409 });
  const login = `${base}@${LOGIN_DOMAIN}`;
  const { data: created, error: userError } = await admin.auth.admin.createUser({ email: login, password, email_confirm: true, user_metadata: { full_name: fullName, provisioned_internally: true } });
  if (userError || !created.user) return NextResponse.json({ detail: userError?.message ?? "Could not create owner account" }, { status: 502 });
  const { data: tenant, error: tenantError } = await admin.from("tenants").insert({ name: workspaceName, default_market_lang: "en-CA" }).select("id").single();
  if (tenantError || !tenant) { await admin.auth.admin.deleteUser(created.user.id); return NextResponse.json({ detail: tenantError?.message ?? "Could not create workspace" }, { status: 502 }); }
  const { error: profileError } = await admin.from("users").insert({ id: created.user.id, tenant_id: tenant.id, email: login, full_name: fullName, role: "owner", platform_admin: true, must_change_password: false });
  if (profileError) { await admin.from("tenants").delete().eq("id", tenant.id); await admin.auth.admin.deleteUser(created.user.id); return NextResponse.json({ detail: profileError.message }, { status: 502 }); }
  return NextResponse.json({ login, full_name: fullName }, { status: 201 });
}
