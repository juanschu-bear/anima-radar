import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { buildDraftMessage, createManualProspect, createOrRefreshMessageDraft } from "@/lib/radar/pipeline";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const [{ data, error }, { data: tenant }, { data: profile }] = await Promise.all([
    admin
      .from("prospects")
      .select("id,scan_id,source,name,category,address,city,country,website,phone,email,instagram,rating,review_count,score,score_reasons,best_channel,status,created_at")
      .eq("tenant_id", auth.profile.tenant_id)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(100),
    admin.from("tenants").select("id,name,default_market_lang").eq("id", auth.profile.tenant_id).maybeSingle(),
    admin.from("business_profiles").select("raw_answers").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });

  return NextResponse.json({
    prospects: (data ?? []).map((prospect) => ({
      ...prospect,
      draft_preview: tenant && profile
        ? buildDraftMessage({
          tenant,
          profileAnswers: profile.raw_answers ?? {},
          prospect: {
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
        })
        : null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const payload = await request.json() as {
    name?: string;
    city?: string;
    country?: string;
    category?: string;
    website?: string;
    phone?: string;
    email?: string;
    instagram?: string;
    note?: string;
  };
  const name = String(payload.name ?? "").trim();
  const country = String(payload.country ?? "").trim();
  if (name.length < 2) return NextResponse.json({ detail: "Prospect name is required" }, { status: 400 });
  if (country && !/^[A-Za-z]{2}$/.test(country)) return NextResponse.json({ detail: "Country must be a two-letter code" }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: tenant }, { data: profile }] = await Promise.all([
    admin.from("tenants").select("id,name,default_market_lang").eq("id", auth.profile.tenant_id).maybeSingle(),
    admin.from("business_profiles").select("raw_answers").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!tenant) return NextResponse.json({ detail: "Active company not found" }, { status: 404 });

  try {
    const prospect = await createManualProspect({
      admin,
      tenant,
      payload: { ...payload, name, country: country || undefined },
      profile,
    });
    return NextResponse.json({
      prospect: {
        ...prospect,
        draft_preview: profile
          ? buildDraftMessage({
            tenant,
            profileAnswers: profile.raw_answers ?? {},
            prospect: {
              name: prospect.name,
              city: prospect.city,
              country: prospect.country,
              category: prospect.category,
              website: prospect.website,
              score_reasons: prospect.score_reasons,
              best_channel: prospect.best_channel,
            },
            authorName: auth.profile.full_name,
          })
          : null,
      },
    }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ detail: cause instanceof Error ? cause.message : "Could not create prospect" }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const { id, status, bulk_min_score: bulkMinScore, preview_override: previewOverride } = await request.json() as {
    id?: string;
    status?: string;
    bulk_min_score?: number;
    preview_override?: { subject?: string | null; body?: string | null };
  };
  if (!["new", "approved", "discarded"].includes(status ?? "")) return NextResponse.json({ detail: "Invalid prospect update" }, { status: 400 });
  const admin = createAdminClient();
  const prospectSelect = "id,tenant_id,scan_id,source,source_id,name,category,address,city,country,website,phone,email,instagram,rating,review_count,raw,enrichment,score,score_reasons,best_channel,status";
  const isBulk = typeof bulkMinScore === "number" && Number.isFinite(bulkMinScore);

  if (isBulk) {
    if (status !== "approved") return NextResponse.json({ detail: "Bulk update is available only for approvals" }, { status: 400 });
    const { data: candidates, error: candidateError } = await admin
      .from("prospects")
      .select(prospectSelect)
      .eq("tenant_id", auth.profile.tenant_id)
      .eq("status", "new")
      .gte("score", Math.round(bulkMinScore))
      .order("score", { ascending: false, nullsFirst: false })
      .limit(100);
    if (candidateError) return NextResponse.json({ detail: candidateError.message }, { status: 502 });
    const prospects = candidates ?? [];
    if (!prospects.length) return NextResponse.json({ updated: 0, prospects: [], messages_created: 0 });

    const { error: updateError } = await admin
      .from("prospects")
      .update({ status })
      .in("id", prospects.map((prospect) => prospect.id))
      .eq("tenant_id", auth.profile.tenant_id);
    if (updateError) return NextResponse.json({ detail: updateError.message }, { status: 502 });

    const [{ data: tenant }, { data: profile }] = await Promise.all([
      admin.from("tenants").select("id,name,default_market_lang").eq("id", auth.profile.tenant_id).maybeSingle(),
      admin.from("business_profiles").select("raw_answers").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    let messagesCreated = 0;
    if (tenant && profile) {
      try {
        for (const prospect of prospects) {
          const messages = await createOrRefreshMessageDraft({
            admin,
            tenant,
            profileAnswers: profile.raw_answers ?? {},
            prospect,
            authorName: auth.profile.full_name,
          });
          messagesCreated += messages.length;
        }
      } catch (cause) {
        return NextResponse.json({ detail: cause instanceof Error ? cause.message : "Could not prepare the outreach drafts" }, { status: 502 });
      }
    }
    return NextResponse.json({ updated: prospects.length, prospects: prospects.map((prospect) => ({ ...prospect, status })), messages_created: messagesCreated });
  }

  if (!id) return NextResponse.json({ detail: "Prospect is required" }, { status: 400 });
  const { data: prospect, error: prospectError } = await admin.from("prospects").update({ status }).eq("id", id).eq("tenant_id", auth.profile.tenant_id).select(prospectSelect).single();
  if (prospectError) return NextResponse.json({ detail: prospectError.message }, { status: 502 });

  let messages = null;
  if (status === "approved") {
    const [{ data: tenant }, { data: profile }] = await Promise.all([
      admin.from("tenants").select("id,name,default_market_lang").eq("id", auth.profile.tenant_id).maybeSingle(),
      admin.from("business_profiles").select("raw_answers").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (tenant && profile) {
      try {
        messages = await createOrRefreshMessageDraft({
          admin,
          tenant,
          profileAnswers: profile.raw_answers ?? {},
          prospect,
          authorName: auth.profile.full_name,
        });
        const customBody = typeof previewOverride?.body === "string" ? previewOverride.body.trim() : "";
        const customSubject = typeof previewOverride?.subject === "string" ? previewOverride.subject.trim() : "";
        if (customBody.length >= 12) {
          const { error: overrideError } = await admin
            .from("messages")
            .update({
              subject: customSubject || null,
              body: customBody,
              edited: true,
            })
            .eq("tenant_id", auth.profile.tenant_id)
            .eq("prospect_id", prospect.id)
            .eq("step", 1);
          if (overrideError) return NextResponse.json({ detail: overrideError.message }, { status: 502 });
        }
      } catch (cause) {
        return NextResponse.json({ detail: cause instanceof Error ? cause.message : "Could not prepare the outreach draft" }, { status: 502 });
      }
    }
  }
  return NextResponse.json({ prospect, messages });
}
