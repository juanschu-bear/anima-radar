import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("scans").select("id,city,country,radius_m,categories,sources,status,counts,created_at,started_at,finished_at,error").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  return NextResponse.json({ scans: data ?? [] });
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
  const { data: profile } = await admin.from("business_profiles").select("id").eq("tenant_id", auth.profile.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!profile) return NextResponse.json({ detail: "Complete Business DNA before starting a scan" }, { status: 409 });
  const { data: scan, error } = await admin.from("scans").insert({ tenant_id: auth.profile.tenant_id, profile_id: profile.id, city, country, radius_m: Math.round(radius), categories: payload.categories ?? [], sources: payload.sources ?? [], status: "queued" }).select("id,city,country,radius_m,categories,sources,status,counts,created_at").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 502 });
  const { error: jobError } = await admin.from("jobs").insert({ tenant_id: auth.profile.tenant_id, type: "discover", payload: { scan_id: scan.id } });
  if (jobError) return NextResponse.json({ detail: jobError.message }, { status: 502 });
  return NextResponse.json(scan, { status: 201 });
}
