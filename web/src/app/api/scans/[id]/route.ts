import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const admin = createAdminClient();

  const primary = await admin
    .from("scans")
    .select("id,city,country,radius_m,categories,sources,status,counts,created_at,started_at,finished_at,error")
    .eq("tenant_id", auth.profile.tenant_id)
    .eq("id", id)
    .maybeSingle();

  if (!primary.error) {
    return NextResponse.json({
      scan: primary.data,
      compatibility: { scans_created_at_fallback: false },
    });
  }

  if (!/created_at/i.test(primary.error.message)) {
    return NextResponse.json({ detail: primary.error.message }, { status: 502 });
  }

  const fallback = await admin
    .from("scans")
    .select("id,city,country,radius_m,categories,sources,status,counts,started_at,finished_at,error")
    .eq("tenant_id", auth.profile.tenant_id)
    .eq("id", id)
    .maybeSingle();

  if (fallback.error) return NextResponse.json({ detail: fallback.error.message }, { status: 502 });

  return NextResponse.json({
    scan: fallback.data
      ? {
          ...fallback.data,
          created_at: fallback.data.started_at ?? fallback.data.finished_at ?? null,
        }
      : null,
    compatibility: { scans_created_at_fallback: true },
  });
}
