import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { createManualProspect, createOrRefreshMessageDraft } from "@/lib/radar/pipeline";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("prospects").select("id,scan_id,source,name,category,address,city,country,website,phone,email,instagram,rating,review_count,score,score_reasons,best_channel,status,created_at").eq("tenant_id", auth.profile.tenant_id).order("score", { ascending: false, nullsFirst: false }).limit(100);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ prospects: data ?? [] });
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
    return NextResponse.json({ prospect }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ detail: cause instanceof Error ? cause.message : "Could not create prospect" }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const { id, status } = await request.json() as { id?: string; status?: string };
  if (!id || !["new", "approved", "discarded"].includes(status ?? "")) return NextResponse.json({ detail: "Invalid prospect update" }, { status: 400 });
  const admin = createAdminClient();
  const { data: prospect, error: prospectError } = await admin.from("prospects").update({ status }).eq("id", id).eq("tenant_id", auth.profile.tenant_id).select("id,tenant_id,scan_id,source,source_id,name,category,address,city,country,website,phone,email,instagram,rating,review_count,raw,enrichment,score,score_reasons,best_channel,status").single();
  if (prospectError) return NextResponse.json({ detail: prospectError.message }, { status: 502 });

  let message = null;
  if (status === "approved") {
    const [{ data: tenant }, { data: profile }] = await Promise.all([
      admin.from("tenants").select("id,name,default_market_lang").eq("id", auth.profile.tenant_id).maybeSingle(),
      admin.from("business_profiles").select("raw_answers").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (tenant && profile) {
      try {
        message = await createOrRefreshMessageDraft({
          admin,
          tenant,
          profileAnswers: profile.raw_answers ?? {},
          prospect,
          authorName: auth.profile.full_name,
        });
      } catch (cause) {
        return NextResponse.json({ detail: cause instanceof Error ? cause.message : "Could not prepare the outreach draft" }, { status: 502 });
      }
    }
  }
  return NextResponse.json({ prospect, message });
}
