"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Dashboard = {
  tenant: { id: string; name: string; default_market_lang: string };
  counts: {
    profiles: number;
    prospects: number;
    active_prospects: number;
    approved_prospects: number;
    sent_prospects: number;
    positive_replies: number;
    meetings: number;
    orders: number;
    messages: number;
    outcomes: number;
  };
  timeline: Array<{ key: string; label: string; start: string; contacted: number; replied: number; converted: number }>;
  insights: {
    winning_reasons: Array<{ label: string; count: number }>;
    stalled_reasons: Array<{ label: string; count: number }>;
    active_categories: Array<{ label: string; count: number }>;
    draft_control: { sent_total: number; edited_total: number; edited_share: number };
  };
  rubric_adjustments: {
    updated_at: string;
    categories: Array<{ label: string; shift: number; wins: number; losses: number }>;
    reasons: Array<{ label: string; shift: number; wins: number; losses: number }>;
  } | null;
  workspace_readiness: { state: string; complete: boolean; next_route: string };
  latest_scan: { id: string; city: string; country: string; radius_m: number; status: string; counts: Record<string, number>; created_at: string } | null;
};

export default function PanelPage() {
  const { language, text } = useLanguage();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queryNoticeCode] = useState<string | null>(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("notice") : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail);
        if (live) setDashboard(body as Dashboard);
      })
      .catch((cause) => {
        if (live) setError(cause instanceof Error ? cause.message : text("Could not load workspace", "No se pudo cargar el espacio"));
      });
    return () => { live = false; };
  }, [text]);

  const queryNotice = queryNoticeCode === "company-setup-pending"
    ? text("This company is not configured yet. Ask the platform owner to complete the Business DNA before the team starts working here.", "Esta empresa todavía no está configurada. Pide al propietario de la plataforma que complete el ADN del negocio antes de que el equipo empiece a trabajar aquí.")
    : null;

  useEffect(() => {
    if (queryNoticeCode !== "company-setup-pending") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("notice");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
  }, [queryNoticeCode]);

  const locale = language === "es" ? "es-EC" : "en-US";
  const today = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const readinessState = dashboard?.workspace_readiness.state;
  const latestScanLabel = dashboard?.latest_scan ? `${dashboard.latest_scan.city} · ${dashboard.latest_scan.status}` : text("Choose market, radius and categories", "Elige mercado, radio y categorías");
  const prospectsLabel = dashboard?.counts.prospects ? `${dashboard.counts.prospects} ${text("available", "disponibles")}` : text("Prospects appear after discovery runs", "Los prospectos aparecen después del descubrimiento");
  const messagesLabel = dashboard?.counts.messages ? `${dashboard.counts.messages} ${text("draft steps prepared", "pasos preparados")}` : text("Sequences appear after prospect approval", "Las secuencias aparecen después de aprobar prospectos");
  const outcomesLabel = dashboard?.counts.outcomes ? `${dashboard.counts.outcomes} ${text("results recorded", "resultados registrados")}` : text("Replies, meetings and orders close the loop", "Respuestas, reuniones y pedidos cierran el ciclo");

  return (
    <AppShell>
      <div className="observatory real-dashboard">
        {(notice ?? queryNotice) && (
          <section className="notice setup-success" aria-live="polite">
            <div>
              <strong>{text("Owner action still needed", "Aún falta una acción del propietario")}</strong>
              <span>{notice ?? queryNotice}</span>
            </div>
            <button type="button" onClick={() => setNotice(null)} aria-label={text("Dismiss", "Cerrar")}>×</button>
          </section>
        )}

        <div className="observatory-sky" aria-hidden="true">
          <div className="sky-orb orb-a" />
          <div className="sky-orb orb-b" />
          <div className="sky-horizon" />
        </div>

        <header className="observatory-header">
          <div>
            <p className="observatory-kicker">AnimaRadar / {dashboard?.tenant.name ?? text("Loading workspace", "Cargando espacio")}</p>
            <h1>{today}</h1>
          </div>
          <div className="observatory-header-note">
            <span className="live-pulse" />
            {readinessTitle(readinessState, text)}
            <small>{text("Live workspace data only", "Solo datos reales del espacio")}</small>
          </div>
        </header>

        {error && <p className="error" aria-live="polite">{error}</p>}

        <section className="observatory-metrics">
          <div className="observatory-metric">
            <span>{text("PROSPECTS", "PROSPECTOS")}</span>
            <strong>{dashboard?.counts.prospects ?? "—"}</strong>
            <small>{text("stored for this company", "guardados para esta empresa")}</small>
          </div>
          <div className="observatory-metric">
            <span>{text("ACTIVE SIGNALS", "SEÑALES ACTIVAS")}</span>
            <strong>{dashboard?.counts.active_prospects ?? "—"}</strong>
            <small>{text("waiting or approved", "en espera o aprobadas")}</small>
          </div>
          <div className="observatory-metric">
            <span>{text("CONTACTED", "CONTACTADOS")}</span>
            <strong>{dashboard?.counts.sent_prospects ?? "—"}</strong>
            <small>{text("outreach already logged", "contactos ya registrados")}</small>
          </div>
          <div className="observatory-metric">
            <span>{text("ORDERS", "PEDIDOS")}</span>
            <strong>{dashboard?.counts.orders ?? "—"}</strong>
            <small>{text("commercial wins recorded", "ganancias comerciales registradas")}</small>
          </div>
        </section>

        <div className="observatory-grid observatory-grid--single">
          <section className="atlas-panel workspace-start">
            <div className="atlas-head">
              <div>
                <span className="atlas-index">01 / {text("company workspace", "espacio de empresa")}</span>
                <h2>{dashboard?.workspace_readiness.complete ? text("This company is running live", "Esta empresa ya está corriendo en vivo") : text("Finish the company setup", "Termina la configuración de la empresa")}</h2>
                <p>{text("Everything shown here belongs only to the active company.", "Todo lo que aparece aquí pertenece únicamente a la empresa activa.")}</p>
              </div>
              <span className={`feature-status ${dashboard?.workspace_readiness.complete ? "feature-status--ready" : "feature-status--partial"}`}>{readinessTitle(readinessState, text)}</span>
            </div>

            <div className="workspace-steps">
              <Link href="/perfil" className={dashboard?.counts.profiles ? "is-complete" : ""}>
                <span>01</span>
                <div>
                  <strong>{text("Define Business DNA", "Define el ADN del negocio")}</strong>
                  <small>{dashboard?.counts.profiles ? text("Profile saved", "Perfil guardado") : text("Describe offer, ideal customer and exclusions", "Describe oferta, cliente ideal y exclusiones")}</small>
                </div>
                <b>↗</b>
              </Link>
              <Link href="/radar" className={dashboard?.latest_scan ? "is-complete" : ""}>
                <span>02</span>
                <div>
                  <strong>{text("Configure a radar scan", "Configura un escaneo de radar")}</strong>
                  <small>{latestScanLabel}</small>
                </div>
                <b>↗</b>
              </Link>
              <Link href="/prospectos" className={dashboard?.counts.prospects ? "is-complete" : ""}>
                <span>03</span>
                <div>
                  <strong>{text("Review real prospects", "Revisa prospectos reales")}</strong>
                  <small>{prospectsLabel}</small>
                </div>
                <b>↗</b>
              </Link>
              <Link href="/enviar" className={dashboard?.counts.messages ? "is-complete" : ""}>
                <span>04</span>
                <div>
                  <strong>{text("Approve and send outreach", "Aprueba y envía el contacto")}</strong>
                  <small>{messagesLabel}</small>
                </div>
                <b>↗</b>
              </Link>
              <Link href="/learning-loop" className={dashboard?.counts.outcomes ? "is-complete" : ""}>
                <span>05</span>
                <div>
                  <strong>{text("Record outcomes", "Registra resultados")}</strong>
                  <small>{outcomesLabel}</small>
                </div>
                <b>↗</b>
              </Link>
            </div>
          </section>
        </div>

        <section className="flow-panel">
          <div className="flow-copy">
            <span className="atlas-index">02 / {text("live pipeline", "pipeline real")}</span>
            <h2>{text("From company context to", "Del contexto de empresa a")}<br /><em>{text("measurable outcomes.", "resultados medibles.")}</em></h2>
          </div>
          <div className="flow-steps">
            <div><span>Business DNA</span><strong>{dashboard?.counts.profiles ?? 0}</strong><small>{text("profiles", "perfiles")}</small></div>
            <i>→</i>
            <div><span>{text("Prospects", "Prospectos")}</span><strong>{dashboard?.counts.prospects ?? 0}</strong><small>{text("found", "encontrados")}</small></div>
            <i>→</i>
            <div><span>{text("Messages", "Mensajes")}</span><strong>{dashboard?.counts.messages ?? 0}</strong><small>{text("prepared", "preparados")}</small></div>
            <i>→</i>
            <div className="flow-final"><span>{text("Outcomes", "Resultados")}</span><strong>{dashboard?.counts.outcomes ?? 0}</strong><small>{text("recorded", "registrados")}</small></div>
          </div>
        </section>

        <section className="panel analytics-panel">
          <div className="panel-title">
            <h2>{text("Live performance", "Rendimiento real")}</h2>
            <span className="feature-status feature-status--ready">{text("Last 6 weeks", "Últimas 6 semanas")}</span>
          </div>
          <div className="analytics-grid">
            <div className="analytics-card">
              <p className="eyebrow">{text("Weekly rhythm", "Ritmo semanal")}</p>
              <div className="timeline-table">
                <div className="timeline-head">
                  <span>{text("Week", "Semana")}</span>
                  <span>{text("Contacted", "Contactados")}</span>
                  <span>{text("Replied", "Respondieron")}</span>
                  <span>{text("Converted", "Convirtieron")}</span>
                </div>
                {(dashboard?.timeline ?? []).map((week) => (
                  <div className="timeline-row" key={week.key}>
                    <span>{week.label}</span>
                    <strong>{week.contacted}</strong>
                    <strong>{week.replied}</strong>
                    <strong>{week.converted}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="analytics-card">
              <p className="eyebrow">{text("What seems to work", "Lo que parece funcionar")}</p>
              <h3>{text("Winning reasons", "Razones ganadoras")}</h3>
              <InsightList items={dashboard?.insights.winning_reasons ?? []} emptyLabel={text("No reply signal yet.", "Todavía no hay señal de respuesta.")} />
              <h3>{text("Most active categories", "Categorías más activas")}</h3>
              <InsightList items={dashboard?.insights.active_categories ?? []} emptyLabel={text("No category pattern yet.", "Todavía no hay patrón por categoría.")} />
            </div>

            <div className="analytics-card">
              <p className="eyebrow">{text("Human control", "Control humano")}</p>
              <h3>{text("Draft edits before send", "Ediciones antes del envío")}</h3>
              <div className="analytics-metric-stack">
                <div><span>{text("Sent messages", "Mensajes enviados")}</span><strong>{dashboard?.insights.draft_control.sent_total ?? 0}</strong></div>
                <div><span>{text("Edited before send", "Editados antes de enviar")}</span><strong>{dashboard?.insights.draft_control.edited_total ?? 0}</strong></div>
                <div><span>{text("Edited share", "Proporción editada")}</span><strong>{dashboard?.insights.draft_control.edited_share ?? 0}%</strong></div>
              </div>
              <h3>{text("Reasons still stalling", "Razones que aún se frenan")}</h3>
              <InsightList items={dashboard?.insights.stalled_reasons ?? []} emptyLabel={text("Nothing is stalled yet.", "Todavía no hay razones estancadas.")} />
            </div>

            <div className="analytics-card">
              <p className="eyebrow">{text("Learning adjustments", "Ajustes de aprendizaje")}</p>
              <h3>{text("Categories weighted up or down", "Categorías que suben o bajan de peso")}</h3>
              <AdjustmentList
                items={dashboard?.rubric_adjustments?.categories ?? []}
                emptyLabel={text("No category adjustments yet.", "Todavía no hay ajustes por categoría.")}
              />
              <h3>{text("Reasons moving the rubric", "Razones que están moviendo la rúbrica")}</h3>
              <AdjustmentList
                items={dashboard?.rubric_adjustments?.reasons ?? []}
                emptyLabel={text("No reason adjustments yet.", "Todavía no hay ajustes por razón.")}
              />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function readinessTitle(state: string | undefined, text: (english: string, spanish: string) => string) {
  switch (state) {
    case "needs_profile": return text("Business DNA still needed", "Todavía falta el ADN del negocio");
    case "ready_to_scan": return text("Ready for the first scan", "Lista para el primer escaneo");
    case "needs_prospects": return text("Scan saved — now surface prospects", "Escaneo guardado — ahora hay que sacar prospectos");
    case "review_ready": return text("Review queue is live", "La cola de revisión está activa");
    case "outreach_ready": return text("Outreach can start", "El contacto ya puede empezar");
    case "awaiting_outcomes": return text("Awaiting real outcomes", "Esperando resultados reales");
    case "learning_live": return text("Learning from live results", "Aprendiendo de resultados reales");
    default: return text("Live tenant data", "Datos reales del tenant");
  }
}

function InsightList({
  items,
  emptyLabel,
}: {
  items: Array<{ label: string; count: number }>;
  emptyLabel: string;
}) {
  if (!items.length) return <p className="muted">{emptyLabel}</p>;
  return (
    <div className="insight-list">
      {items.map((item) => (
        <div key={item.label} className="insight-row">
          <span>{item.label}</span>
          <strong>{item.count}</strong>
        </div>
      ))}
    </div>
  );
}

function AdjustmentList({
  items,
  emptyLabel,
}: {
  items: Array<{ label: string; shift: number; wins: number; losses: number }>;
  emptyLabel: string;
}) {
  if (!items.length) {
    return <p className="analytics-empty">{emptyLabel}</p>;
  }

  return (
    <div className="insight-list">
      {items.map((item) => (
        <div className="insight-row" key={item.label}>
          <div>
            <strong>{item.label}</strong>
            <small>{item.wins}↑ / {item.losses}↓</small>
          </div>
          <span className={`feature-status ${item.shift > 0 ? "feature-status--ready" : "feature-status--partial"}`}>
            {item.shift > 0 ? `+${item.shift}` : item.shift}
          </span>
        </div>
      ))}
    </div>
  );
}
