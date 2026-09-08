export type WorkspaceMetrics = {
  profiles: number;
  scans: number;
  prospects: number;
  approved: number;
  sent: number;
  outcomes: number;
  positive_replies: number;
};

export type WorkspaceState =
  | "needs_profile"
  | "ready_to_scan"
  | "needs_prospects"
  | "review_ready"
  | "outreach_ready"
  | "awaiting_outcomes"
  | "learning_live";

export type WorkspaceReadiness = {
  state: WorkspaceState;
  complete: boolean;
  next_route: "/perfil" | "/radar" | "/prospectos" | "/enviar" | "/learning-loop";
  completion_ratio: number;
};

export function deriveWorkspaceReadiness(metrics: WorkspaceMetrics): WorkspaceReadiness {
  if (metrics.profiles === 0) {
    return { state: "needs_profile", complete: false, next_route: "/perfil", completion_ratio: 0.16 };
  }
  if (metrics.scans === 0) {
    return { state: "ready_to_scan", complete: false, next_route: "/radar", completion_ratio: 0.33 };
  }
  if (metrics.prospects === 0) {
    return { state: "needs_prospects", complete: false, next_route: "/prospectos", completion_ratio: 0.5 };
  }
  if (metrics.approved === 0 && metrics.sent === 0) {
    return { state: "review_ready", complete: false, next_route: "/prospectos", completion_ratio: 0.66 };
  }
  if (metrics.sent === 0) {
    return { state: "outreach_ready", complete: false, next_route: "/enviar", completion_ratio: 0.8 };
  }
  if (metrics.outcomes === 0) {
    return { state: "awaiting_outcomes", complete: false, next_route: "/learning-loop", completion_ratio: 0.92 };
  }
  return { state: "learning_live", complete: true, next_route: "/learning-loop", completion_ratio: 1 };
}
