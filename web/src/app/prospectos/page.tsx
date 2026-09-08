"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AppShell, { ButtonArrow, SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Prospect = { id: string; scan_id: string; source: string; name: string; category: string | null; address: string | null; city: string | null; country: string | null; website: string | null; phone: string | null; email: string | null; instagram: string | null; rating: number | null; review_count: number | null; score: number | null; score_reasons: unknown; best_channel: string | null; status: string; created_at: string };

function reasons(value: unknown) { if (!Array.isArray(value)) return []; return value.map((item) => typeof item === "string" ? item : item && typeof item === "object" && "reason" in item ? String(item.reason) : "").filter(Boolean); }

export default function ProspectsPage() {
  const router = useRouter();
  const { text } = useLanguage();
  const [incomingNoticeCode] = useState<string | null>(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("notice") : null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingManual, setSavingManual] = useState(false);
  const [bulkThreshold, setBulkThreshold] = useState("70");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/prospects", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail);
        if (!live) return;
        setProspects(body.prospects ?? []);
        setSelectedId(body.prospects?.[0]?.id ?? "");
        if (incomingNoticeCode === "scan-complete") {
          setNotice(text("The scan finished and the matching businesses are now ready for review.", "El escaneo terminó y las empresas coincidentes ya están listas para revisión."));
        } else if (incomingNoticeCode === "manual-needed") {
          setNotice(text("This company can already work manually. Add the first prospect below and continue the workflow immediately.", "Esta empresa ya puede trabajar de forma manual. Añade el primer prospecto abajo y continúa el flujo inmediatamente."));
        } else if (incomingNoticeCode === "no-matches") {
          setNotice(text("The scan finished, but no strong matches were found yet. Add a company manually or broaden the market criteria.", "El escaneo terminó, pero todavía no encontró coincidencias fuertes. Añade una empresa manualmente o amplía los criterios del mercado."));
        }
      })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : text("Could not load prospects", "No se pudieron cargar los prospectos")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [incomingNoticeCode, text]);
  useEffect(() => {
    if (!incomingNoticeCode) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("notice");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
  }, [incomingNoticeCode]);

  const selected = prospects.find((item) => item.id === selectedId) ?? prospects[0];
  const reviewable = useMemo(() => prospects.filter((item) => item.status === "new"), [prospects]);
  const queueSummary = {
    review: prospects.filter((item) => item.status === "new").length,
    approved: prospects.filter((item) => item.status === "approved").length,
    sent: prospects.filter((item) => item.status === "sent").length,
  };

  const moveSelection = useCallback((direction: 1 | -1, currentId = selected?.id) => {
    if (!currentId || !prospects.length) return;
    const currentIndex = prospects.findIndex((item) => item.id === currentId);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= prospects.length) return;
    setSelectedId(prospects[nextIndex]!.id);
  }, [prospects, selected?.id]);

  const update = useCallback(async (status: "approved" | "discarded") => {
    if (!selected) return;
    setError(null);
    const response = await fetch("/api/prospects", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, status }) });
    const body = await response.json();
    if (!response.ok) {
      setError(body.detail);
      return;
    }
    setProspects((current) => current.map((item) => item.id === selected.id ? { ...item, status } : item));
    if (status === "approved") {
      router.push("/enviar?notice=draft-ready");
      router.refresh();
      return;
    }
    moveSelection(1, selected.id);
  }, [moveSelection, router, selected]);

  useEffect(() => {
    if (!selected || typeof window === "undefined") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelection(-1);
      }
      if (event.key.toLowerCase() === "a" && selected.status === "new") {
        event.preventDefault();
        void update("approved");
      }
      if (event.key.toLowerCase() === "d" && selected.status === "new") {
        event.preventDefault();
        void update("discarded");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveSelection, prospects, selected, update]);

  async function bulkApprove() {
    setBulkSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved", bulk_min_score: Number(bulkThreshold) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      const updatedIds = new Set<string>((body.prospects ?? []).map((prospect: Prospect) => prospect.id));
      setProspects((current) => current.map((item) => updatedIds.has(item.id) ? { ...item, status: "approved" } : item));
      setNotice(
        body.updated
          ? text(
            `${body.updated} prospects were approved and ${body.messages_created ?? 0} message steps were prepared.`,
            `Se aprobaron ${body.updated} prospectos y se prepararon ${body.messages_created ?? 0} pasos de mensaje.`,
          )
          : text("No new prospects matched that threshold.", "Ningún prospecto nuevo cumplió ese umbral."),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Bulk approval failed", "La aprobación masiva falló"));
    } finally {
      setBulkSaving(false);
    }
  }

  async function createManualProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingManual(true);
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: form.get("name"),
      category: form.get("category"),
      city: form.get("city"),
      country: form.get("country"),
      website: form.get("website"),
      phone: form.get("phone"),
      email: form.get("email"),
      instagram: form.get("instagram"),
      note: form.get("note"),
    };
    try {
      const response = await fetch("/api/prospects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      setProspects((current) => [body.prospect, ...current]);
      setSelectedId(body.prospect.id);
      setNotice(text("Manual prospect added. You can review and approve it immediately.", "Prospecto manual añadido. Puedes revisarlo y aprobarlo inmediatamente."));
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not create prospect", "No se pudo crear el prospecto"));
    } finally {
      setSavingManual(false);
    }
  }

  return <AppShell><div className="page-toolbar"><SectionHeading eyebrow={text("Prospects / review queue", "Prospectos / cola de revisión")} title={text("Review the signal, then decide.", "Revisa la señal y decide.")} detail={text("This queue belongs only to the active company. From here you either approve, discard or add a company manually.", "Esta cola pertenece solo a la empresa activa. Desde aquí apruebas, descartas o añades una empresa manualmente.")} /><ButtonArrow href="/enviar">{text("Open outreach", "Abrir contacto")}</ButtonArrow></div>{notice && <p className="notice" aria-live="polite">{notice}</p>}{error && <p className="error" aria-live="polite">{error}</p>}{loading ? <section className="panel empty-state">{text("Loading prospects…", "Cargando prospectos…")}</section> : !selected ? <><section className="panel empty-workspace"><span className="empty-orbit"/><p className="eyebrow">{text("No sample data", "Sin datos de muestra")}</p><h2>{text("No prospects for this company yet.", "Aún no hay prospectos para esta empresa.")}</h2><p>{text("Run a radar scan or add one company manually to start the review queue.", "Ejecuta un escaneo de radar o añade una empresa manualmente para empezar la cola de revisión.")}</p><div className="empty-actions"><Link href="/radar" className="button button-primary">{text("Create a scan", "Crear un escaneo")}<span className="button-arrow"/></Link><a href="#manual-prospect" className="button button-ghost">{text("Add manually", "Añadir manualmente")}</a></div></section><section id="manual-prospect" className="panel manual-prospect-panel"><div className="panel-title"><h2>{text("Add a company manually", "Añadir una empresa manualmente")}</h2><span className="feature-status feature-status--partial">{text("Fallback", "Fallback")}</span></div><form className="settings-fields" onSubmit={createManualProspect}><label>{text("Company name", "Nombre de la empresa")}<input required name="name" placeholder="Preserva" /></label><label>{text("Category", "Categoría")}<input name="category" placeholder={text("e.g. hotels", "p. ej. hoteles")} /></label><label>{text("City", "Ciudad")}<input name="city" placeholder="Quito" /></label><label>{text("Country code", "Código de país")}<input name="country" maxLength={2} placeholder="EC" /></label><label>{text("Website", "Sitio web")}<input name="website" placeholder="preserva.com" /></label><label>{text("Phone", "Teléfono")}<input name="phone" placeholder="+593..." /></label><label>{text("Email", "Correo")}<input name="email" placeholder="hello@preserva.com" /></label><label>{text("Instagram", "Instagram")}<input name="instagram" placeholder="@preserva" /></label><label>{text("Why add this company?", "¿Por qué añadir esta empresa?")}<input name="note" placeholder={text("Short context for later review", "Contexto breve para la revisión")} /></label><button className="button button-primary" disabled={savingManual}>{savingManual ? text("Saving…", "Guardando…") : text("Create manual prospect", "Crear prospecto manual")}<span className="button-arrow"/></button></form></section></> : <><div className="learning-layout"><section className="panel learning-progress"><div className="panel-title"><h2>{text("Queue health", "Estado de la cola")}</h2><span className="feature-status feature-status--ready">{prospects.length}</span></div><div className="learning-stat"><strong>{queueSummary.review}</strong><span>{text("ready for review", "listas para revisar")}</span></div><div className="learning-stat"><strong>{queueSummary.approved}</strong><span>{text("approved and waiting for outreach", "aprobadas y esperando contacto")}</span></div><div className="learning-stat"><strong>{queueSummary.sent}</strong><span>{text("already sent", "ya enviadas")}</span></div></section><section className="panel learning-hero"><p className="eyebrow">{text("Review logic", "Lógica de revisión")}</p><h2>{text("Approve only what", "Aprueba solo lo que")}<br/><em>{text("you would actually contact.", "de verdad contactarías.")}</em></h2><p>{text("Approval now creates the full outreach sequence: first message plus two follow-ups.", "La aprobación ahora crea la secuencia completa de contacto: primer mensaje más dos seguimientos.")}</p></section></div><section className="panel review-toolbar"><div><p className="eyebrow">{text("Review progress", "Progreso de revisión")}</p><strong>{Math.max(prospects.length - queueSummary.review, 0)} / {prospects.length} {text("reviewed", "revisados")}</strong><small>{text("Keyboard: A approve · D discard · ←/→ navigate", "Teclado: A aprobar · D descartar · ←/→ navegar")}</small></div><div className="bulk-approve"><label>{text("Bulk approve from score", "Aprobación masiva desde puntuación")}<input type="number" min="0" max="100" value={bulkThreshold} onChange={(event) => setBulkThreshold(event.target.value)} /></label><button className="button button-ghost" onClick={bulkApprove} disabled={bulkSaving || !reviewable.length}>{bulkSaving ? text("Approving…", "Aprobando…") : text("Approve matching prospects", "Aprobar prospectos coincidentes")}</button></div></section><div className="review-layout"><aside className="panel score-panel"><span className="live-label">{selected.status}</span><div className="score-big">{selected.score ?? "—"}</div><div className="score-caption">{text("likelihood of fit", "probabilidad de encaje")}</div><div className="reason-list">{reasons(selected.score_reasons).length ? reasons(selected.score_reasons).map((reason) => <div className="reason" key={reason}>{reason}</div>) : <div className="reason">{text("No scoring reasons recorded yet", "Aún no hay motivos de puntuación registrados")}</div>}</div></aside><section className="panel review-main"><span className="eyebrow">{[selected.category, selected.city, selected.country].filter(Boolean).join(" · ")}</span><h2>{selected.name}</h2><p className="review-meta">{text("Best available channel", "Mejor canal disponible")}: {selected.best_channel ?? text("not identified", "no identificado")}</p><div className="prospect-facts"><div><span>{text("Address", "Dirección")}</span><strong>{selected.address ?? "—"}</strong></div><div><span>{text("Website", "Sitio web")}</span><strong>{selected.website ?? "—"}</strong></div><div><span>{text("Email", "Correo")}</span><strong>{selected.email ?? "—"}</strong></div><div><span>{text("Phone", "Teléfono")}</span><strong>{selected.phone ?? "—"}</strong></div><div><span>{text("Rating", "Valoración")}</span><strong>{selected.rating ? `${selected.rating} · ${selected.review_count ?? 0} ${text("reviews", "reseñas")}` : "—"}</strong></div></div><div className="review-actions"><button onClick={() => update("approved")} className="button button-primary">{text("Approve and prepare sequence", "Aprobar y preparar secuencia")}<span className="button-arrow">↗</span></button><button onClick={() => update("discarded")} className="button button-ghost">{text("Discard", "Descartar")}</button><span className="status-text">{selected.status}</span></div></section></div><div className="table-panel panel"><div className="panel-title"><h2>{text("Queue", "Cola")}</h2><a href="#manual-prospect">{text("Add manually", "Añadir manualmente")} ↗</a></div><div className="table-row table-head"><span>{text("Prospect", "Prospecto")}</span><span>{text("Status", "Estado")}</span><span>{text("Score", "Puntuación")}</span><span>{text("Location", "Ubicación")}</span><span>{text("Action", "Acción")}</span></div>{prospects.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`table-row data-row ${item.id === selected.id ? "data-row--active" : ""}`}><span className="prospect-name"><span className="company-mark">{item.name.slice(0, 1)}</span>{item.name}</span><span className="status-chip">{item.status}</span><span className="score">{item.score ?? "—"}</span><span className="muted">{[item.city, item.country].filter(Boolean).join(", ") || "—"}</span><span className="muted">{text("Open", "Abrir")} ↗</span></button>)}</div><section id="manual-prospect" className="panel manual-prospect-panel"><div className="panel-title"><h2>{text("Need another company?", "¿Necesitas otra empresa?")}</h2><span className="feature-status">{text("Manual entry", "Entrada manual")}</span></div><form className="settings-fields manual-prospect-form" onSubmit={createManualProspect}><label>{text("Company name", "Nombre de la empresa")}<input required name="name" placeholder="Preserva" /></label><label>{text("Category", "Categoría")}<input name="category" placeholder={text("e.g. hospitality", "p. ej. hostelería")} /></label><label>{text("City", "Ciudad")}<input name="city" placeholder="Quito" /></label><label>{text("Country code", "Código de país")}<input name="country" maxLength={2} placeholder="EC" /></label><label>{text("Website", "Sitio web")}<input name="website" placeholder="preserva.com" /></label><label>{text("Phone", "Teléfono")}<input name="phone" placeholder="+593..." /></label><button className="button button-ghost" disabled={savingManual}>{savingManual ? text("Saving…", "Guardando…") : text("Add manual prospect", "Añadir prospecto manual")}</button></form></section></>}</AppShell>;
}
