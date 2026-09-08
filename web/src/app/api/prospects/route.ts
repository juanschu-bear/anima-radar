import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("prospects").select("id,name,category,address,city,country,website,phone,email,instagram,rating,review_count,score,score_reasons,best_channel,status,created_at").eq("tenant_id", auth.profile.tenant_id).order("score", { ascending: false, nullsFirst: false }).limit(100);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ prospects: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const { id, status } = await request.json() as { id?: string; status?: string };
  if (!id || !["new", "approved", "discarded"].includes(status ?? "")) return NextResponse.json({ detail: "Invalid prospect update" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("prospects").update({ status }).eq("id", id).eq("tenant_id", auth.profile.tenant_id).select("id,status").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ prospect: data });
}
