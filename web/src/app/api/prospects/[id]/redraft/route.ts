import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { buildDraftMessage, createOrRefreshMessageDraft } from "@/lib/radar/pipeline";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;

  const { id } = await params;
  const payload = await request.json() as { instruction?: string };
  const instruction = typeof payload.instruction === "string" ? payload.instruction.trim() : "";
  if (instruction.length < 3) {
    return NextResponse.json({ detail: "A short redraft instruction is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: prospect, error: prospectError }, { data: tenant }, { data: profile }] = await Promise.all([
    admin
      .from("prospects")
      .select("id,tenant_id,scan_id,source,source_id,name,category,address,city,country,website,phone,email,instagram,rating,review_count,raw,enrichment,score,score_reasons,best_channel,status")
      .eq("tenant_id", auth.profile.tenant_id)
      .eq("id", id)
      .maybeSingle(),
    admin.from("tenants").select("id,name,default_market_lang").eq("id", auth.profile.tenant_id).maybeSingle(),
    admin.from("business_profiles").select("raw_answers").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (prospectError) return NextResponse.json({ detail: prospectError.message }, { status: 502 });
  if (!prospect) return NextResponse.json({ detail: "Prospect not found" }, { status: 404 });
  if (!tenant || !profile) return NextResponse.json({ detail: "Business DNA is required before redrafting" }, { status: 409 });

  const preview = buildDraftMessage({
    tenant,
    profileAnswers: profile.raw_answers ?? {},
    prospect: {
      id: prospect.id,
      name: prospect.name,
      city: prospect.city,
      country: prospect.country,
      category: prospect.category,
      website: prospect.website,
      score_reasons: Array.isArray(prospect.score_reasons)
        ? prospect.score_reasons.filter((value): value is string => typeof value === "string")
        : [],
      best_channel: prospect.best_channel ?? "business_published_contact",
    },
    authorName: auth.profile.full_name,
    instruction,
  });

  let messageCount = 0;
  if (prospect.status === "approved" || prospect.status === "sent" || prospect.status === "replied" || prospect.status === "converted" || prospect.status === "lost") {
    const refreshed = await createOrRefreshMessageDraft({
      admin,
      tenant,
      profileAnswers: profile.raw_answers ?? {},
      prospect,
      authorName: auth.profile.full_name,
      instruction,
    });
    messageCount = refreshed.length;
  }

  return NextResponse.json({
    preview,
    instruction,
    messages_updated: messageCount,
  });
}
