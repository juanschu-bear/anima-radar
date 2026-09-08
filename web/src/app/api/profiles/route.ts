import { NextResponse } from "next/server";
import { isCompanyAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("business_profiles").select("id,raw_answers,version,created_at").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ profile: data ?? null, tenant_id: auth.profile.tenant_id, can_edit: isCompanyAdmin(auth.profile) });
}

export async function POST(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  if (!isCompanyAdmin(auth.profile)) {
    return NextResponse.json({ detail: "Only a company admin can update Business DNA" }, { status: 403 });
  }
  const payload = await request.json() as { answers?: Record<string, string>; market_lang?: string; tenant_tone?: string };
  const answers = payload.answers ?? {};
  if (Object.values(answers).some((value) => typeof value !== "string")) return NextResponse.json({ detail: "Invalid profile answers" }, { status: 400 });
  const admin = createAdminClient();
  const { data: existing } = await admin.from("business_profiles").select("id,version").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const raw = { ...answers, market_lang: payload.market_lang ?? "en", tenant_tone: payload.tenant_tone ?? "concrete and respectful" };
  const query = existing
    ? admin.from("business_profiles").update({ raw_answers: raw, version: existing.version + 1 }).eq("id", existing.id)
    : admin.from("business_profiles").insert({ tenant_id: auth.profile.tenant_id, raw_answers: raw });
  const { data, error } = await query.select("id,version,created_at").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json(data, { status: existing ? 200 : 201 });
}
