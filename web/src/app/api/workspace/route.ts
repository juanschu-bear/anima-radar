import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("tenants").select("id,name,default_market_lang,created_at").eq("id", auth.profile.tenant_id).single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ tenant: data });
}

export async function PATCH(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  if (auth.profile.role !== "owner" && auth.profile.platform_admin !== true) return NextResponse.json({ detail: "Owner access required" }, { status: 403 });
  const payload = await request.json() as { name?: string; default_market_lang?: string };
  const updates: { name?: string; default_market_lang?: string } = {};
  if (typeof payload.name === "string" && payload.name.trim().length >= 2) updates.name = payload.name.trim();
  if (payload.default_market_lang === "en" || payload.default_market_lang === "es") updates.default_market_lang = payload.default_market_lang;
  if (!Object.keys(updates).length) return NextResponse.json({ detail: "No valid changes supplied" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("tenants").update(updates).eq("id", auth.profile.tenant_id).select("id,name,default_market_lang,created_at").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ tenant: data });
}
