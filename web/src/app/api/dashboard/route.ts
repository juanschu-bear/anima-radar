import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceUser } from "@/lib/api-auth";
import { loadLatestTenantScan } from "@/lib/scan-queries";
import { deriveWorkspaceReadiness } from "@/lib/workspace-readiness";

const CONTACTED_STATUSES = ["sent", "replied", "converted", "lost"] as const;

export async function GET() {
  const auth = await requireWorkspaceUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const tenantId = auth.profile.tenant_id;
  const [tenant, profiles, scans, prospects, activeProspects, approvedProspects, sentProspects, replies, meetings, orders, messages, outcomes, latestScan, sentMessageRows, outcomeRows, prospectRows] = await Promise.all([
    admin.from("tenants").select("id,name,default_market_lang").eq("id", tenantId).single(),
    admin.from("business_profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("scans").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["new", "approved"]),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "approved"),
    admin.from("prospects").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", [...CONTACTED_STATUSES]),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "replied_positive"),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "meeting"),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "order"),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("outcomes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    loadLatestTenantScan(admin, tenantId),
    admin.from("messages").select("sent_at,edited").eq("tenant_id", tenantId).not("sent_at", "is", null),
    admin.from("outcomes").select("kind,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
    admin.from("prospects").select("status,category,score_reasons").eq("tenant_id", tenantId),
  ]);

  if (tenant.error) return NextResponse.json({ detail: tenant.error.message }, { status: 502 });
  if (latestScan.error) return NextResponse.json({ detail: latestScan.error.message }, { status: 502 });
  if (sentMessageRows.error) return NextResponse.json({ detail: sentMessageRows.error.message }, { status: 502 });
  if (outcomeRows.error) return NextResponse.json({ detail: outcomeRows.error.message }, { status: 502 });
  if (prospectRows.error) return NextResponse.json({ detail: prospectRows.error.message }, { status: 502 });

  const counts = {
    scans: scans.count ?? 0,
    profiles: profiles.count ?? 0,
    prospects: prospects.count ?? 0,
    active_prospects: activeProspects.count ?? 0,
    approved_prospects: approvedProspects.count ?? 0,
    sent_prospects: sentProspects.count ?? 0,
    positive_replies: replies.count ?? 0,
    meetings: meetings.count ?? 0,
    orders: orders.count ?? 0,
    messages: messages.count ?? 0,
    outcomes: outcomes.count ?? 0,
  };
  const timeline = buildTimeline(sentMessageRows.data ?? [], outcomeRows.data ?? []);
  const insights = buildInsights(prospectRows.data ?? [], sentMessageRows.data ?? []);

  return NextResponse.json({
    tenant: tenant.data,
    counts,
    timeline,
    insights,
    workspace_readiness: deriveWorkspaceReadiness({
      profiles: counts.profiles,
      scans: counts.scans,
      prospects: counts.prospects,
      approved: counts.approved_prospects,
      sent: counts.sent_prospects,
      outcomes: counts.outcomes,
      positive_replies: counts.positive_replies,
    }),
    latest_scan: latestScan.latestScan,
    compatibility: {
      scans_created_at_fallback: latestScan.usedCreatedAtFallback,
    },
  });
}

function buildTimeline(
  sentMessages: Array<{ sent_at: string | null; edited?: boolean | null }>,
  outcomes: Array<{ kind: string; created_at: string }>,
) {
  const weeks = lastWeeks(6);
  const buckets = new Map(weeks.map((week) => [week.key, { ...week, contacted: 0, replied: 0, converted: 0 }]));

  for (const message of sentMessages) {
    if (!message.sent_at) continue;
    const key = weekKey(message.sent_at);
    const bucket = buckets.get(key);
    if (bucket) bucket.contacted += 1;
  }

  for (const outcome of outcomes) {
    const key = weekKey(outcome.created_at);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (["replied_positive", "replied_negative", "meeting", "order", "lost"].includes(outcome.kind)) bucket.replied += 1;
    if (outcome.kind === "order") bucket.converted += 1;
  }

  return Array.from(buckets.values());
}

function buildInsights(
  prospects: Array<{ status: string; category: string | null; score_reasons: unknown }>,
  sentMessages: Array<{ sent_at: string | null; edited?: boolean | null }>,
) {
  const winningReasonCounts = new Map<string, number>();
  const stalledReasonCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  for (const prospect of prospects) {
    const category = normalizeLabel(prospect.category);
    if (category && ["approved", "sent", "replied", "converted", "lost"].includes(prospect.status)) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }

    const reasonList = Array.isArray(prospect.score_reasons)
      ? prospect.score_reasons.filter((value): value is string => typeof value === "string")
      : [];
    const targetMap = ["replied", "converted"].includes(prospect.status) ? winningReasonCounts : prospect.status === "sent" ? stalledReasonCounts : null;
    if (!targetMap) continue;
    for (const reason of reasonList.slice(0, 3)) {
      targetMap.set(reason, (targetMap.get(reason) ?? 0) + 1);
    }
  }

  const editedMessages = sentMessages.filter((message) => message.edited).length;
  const sentTotal = sentMessages.length;

  return {
    winning_reasons: topEntries(winningReasonCounts),
    stalled_reasons: topEntries(stalledReasonCounts),
    active_categories: topEntries(categoryCounts),
    draft_control: {
      sent_total: sentTotal,
      edited_total: editedMessages,
      edited_share: sentTotal ? Math.round((editedMessages / sentTotal) * 100) : 0,
    },
  };
}

function topEntries(counts: Map<string, number>, limit = 3) {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function normalizeLabel(value: string | null) {
  const label = value?.trim();
  return label ? label : null;
}

function lastWeeks(total: number) {
  const current = weekStart(new Date());
  return Array.from({ length: total }, (_, index) => {
    const start = new Date(current);
    start.setDate(current.getDate() - ((total - index - 1) * 7));
    return {
      key: weekKey(start),
      label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      start: start.toISOString(),
    };
  });
}

function weekKey(input: string | Date) {
  return weekStart(new Date(input)).toISOString().slice(0, 10);
}

function weekStart(date: Date) {
  const next = new Date(date);
  const day = next.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  next.setUTCDate(next.getUTCDate() + delta);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}
