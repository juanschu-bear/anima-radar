import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { businessEventKindFromOutcome, prospectStatusFromOutcome } from "@/lib/radar/pipeline";
import { computeRubricAdjustments } from "@/lib/rubric-adjustments";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const [{ data, error }, { data: prospects, error: prospectsError }] = await Promise.all([
    admin.from("outcomes").select("id,prospect_id,kind,note,created_at,prospects(name)").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(100),
    admin.from("prospects").select("id,name,status").eq("tenant_id", auth.profile.tenant_id).order("name", { ascending: true }),
  ]);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  if (prospectsError) return NextResponse.json({ detail: prospectsError.message }, { status: 502 });
  return NextResponse.json({ outcomes: data ?? [], prospects: prospects ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const payload = await request.json() as { prospect_id?: string; kind?: "replied_positive" | "replied_negative" | "no_reply" | "meeting" | "order" | "lost"; note?: string };
  if (!payload.prospect_id || !payload.kind) return NextResponse.json({ detail: "Prospect and outcome type are required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: prospect } = await admin.from("prospects").select("id,tenant_id").eq("id", payload.prospect_id).eq("tenant_id", auth.profile.tenant_id).maybeSingle();
  if (!prospect) return NextResponse.json({ detail: "Prospect not found" }, { status: 404 });

  const nextStatus = prospectStatusFromOutcome(payload.kind);
  const { data: outcome, error } = await admin
    .from("outcomes")
    .insert({
      tenant_id: auth.profile.tenant_id,
      prospect_id: payload.prospect_id,
      kind: payload.kind,
      note: typeof payload.note === "string" ? payload.note.trim() : null,
    })
    .select("id,prospect_id,kind,note,created_at,prospects(name)")
    .single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });

  const { error: prospectError } = await admin.from("prospects").update({ status: nextStatus }).eq("id", payload.prospect_id).eq("tenant_id", auth.profile.tenant_id);
  if (prospectError) return NextResponse.json({ detail: prospectError.message }, { status: 502 });

  await admin.from("business_events").insert({
    tenant_id: auth.profile.tenant_id,
    prospect_id: payload.prospect_id,
    kind: businessEventKindFromOutcome(payload.kind),
    note: typeof payload.note === "string" ? payload.note.trim() : null,
  });

  const [{ data: profile }, { data: learningRows, error: learningError }] = await Promise.all([
    admin.from("business_profiles").select("id,icp").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("outcomes").select("kind,prospects(category,score_reasons)").eq("tenant_id", auth.profile.tenant_id),
  ]);

  if (learningError) return NextResponse.json({ detail: learningError.message }, { status: 502 });

  if (profile?.id) {
    const adjustments = computeRubricAdjustments((learningRows ?? []) as Array<{ kind: "replied_positive" | "replied_negative" | "no_reply" | "meeting" | "order" | "lost"; prospects: { category?: string | null; score_reasons?: unknown } | null }>);
    const nextIcp = profile.icp && typeof profile.icp === "object" && !Array.isArray(profile.icp) ? { ...profile.icp, rubric_adjustments: adjustments } : { rubric_adjustments: adjustments };
    const { error: profileUpdateError } = await admin.from("business_profiles").update({ icp: nextIcp }).eq("id", profile.id);
    if (profileUpdateError) return NextResponse.json({ detail: profileUpdateError.message }, { status: 502 });
  }

  return NextResponse.json({ outcome, prospect_status: nextStatus }, { status: 201 });
}
