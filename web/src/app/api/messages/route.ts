import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { buildChannelUrl } from "@/lib/radar/pipeline";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("messages").select("id,prospect_id,step,lang,channel,subject,body,due_at,sent_at,created_at,prospects(name,status,best_channel,email,phone,website)").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({
    messages: (data ?? []).map((message) => ({
      ...message,
      channel_url: buildChannelUrl(message),
    })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const payload = await request.json() as { id?: string; action?: "mark_sent" | "mark_unsent" };
  if (!payload.id || !payload.action) return NextResponse.json({ detail: "Invalid message update" }, { status: 400 });
  const admin = createAdminClient();
  const updates = payload.action === "mark_sent" ? { sent_at: new Date().toISOString() } : { sent_at: null };
  const { data: message, error } = await admin.from("messages").update(updates).eq("id", payload.id).eq("tenant_id", auth.profile.tenant_id).select("id,prospect_id,sent_at").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  const prospectStatus = payload.action === "mark_sent" ? "sent" : "approved";
  const { error: prospectError } = await admin.from("prospects").update({ status: prospectStatus }).eq("id", message.prospect_id).eq("tenant_id", auth.profile.tenant_id);
  if (prospectError) return NextResponse.json({ detail: prospectError.message }, { status: 502 });
  return NextResponse.json({ message, prospect_status: prospectStatus });
}
