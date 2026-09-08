import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listTenantScans } from "@/lib/scan-queries";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { processScanPipeline } from "@/lib/radar/pipeline";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error, usedCreatedAtFallback } = await listTenantScans(admin, auth.profile.tenant_id, 50);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({
    scans: data ?? [],
    providers: {
      google_places: Boolean(process.env.GOOGLE_PLACES_API_KEY),
      exa: Boolean(process.env.EXA_API_KEY),
      manual: true,
    },
    compatibility: {
      scans_created_at_fallback: usedCreatedAtFallback,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const payload = await request.json() as { city?: string; country?: string; radius_m?: number; categories?: string[]; sources?: string[] };
  const city = String(payload.city ?? "").trim();
  const country = String(payload.country ?? "").trim();
  const radius = Number(payload.radius_m ?? 15000);
  if (!city || !country) return NextResponse.json({ detail: "City and country are required" }, { status: 400 });
  if (!Number.isFinite(radius) || radius < 1000 || radius > 100000) return NextResponse.json({ detail: "Radius must be between 1 and 100 km" }, { status: 400 });
  const admin = createAdminClient();
  const [{ data: profile }, { data: tenant }] = await Promise.all([
    admin.from("business_profiles").select("id,raw_answers").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("tenants").select("id,name,default_market_lang").eq("id", auth.profile.tenant_id).maybeSingle(),
  ]);
  if (!profile) return NextResponse.json({ detail: "Complete Business DNA before starting a scan" }, { status: 409 });
  if (!tenant) return NextResponse.json({ detail: "Active company not found" }, { status: 404 });
  const { data: scan, error } = await admin.from("scans").insert({ tenant_id: auth.profile.tenant_id, profile_id: profile.id, city, country: country.toUpperCase(), radius_m: Math.round(radius), categories: payload.categories ?? [], sources: payload.sources ?? [], status: "queued" }).select("id,city,country,radius_m,categories,sources,status,counts,started_at,finished_at,error").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  const { data: job, error: jobError } = await admin.from("jobs").insert({ tenant_id: auth.profile.tenant_id, type: "discover", payload: { scan_id: scan.id } }).select("id").single();
  if (jobError) return NextResponse.json({ detail: jobError.message }, { status: 502 });

  try {
    const counts = await processScanPipeline({
      admin,
      tenant,
      profile,
      scan: {
        id: scan.id,
        city: scan.city,
        country: scan.country,
        radius_m: scan.radius_m,
        categories: scan.categories,
        sources: scan.sources,
      },
      jobId: job?.id,
    });
    return NextResponse.json({ ...scan, status: "done", counts, created_at: new Date().toISOString() }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({
      detail: cause instanceof Error ? cause.message : "The scan failed",
      scan_id: scan.id,
    }, { status: 502 });
  }
}
