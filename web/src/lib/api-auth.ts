import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function requireWorkspaceUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ detail: "Authentication required" }, { status: 401 }) };
  const { data: profile, error } = await supabase
    .from("users")
    .select("id,tenant_id,role,platform_admin,full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile) return { error: NextResponse.json({ detail: "Workspace access not found" }, { status: 403 }) };
  return { supabase, user, profile };
}
