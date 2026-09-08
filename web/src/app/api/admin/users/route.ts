import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

const LOGIN_DOMAIN = process.env.LOGIN_DOMAIN ?? "animaradar.com";

function slugify(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, ""); }
function generatePassword() { return `AR-${randomBytes(12).toString("base64url")}-a7`; }

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  if (auth.profile.platform_admin !== true) return NextResponse.json({ detail: "Platform admin access required" }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("users").select("id,tenant_id,email,full_name,role,must_change_password").order("full_name", { ascending: true });
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  const { data: actor, error: actorError } = await supabase.from("users").select("tenant_id,role").eq("id", user.id).maybeSingle();
  if (actorError || !actor || actor.role !== "owner") return NextResponse.json({ detail: "Only the workspace owner can create users" }, { status: 403 });
  const payload = await request.json() as { full_name?: string; tenant_id?: string };
  const fullName = String(payload.full_name ?? "").trim();
  if (fullName.length < 2) return NextResponse.json({ detail: "Full name is required" }, { status: 400 });
  const base = slugify(fullName);
  if (!base) return NextResponse.json({ detail: "Full name must contain letters or numbers" }, { status: 400 });
  const admin = createAdminClient();
  const tenantId = payload.tenant_id ?? actor.tenant_id;
  const { data: targetTenant } = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!targetTenant) return NextResponse.json({ detail: "Selected company does not exist" }, { status: 400 });
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const login = `${base}${attempt === 0 ? "" : `.${attempt + 1}`}@${LOGIN_DOMAIN}`;
    const temporaryPassword = generatePassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email: login, password: temporaryPassword, email_confirm: true, user_metadata: { full_name: fullName, provisioned_internally: true } });
    if (createError) { if (createError.message.toLowerCase().includes("already registered") || createError.message.toLowerCase().includes("already exists")) continue; return NextResponse.json({ detail: createError.message }, { status: 502 }); }
    if (!created.user) return NextResponse.json({ detail: "Supabase did not return the created user" }, { status: 502 });
    const { error: profileError } = await admin.from("users").insert({ id: created.user.id, tenant_id: tenantId, email: login, full_name: fullName, role: "member", must_change_password: true });
    if (profileError) { await admin.auth.admin.deleteUser(created.user.id); return NextResponse.json({ detail: profileError.message }, { status: 502 }); }
    return NextResponse.json({ login, temporary_password: temporaryPassword, full_name: fullName }, { status: 201 });
  }
  return NextResponse.json({ detail: "Could not generate a unique login ID" }, { status: 409 });
}
