type OutcomeKind =
  | "replied_positive"
  | "replied_negative"
  | "no_reply"
  | "meeting"
  | "order"
  | "lost";

type OutcomeRow = {
  kind: OutcomeKind;
  prospects: {
    category?: string | null;
    score_reasons?: unknown;
  } | null;
};

type AdjustmentEntry = {
  label: string;
  shift: number;
  wins: number;
  losses: number;
};

export type RubricAdjustments = {
  updated_at: string;
  categories: AdjustmentEntry[];
  reasons: AdjustmentEntry[];
};

const POSITIVE_OUTCOMES = new Set<OutcomeKind>(["replied_positive", "meeting", "order"]);
const NEGATIVE_OUTCOMES = new Set<OutcomeKind>(["replied_negative", "no_reply", "lost"]);

export function computeRubricAdjustments(outcomes: OutcomeRow[]): RubricAdjustments {
  const categoryCounts = new Map<string, { wins: number; losses: number }>();
  const reasonCounts = new Map<string, { wins: number; losses: number }>();

  for (const outcome of outcomes) {
    const direction = POSITIVE_OUTCOMES.has(outcome.kind)
      ? "wins"
      : NEGATIVE_OUTCOMES.has(outcome.kind)
        ? "losses"
        : null;

    if (!direction) continue;

    const category = normalizeLabel(outcome.prospects?.category);
    if (category) bump(categoryCounts, category, direction);

    const reasons = normalizeReasons(outcome.prospects?.score_reasons);
    for (const reason of reasons.slice(0, 3)) {
      bump(reasonCounts, reason, direction);
    }
  }

  return {
    updated_at: new Date().toISOString(),
    categories: finalize(categoryCounts),
    reasons: finalize(reasonCounts),
  };
}

export function categoryShiftFor(adjustments: unknown, category: string | null | undefined) {
  const label = normalizeLabel(category);
  if (!label) return 0;
  const rubric = readRubricAdjustments(adjustments);
  if (!rubric) return 0;
  const match = rubric.categories.find((entry) => entry.label.toLowerCase() === label.toLowerCase());
  return match?.shift ?? 0;
}

export function readRubricAdjustments(input: unknown): RubricAdjustments | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = "rubric_adjustments" in input ? (input as { rubric_adjustments?: unknown }).rubric_adjustments : input;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const candidate = source as { updated_at?: unknown; categories?: unknown; reasons?: unknown };
  return {
    updated_at: typeof candidate.updated_at === "string" ? candidate.updated_at : new Date(0).toISOString(),
    categories: parseEntries(candidate.categories),
    reasons: parseEntries(candidate.reasons),
  };
}

function finalize(counts: Map<string, { wins: number; losses: number }>) {
  return Array.from(counts.entries())
    .map(([label, totals]) => ({
      label,
      wins: totals.wins,
      losses: totals.losses,
      shift: clampShift((totals.wins - totals.losses) * 2),
    }))
    .filter((entry) => entry.wins + entry.losses > 0 && entry.shift !== 0)
    .sort((left, right) => Math.abs(right.shift) - Math.abs(left.shift) || right.wins - left.wins)
    .slice(0, 6);
}

function bump(target: Map<string, { wins: number; losses: number }>, label: string, direction: "wins" | "losses") {
  const current = target.get(label) ?? { wins: 0, losses: 0 };
  current[direction] += 1;
  target.set(label, current);
}

function normalizeReasons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function clampShift(value: number) {
  return Math.max(-10, Math.min(10, value));
}

function parseEntries(value: unknown): AdjustmentEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.label !== "string" || typeof candidate.shift !== "number") return [];
    return [{
      label: candidate.label,
      shift: candidate.shift,
      wins: typeof candidate.wins === "number" ? candidate.wins : 0,
      losses: typeof candidate.losses === "number" ? candidate.losses : 0,
    }];
  });
}
