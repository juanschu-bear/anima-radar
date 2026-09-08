import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const [failedScans, failedJobs] = await Promise.all([
    admin
      .from("scans")
      .select("id,city,country,status,error,started_at,finished_at")
      .eq("tenant_id", auth.profile.tenant_id)
      .eq("status", "failed")
      .order("finished_at", { ascending: false })
      .limit(50),
    admin
      .from("jobs")
      .select("id,type,status,error,attempts,run_after,locked_at,created_at,payload")
      .eq("tenant_id", auth.profile.tenant_id)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (failedScans.error) return NextResponse.json({ detail: failedScans.error.message }, { status: 502 });
  if (failedJobs.error) return NextResponse.json({ detail: failedJobs.error.message }, { status: 502 });

  const events = [
    ...(failedScans.data ?? []).map((scan) => ({
      id: `scan:${scan.id}`,
      kind: "scan",
      title: `${scan.city}, ${scan.country}`,
      status: scan.status,
      detail: scan.error ?? "Unknown scan failure",
      created_at: scan.finished_at ?? scan.started_at ?? null,
      meta: scan,
    })),
    ...(failedJobs.data ?? []).map((job) => ({
      id: `job:${job.id}`,
      kind: "job",
      title: job.type,
      status: job.status,
      detail: job.error ?? "Unknown job failure",
      created_at: job.created_at ?? null,
      meta: job,
    })),
  ].sort((left, right) => {
    const a = left.created_at ? new Date(left.created_at).getTime() : 0;
    const b = right.created_at ? new Date(right.created_at).getTime() : 0;
    return b - a;
  });

  return NextResponse.json({ events });
}
