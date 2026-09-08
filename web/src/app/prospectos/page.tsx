"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import AppShell, { ButtonArrow, SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Prospect = { id: string; scan_id: string; source: string; name: string; category: string | null; address: string | null; city: string | null; country: string | null; website: string | null; phone: string | null; email: string | null; instagram: string | null; rating: number | null; review_count: number | null; score: number | null; score_reasons: unknown; best_channel: string | null; status: string; created_at: string };

function reasons(value: unknown) { if (!Array.isArray(value)) return []; return value.map((item) => typeof item === "string" ? item : item && typeof item === "object" && "reason" in item ? String(item.reason) : "").filter(Boolean); }

export default function ProspectsPage() {
  const router = useRouter();
  const { text } = useLanguage();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingManual, setSavingManual] = useState(false);
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
        const incomingNotice = new URLSearchParams(window.location.search).get("notice");
        if (incomingNotice === "scan-complete") {
          setNotice(text("The scan finished and the matching businesses are now ready for review.", "El escaneo terminó y las empresas coincidentes ya están listas para revisión."));
        }
      })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : text("Could not load prospects", "No se pudieron cargar los prospectos")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [text]);

  const selected = prospects.find((item) => item.id === selectedId) ?? prospects[0];
  async function update(status: "approved" | "discarded") {
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
  }

  async function createManualProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingManual(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/prospects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          category: form.get("category"),
          city: form.get("city"),
          country: form.get("country"),
          website: form.get("website"),
          phone: form.get("phone"),
          email: form.get("email"),
          instagram: form.get("instagram"),
          note: form.get("note"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      setProspects((current) => [body.prospect, ...current]);
      setSelectedId(body.prospect.id);
      setNotice(text("Manual prospect added. You can review and approve it immediately.", "Prospecto manual añadido. Puedes revisarlo y aprobarlo inmediatamente."));
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not create prospect", "No se pudo crear el prospecto"));
    } finally {
      setSavingManual(false);
    }
  }

  return <AppShell><div className="page-toolbar"><SectionHeading eyebrow={text("Prospects / review queue", "Prospectos / cola de revisión")} title={text("Review the signal, then decide.", "Revisa la señal y decide.")} detail={text("Only real prospects discovered for the active company appear here.", "Aquí solo aparecen prospectos reales descubiertos para la empresa activa.")} /><ButtonArrow href="/enviar">{text("Open outreach", "Abrir contacto")}</ButtonArrow></div>{notice && <p className="notice" aria-live="polite">{notice}</p>}{error && <p className="error" aria-live="polite">{error}</p>}{loading ? <section className="panel empty-state">{text("Loading prospects…", "Cargando prospectos…")}</section> : !selected ? <><section className="panel empty-workspace"><span className="empty-orbit"/><p className="eyebrow">{text("No sample data", "Sin datos de muestra")}</p><h2>{text("No prospects for this company yet.", "Aún no hay prospectos para esta empresa.")}</h2><p>{text("Run a radar scan or add one company manually to start the review queue.", "Ejecuta un escaneo de radar o añade una empresa manualmente para empezar la cola de revisión.")}</p><div className="empty-actions"><Link href="/radar" className="button button-primary">{text("Create a scan", "Crear un escaneo")}<span className="button-arrow"/></Link><a href="#manual-prospect" className="button button-ghost">{text("Add manually", "Añadir manualmente")}</a></div></section><section id="manual-prospect" className="panel manual-prospect-panel"><div className="panel-title"><h2>{text("Add a company manually", "Añadir una empresa manualmente")}</h2><span className="feature-status feature-status--partial">{text("Fallback", "Fallback")}</span></div><form className="settings-fields" onSubmit={createManualProspect}><label>{text("Company name", "Nombre de la empresa")}<input required name="name" placeholder="Preserva" /></label><label>{text("Category", "Categoría")}<input name="category" placeholder={text("e.g. hotels", "p. ej. hoteles")} /></label><label>{text("City", "Ciudad")}<input name="city" placeholder="Quito" /></label><label>{text("Country code", "Código de país")}<input name="country" maxLength={2} placeholder="EC" /></label><label>{text("Website", "Sitio web")}<input name="website" placeholder="preserva.com" /></label><label>{text("Phone", "Teléfono")}<input name="phone" placeholder="+593..." /></label><label>{text("Email", "Correo")}<input name="email" placeholder="hello@preserva.com" /></label><label>{text("Instagram", "Instagram")}<input name="instagram" placeholder="@preserva" /></label><label>{text("Why add this company?", "¿Por qué añadir esta empresa?")}<input name="note" placeholder={text("Short context for later review", "Contexto breve para la revisión")} /></label><button className="button button-primary" disabled={savingManual}>{savingManual ? text("Saving…", "Guardando…") : text("Create manual prospect", "Crear prospecto manual")}<span className="button-arrow"/></button></form></section></> : <><div className="review-layout"><aside className="panel score-panel"><span className="live-label">{selected.status}</span><div className="score-big">{selected.score ?? "—"}</div><div className="score-caption">{text("likelihood of fit", "probabilidad de encaje")}</div><div className="reason-list">{reasons(selected.score_reasons).length ? reasons(selected.score_reasons).map((reason) => <div className="reason" key={reason}>{reason}</div>) : <div className="reason">{text("No scoring reasons recorded yet", "Aún no hay motivos de puntuación registrados")}</div>}</div></aside><section className="panel review-main"><span className="eyebrow">{[selected.category, selected.city, selected.country].filter(Boolean).join(" · ")}</span><h2>{selected.name}</h2><p className="review-meta">{text("Best available channel", "Mejor canal disponible")}: {selected.best_channel ?? text("not identified", "no identificado")}</p><div className="prospect-facts"><div><span>{text("Address", "Dirección")}</span><strong>{selected.address ?? "—"}</strong></div><div><span>{text("Website", "Sitio web")}</span><strong>{selected.website ?? "—"}</strong></div><div><span>{text("Email", "Correo")}</span><strong>{selected.email ?? "—"}</strong></div><div><span>{text("Phone", "Teléfono")}</span><strong>{selected.phone ?? "—"}</strong></div><div><span>{text("Rating", "Valoración")}</span><strong>{selected.rating ? `${selected.rating} · ${selected.review_count ?? 0} ${text("reviews", "reseñas")}` : "—"}</strong></div></div><div className="review-actions"><button onClick={() => update("approved")} className="button button-primary">{text("Approve and draft message", "Aprobar y crear mensaje")}<span className="button-arrow">↗</span></button><button onClick={() => update("discarded")} className="button button-ghost">{text("Discard", "Descartar")}</button><span className="status-text">{selected.status}</span></div></section></div><div className="table-panel panel"><div className="panel-title"><h2>{text("Queue", "Cola")}</h2><a href="#manual-prospect">{text("Add manually", "Añadir manualmente")} ↗</a></div><div className="table-row table-head"><span>{text("Prospect", "Prospecto")}</span><span>{text("Status", "Estado")}</span><span>{text("Score", "Puntuación")}</span><span>{text("Location", "Ubicación")}</span><span>{text("Action", "Acción")}</span></div>{prospects.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className="table-row data-row"><span className="prospect-name"><span className="company-mark">{item.name.slice(0, 1)}</span>{item.name}</span><span className="status-chip">{item.status}</span><span className="score">{item.score ?? "—"}</span><span className="muted">{[item.city, item.country].filter(Boolean).join(", ") || "—"}</span><span className="muted">{text("Open", "Abrir")} ↗</span></button>)}</div><section id="manual-prospect" className="panel manual-prospect-panel"><div className="panel-title"><h2>{text("Need another company?", "¿Necesitas otra empresa?")}</h2><span className="feature-status">{text("Manual entry", "Entrada manual")}</span></div><form className="settings-fields manual-prospect-form" onSubmit={createManualProspect}><label>{text("Company name", "Nombre de la empresa")}<input required name="name" placeholder="Preserva" /></label><label>{text("Category", "Categoría")}<input name="category" placeholder={text("e.g. hospitality", "p. ej. hostelería")} /></label><label>{text("City", "Ciudad")}<input name="city" placeholder="Quito" /></label><label>{text("Country code", "Código de país")}<input name="country" maxLength={2} placeholder="EC" /></label><label>{text("Website", "Sitio web")}<input name="website" placeholder="preserva.com" /></label><label>{text("Phone", "Teléfono")}<input name="phone" placeholder="+593..." /></label><button className="button button-ghost" disabled={savingManual}>{savingManual ? text("Saving…", "Guardando…") : text("Add manual prospect", "Añadir prospecto manual")}</button></form></section></>}</AppShell>;
}
