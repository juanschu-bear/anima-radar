import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { buildChannelUrl } from "@/lib/radar/pipeline";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("messages").select("id,prospect_id,step,lang,channel,subject,body,due_at,sent_at,created_at,edited,prospects(name,status,best_channel,email,phone,website,instagram,country)").eq("tenant_id", auth.profile.tenant_id).order("step", { ascending: true }).order("created_at", { ascending: false }).limit(200);
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
  const payload = await request.json() as { id?: string; action?: "mark_sent" | "mark_unsent" | "save_draft"; subject?: string | null; body?: string };
  if (!payload.id || !payload.action) return NextResponse.json({ detail: "Invalid message update" }, { status: 400 });
  const admin = createAdminClient();
  if (payload.action === "save_draft") {
    if (typeof payload.body !== "string" || payload.body.trim().length < 12) return NextResponse.json({ detail: "Message body is too short" }, { status: 400 });
    const { data: message, error } = await admin
      .from("messages")
      .update({
        subject: typeof payload.subject === "string" ? payload.subject.trim() || null : null,
        body: payload.body.trim(),
        edited: true,
      })
      .eq("id", payload.id)
      .eq("tenant_id", auth.profile.tenant_id)
      .select("id,prospect_id,step,lang,channel,subject,body,due_at,sent_at,created_at,edited")
      .single();
    if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
    return NextResponse.json({ message });
  }
  const updates = payload.action === "mark_sent" ? { sent_at: new Date().toISOString() } : { sent_at: null };
  const { data: message, error } = await admin.from("messages").update(updates).eq("id", payload.id).eq("tenant_id", auth.profile.tenant_id).select("id,prospect_id,sent_at").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  const prospectStatus = payload.action === "mark_sent" ? "sent" : "approved";
  const { error: prospectError } = await admin.from("prospects").update({ status: prospectStatus }).eq("id", message.prospect_id).eq("tenant_id", auth.profile.tenant_id);
  if (prospectError) return NextResponse.json({ detail: prospectError.message }, { status: 502 });
  return NextResponse.json({ message, prospect_status: prospectStatus });
}
