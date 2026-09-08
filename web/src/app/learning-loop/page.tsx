"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import AppShell, { SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Outcome = { id: string; kind: string; note: string | null; created_at: string; prospects: { name?: string } | null };
type ProspectOption = { id: string; name: string; status: string };
const definitions = [["Reply", "Respuesta", "replied_positive / replied_negative / no_reply"], ["Conversation", "Conversación", "meeting"], ["Commercial result", "Resultado comercial", "order / lost"]] as const;

export default function LearningLoopPage() {
  const { language, text } = useLanguage();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [prospects, setProspects] = useState<ProspectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/outcomes", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail);
        setOutcomes(body.outcomes ?? []);
        setProspects(body.prospects ?? []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : text("Could not load outcomes", "No se pudieron cargar los resultados")))
      .finally(() => setLoading(false));
  }, [text]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const prospectId = String(form.get("prospect_id") ?? "");
    const kind = String(form.get("kind") ?? "");
    const note = form.get("note");
    try {
      const response = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prospect_id: prospectId,
          kind,
          note,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      setOutcomes((current) => [body.outcome, ...current]);
      setProspects((current) => current.map((prospect) => prospect.id === prospectId ? { ...prospect, status: body.prospect_status } : prospect));
      setNotice(text("Outcome recorded. The radar can now learn from a real result.", "Resultado registrado. El radar ya puede aprender de un resultado real."));
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not save outcome", "No se pudo guardar el resultado"));
    } finally {
      setSaving(false);
    }
  }

  return <AppShell><div className="page-toolbar"><SectionHeading eyebrow={text("Learning loop / outcomes", "Ciclo de aprendizaje / resultados")} title={text("Turn real outcomes into a sharper radar.", "Convierte resultados reales en un radar más preciso.")} detail={text("This page shows what happened after outreach. It never invents activity from unanswered messages.", "Esta página muestra lo ocurrido después del contacto. Nunca inventa actividad a partir de mensajes sin respuesta.")} /></div>{notice && <p className="notice" aria-live="polite">{notice}</p>}{error && <p className="error" aria-live="polite">{error}</p>}<div className="learning-layout"><section className="panel learning-hero"><p className="eyebrow">{text("Outcome model", "Modelo de resultados")}</p><h2>{text("The radar learns only", "El radar aprende solo")}<br/><em>{text("from recorded truth.", "de hechos registrados.")}</em></h2><p>{text("Each outcome is tied to a real prospect in the active company. Replies, meetings, orders and losses become feedback for future scoring.", "Cada resultado se vincula a un prospecto real de la empresa activa. Respuestas, reuniones, pedidos y pérdidas sirven de feedback para futuras puntuaciones.")}</p></section><section className="panel learning-progress"><div className="panel-title"><h2>{text("Recorded outcomes", "Resultados registrados")}</h2><span className="feature-status feature-status--ready">Supabase</span></div><div className="learning-stat"><strong>{outcomes.length}</strong><span>{text("total outcomes for this company", "resultados totales de esta empresa")}</span></div><div className="learning-stat"><strong>{outcomes.filter((item) => item.kind === "meeting").length}</strong><span>{text("meetings", "reuniones")}</span></div><div className="learning-stat"><strong>{outcomes.filter((item) => item.kind === "order").length}</strong><span>{text("orders", "pedidos")}</span></div></section></div><section className="outcome-grid"><div className="section-mini"><p className="eyebrow">{text("What gets recorded", "Qué se registra")}</p><h2>{text("Three layers of truth.", "Tres niveles de verdad.")}</h2><p>{text("These are the operator chores after outreach—not sample results.", "Estas son las tareas del operador después del contacto, no resultados de muestra.")}</p></div>{definitions.map(([en, es, kinds], index) => <article className="outcome-card" key={en}><span className="outcome-number">0{index + 1}</span><strong>{language === "es" ? es : en}</strong><small>{kinds}</small></article>)}</section><section className="panel settings-card outcome-form-panel"><div className="panel-title"><h2>{text("Record a real outcome", "Registrar un resultado real")}</h2><span className="feature-status">{text("Manual truth", "Verdad manual")}</span></div><form className="settings-fields" onSubmit={submit}><label>{text("Prospect", "Prospecto")}<select required name="prospect_id" defaultValue=""><option value="" disabled>{text("Select a prospect", "Selecciona un prospecto")}</option>{prospects.map((prospect) => <option key={prospect.id} value={prospect.id}>{prospect.name} · {prospect.status}</option>)}</select></label><label>{text("Outcome type", "Tipo de resultado")}<select required name="kind" defaultValue=""><option value="" disabled>{text("Choose one", "Elige uno")}</option><option value="replied_positive">{text("Positive reply", "Respuesta positiva")}</option><option value="replied_negative">{text("Negative reply", "Respuesta negativa")}</option><option value="no_reply">{text("No reply", "Sin respuesta")}</option><option value="meeting">{text("Meeting", "Reunión")}</option><option value="order">{text("Order", "Pedido")}</option><option value="lost">{text("Lost", "Perdido")}</option></select></label><label>{text("Note", "Nota")}<input name="note" placeholder={text("What happened?", "¿Qué ocurrió?")} /></label><button className="button button-primary" disabled={saving}>{saving ? text("Saving…", "Guardando…") : text("Record outcome", "Registrar resultado")}<span className="button-arrow"/></button></form></section><section className="panel outcome-records"><div className="panel-title"><h2>{text("Outcome history", "Historial de resultados")}</h2><span>{outcomes.length}</span></div>{loading ? <div className="empty-state">{text("Loading outcomes…", "Cargando resultados…")}</div> : outcomes.length ? outcomes.map((outcome) => <div className="outcome-row" key={outcome.id}><div><strong>{outcome.prospects?.name ?? text("Unknown prospect", "Prospecto desconocido")}</strong><small>{new Date(outcome.created_at).toLocaleDateString(language === "es" ? "es-EC" : "en-US")}</small></div><span className="status-chip">{outcome.kind}</span><p>{outcome.note ?? "—"}</p></div>) : <div className="empty-state empty-state--action"><strong>{text("No outcomes recorded yet.", "Aún no hay resultados registrados.")}</strong><p>{text("Once real outreach receives a response, its result will appear here.", "Cuando un contacto real reciba respuesta, su resultado aparecerá aquí.")}</p><Link href="/enviar">{text("Open outreach", "Abrir contacto")} ↗</Link></div>}</section></AppShell>;
}
