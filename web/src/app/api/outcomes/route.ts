import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("outcomes").select("id,prospect_id,kind,note,created_at,prospects(name)").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ outcomes: data ?? [] });
}
