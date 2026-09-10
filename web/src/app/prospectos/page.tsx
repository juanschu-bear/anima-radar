"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell, { ButtonArrow, SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type DraftPreview = {
  subject: string | null;
  body: string;
  channel: string;
  lang: string;
};

type Prospect = {
  id: string;
  scan_id: string;
  source: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  rating: number | null;
  review_count: number | null;
  raw?: unknown;
  enrichment?: unknown;
  score: number | null;
  score_reasons: unknown;
  best_channel: string | null;
  status: string;
  created_at: string;
  draft_preview?: DraftPreview | null;
};

function reasons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object" && "reason" in item
          ? String(item.reason)
          : "",
    )
    .filter(Boolean);
}

function pickNextReviewProspect(prospects: Prospect[], currentId: string) {
  const currentIndex = prospects.findIndex((item) => item.id === currentId);
  const forward = prospects.slice(currentIndex + 1).find((item) => item.status === "new");
  if (forward) return forward.id;
  const backward = prospects.slice(0, Math.max(currentIndex, 0)).find((item) => item.status === "new");
  if (backward) return backward.id;
  return prospects.find((item) => item.id !== currentId)?.id ?? currentId;
}

export default function ProspectsPage() {
  const { text } = useLanguage();
  const [incomingNoticeCode] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("notice") : null,
  );
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingManual, setSavingManual] = useState(false);
  const [bulkThreshold, setBulkThreshold] = useState("70");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [redraftInstruction, setRedraftInstruction] = useState("");
  const [redrafting, setRedrafting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draftBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const manualFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/prospects", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail);
        if (!live) return;
        const nextProspects = body.prospects ?? [];
        setProspects(nextProspects);
        setSelectedId(nextProspects[0]?.id ?? "");
        setDraftEdits(
          Object.fromEntries(
            nextProspects
              .filter((item: Prospect) => item.draft_preview)
              .map((item: Prospect) => [
                item.id,
                {
                  subject: item.draft_preview?.subject ?? "",
                  body: item.draft_preview?.body ?? "",
                },
              ]),
          ),
        );
        if (incomingNoticeCode === "scan-complete") {
          setNotice(
            text(
              "The scan finished and the matching businesses are now ready for review.",
              "El escaneo terminó y las empresas coincidentes ya están listas para revisión.",
            ),
          );
        } else if (incomingNoticeCode === "manual-needed") {
          setNotice(
            text(
              "This company can already work manually. Add the first prospect below and continue the workflow immediately.",
              "Esta empresa ya puede trabajar de forma manual. Añade el primer prospecto abajo y continúa el flujo inmediatamente.",
            ),
          );
        } else if (incomingNoticeCode === "no-matches") {
          setNotice(
            text(
              "The scan finished, but no strong matches were found yet. Add a company manually or broaden the market criteria.",
              "El escaneo terminó, pero todavía no encontró coincidencias fuertes. Añade una empresa manualmente o amplía los criterios del mercado.",
            ),
          );
        }
      })
      .catch((cause) => {
        if (live) {
          setError(cause instanceof Error ? cause.message : text("Could not load prospects", "No se pudieron cargar los prospectos"));
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [incomingNoticeCode, text]);

  useEffect(() => {
    if (!incomingNoticeCode) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("notice");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
  }, [incomingNoticeCode]);

  const selected = prospects.find((item) => item.id === selectedId) ?? prospects[0];
  const selectedDraft = useMemo(() => {
    if (!selected) return null;
    return draftEdits[selected.id] ?? {
      subject: selected.draft_preview?.subject ?? "",
      body: selected.draft_preview?.body ?? "",
    };
  }, [draftEdits, selected]);
  const reviewable = useMemo(() => prospects.filter((item) => item.status === "new"), [prospects]);
  const queueSummary = {
    review: prospects.filter((item) => item.status === "new").length,
    approved: prospects.filter((item) => item.status === "approved").length,
    sent: prospects.filter((item) => ["sent", "replied", "converted", "lost"].includes(item.status)).length,
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
    setNotice(null);
    const response = await fetch("/api/prospects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        status,
        preview_override: status === "approved" && selectedDraft ? selectedDraft : undefined,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.detail);
      return;
    }
    const nextProspects = prospects.map((item) => item.id === selected.id ? { ...item, status } : item);
    setProspects(nextProspects);
    const nextSelectedId = pickNextReviewProspect(nextProspects, selected.id);
    if (nextSelectedId) setSelectedId(nextSelectedId);
    setNotice(
      status === "approved"
        ? text(
            "Prospect approved. The outreach draft is now ready, and you can keep reviewing the next company.",
            "Prospecto aprobado. El borrador de contacto ya está listo y puedes seguir revisando la siguiente empresa.",
          )
        : text(
            "Prospect discarded. Moving on to the next review candidate.",
            "Prospecto descartado. Seguimos con el siguiente candidato de revisión.",
          ),
    );
  }, [prospects, selected, selectedDraft, text]);

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
      if (event.key.toLowerCase() === "e" && selectedDraft) {
        event.preventDefault();
        draftBodyRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveSelection, selected, selectedDraft, update]);

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
    const form = new FormData(event.currentTarget);
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
      manualFormRef.current?.reset();
      setProspects((current) => [body.prospect, ...current]);
      setSelectedId(body.prospect.id);
      if (body.prospect.draft_preview) {
        setDraftEdits((current) => ({
          ...current,
          [body.prospect.id]: {
            subject: body.prospect.draft_preview.subject ?? "",
            body: body.prospect.draft_preview.body ?? "",
          },
        }));
      }
      setNotice(
        text(
          "Manual prospect added. You can review and approve it immediately.",
          "Prospecto manual añadido. Puedes revisarlo y aprobarlo inmediatamente.",
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not create prospect", "No se pudo crear el prospecto"));
    } finally {
      setSavingManual(false);
    }
  }

  async function redraftSelected() {
    if (!selected || !redraftInstruction.trim()) return;
    setRedrafting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/prospects/${selected.id}/redraft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: redraftInstruction }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      setDraftEdits((current) => ({
        ...current,
        [selected.id]: {
          subject: body.preview?.subject ?? "",
          body: body.preview?.body ?? "",
        },
      }));
      setNotice(
        text(
          "Draft regenerated from your instruction. Review it, then approve when it reads right.",
          "El borrador se regeneró con tu instrucción. Revísalo y aprueba cuando suene bien.",
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not redraft this message", "No se pudo regenerar este mensaje"));
    } finally {
      setRedrafting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-toolbar">
        <SectionHeading
          eyebrow={text("Prospects / review queue", "Prospectos / cola de revisión")}
          title={text("Review the signal, then decide.", "Revisa la señal y decide.")}
          detail={text(
            "This queue belongs only to the active company. From here you either approve, discard or add a company manually.",
            "Esta cola pertenece solo a la empresa activa. Desde aquí apruebas, descartas o añades una empresa manualmente.",
          )}
        />
        <ButtonArrow href="/enviar">{text("Open outreach", "Abrir contacto")}</ButtonArrow>
      </div>

      {notice && <p className="notice" aria-live="polite">{notice}</p>}
      {error && <p className="error" aria-live="polite">{error}</p>}

      {loading ? (
        <section className="panel empty-state">{text("Loading prospects…", "Cargando prospectos…")}</section>
      ) : !selected ? (
        <>
          <section className="panel empty-workspace">
            <span className="empty-orbit" />
            <p className="eyebrow">{text("No sample data", "Sin datos de muestra")}</p>
            <h2>{text("No prospects for this company yet.", "Aún no hay prospectos para esta empresa.")}</h2>
            <p>{text("Run a radar scan or add one company manually to start the review queue.", "Ejecuta un escaneo de radar o añade una empresa manualmente para empezar la cola de revisión.")}</p>
            <div className="empty-actions">
              <Link href="/radar" className="button button-primary">
                {text("Create a scan", "Crear un escaneo")}
                <span className="button-arrow" />
              </Link>
              <a href="#manual-prospect" className="button button-ghost">{text("Add manually", "Añadir manualmente")}</a>
            </div>
          </section>

          <section id="manual-prospect" className="panel manual-prospect-panel">
            <div className="panel-title">
              <h2>{text("Add a company manually", "Añadir una empresa manualmente")}</h2>
              <span className="feature-status feature-status--partial">{text("Fallback", "Fallback")}</span>
            </div>
            <form ref={manualFormRef} className="settings-fields" onSubmit={createManualProspect}>
              <label>{text("Company name", "Nombre de la empresa")}<input required name="name" placeholder="Preserva" /></label>
              <label>{text("Category", "Categoría")}<input name="category" placeholder={text("e.g. hotels", "p. ej. hoteles")} /></label>
              <label>{text("City", "Ciudad")}<input name="city" placeholder="Quito" /></label>
              <label>{text("Country code", "Código de país")}<input name="country" maxLength={2} placeholder="EC" /></label>
              <label>{text("Website", "Sitio web")}<input name="website" placeholder="preserva.com" /></label>
              <label>{text("Phone", "Teléfono")}<input name="phone" placeholder="+593..." /></label>
              <label>{text("Email", "Correo")}<input name="email" placeholder="hello@preserva.com" /></label>
              <label>{text("Instagram", "Instagram")}<input name="instagram" placeholder="@preserva" /></label>
              <label>{text("Why add this company?", "¿Por qué añadir esta empresa?")}<input name="note" placeholder={text("Short context for later review", "Contexto breve para la revisión")} /></label>
              <button className="button button-primary" disabled={savingManual}>
                {savingManual ? text("Saving…", "Guardando…") : text("Create manual prospect", "Crear prospecto manual")}
                <span className="button-arrow" />
              </button>
            </form>
          </section>
        </>
      ) : (
        <>
          <div className="learning-layout">
            <section className="panel learning-progress">
              <div className="panel-title">
                <h2>{text("Queue health", "Estado de la cola")}</h2>
                <span className="feature-status feature-status--ready">{prospects.length}</span>
              </div>
              <div className="learning-stat"><strong>{queueSummary.review}</strong><span>{text("ready for review", "listas para revisar")}</span></div>
              <div className="learning-stat"><strong>{queueSummary.approved}</strong><span>{text("approved and waiting for outreach", "aprobadas y esperando contacto")}</span></div>
              <div className="learning-stat"><strong>{queueSummary.sent}</strong><span>{text("already contacted", "ya contactadas")}</span></div>
            </section>

            <section className="panel learning-hero">
              <p className="eyebrow">{text("Review logic", "Lógica de revisión")}</p>
              <h2>{text("Approve only what", "Aprueba solo lo que")}<br /><em>{text("you would actually contact.", "de verdad contactarías.")}</em></h2>
              <p>{text("Approval creates the full outreach sequence, but you can already refine the first draft before you approve it.", "La aprobación crea la secuencia completa de contacto, pero ya puedes refinar el primer borrador antes de aprobarlo.")}</p>
            </section>
          </div>

          <section className="panel review-toolbar">
            <div>
              <p className="eyebrow">{text("Review progress", "Progreso de revisión")}</p>
              <strong>{Math.max(prospects.length - queueSummary.review, 0)} / {prospects.length} {text("reviewed", "revisados")}</strong>
              <small>{text("Keyboard: A approve · E edit draft · D discard · ←/→ navigate", "Teclado: A aprobar · E editar borrador · D descartar · ←/→ navegar")}</small>
            </div>
            <div className="bulk-approve">
              <label>
                {text("Bulk approve from score", "Aprobación masiva desde puntuación")}
                <input type="number" min="0" max="100" value={bulkThreshold} onChange={(event) => setBulkThreshold(event.target.value)} />
              </label>
              <button className="button button-ghost" onClick={bulkApprove} disabled={bulkSaving || !reviewable.length}>
                {bulkSaving ? text("Approving…", "Aprobando…") : text("Approve matching prospects", "Aprobar prospectos coincidentes")}
              </button>
            </div>
          </section>

          <div className="review-layout">
            <aside className="panel score-panel">
              <span className="live-label">{selected.status}</span>
              <div className="score-big">{selected.score ?? "—"}</div>
              <div className="score-caption">{text("likelihood of fit", "probabilidad de encaje")}</div>
              <div className="reason-list">
                {reasons(selected.score_reasons).length
                  ? reasons(selected.score_reasons).map((reason) => <div className="reason" key={reason}>{reason}</div>)
                  : <div className="reason">{text("No scoring reasons recorded yet", "Aún no hay motivos de puntuación registrados")}</div>}
              </div>
            </aside>

            <section className="panel review-main">
              <span className="eyebrow">{[selected.category, selected.city, selected.country].filter(Boolean).join(" · ")}</span>
              <h2>{selected.name}</h2>
              <p className="review-meta">{text("Best available channel", "Mejor canal disponible")}: {selected.best_channel ?? text("not identified", "no identificado")}</p>

              <div className="prospect-facts">
                <div><span>{text("Source", "Fuente")}</span><strong>{sourceLabel(selected.source, text)}</strong></div>
                <div><span>{text("Address", "Dirección")}</span><strong>{selected.address ?? "—"}</strong></div>
                <div><span>{text("Website", "Sitio web")}</span><strong>{selected.website ?? "—"}</strong></div>
                <div><span>{text("Email", "Correo")}</span><strong>{selected.email ?? "—"}</strong></div>
                <div><span>{text("Phone", "Teléfono")}</span><strong>{selected.phone ?? "—"}</strong></div>
                <div><span>{text("Rating", "Valoración")}</span><strong>{selected.rating ? `${selected.rating} · ${selected.review_count ?? 0} ${text("reviews", "reseñas")}` : "—"}</strong></div>
              </div>

              <div className="research-panel">
                <div className="panel-title">
                  <h3>{text("Why this company surfaced", "Por qué apareció esta empresa")}</h3>
                  <span className="feature-status">{text("Observed data", "Datos observados")}</span>
                </div>
                <div className="research-list">
                  {extractResearchSignals(selected, text).map((item) => (
                    <div className="research-item" key={`${item.label}-${item.value}`}>
                      <span>{item.label}</span>
                      {item.href ? (
                        <a href={item.href} target="_blank" rel="noreferrer">
                          {item.value}
                        </a>
                      ) : (
                        <strong>{item.value}</strong>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="review-draft">
                <div className="panel-title">
                  <h3>{text("Draft before approval", "Borrador antes de aprobar")}</h3>
                  <span className="feature-status">{text("Editable", "Editable")}</span>
                </div>

                <div className="draft-instruction-bar">
                  <input
                    value={redraftInstruction}
                    onChange={(event) => setRedraftInstruction(event.target.value)}
                    placeholder={text("e.g. shorter, mention weddings, make it more direct", "p. ej. más corto, menciona bodas, hazlo más directo")}
                  />
                  <button
                    type="button"
                    className="button button-ghost"
                    disabled={!selectedDraft || redrafting || redraftInstruction.trim().length < 3}
                    onClick={() => void redraftSelected()}
                  >
                    {redrafting ? text("Redrafting…", "Regenerando…") : text("Redraft from instruction", "Regenerar desde instrucción")}
                  </button>
                </div>

                {selectedDraft ? (
                  <div className="settings-fields review-draft-fields">
                    <label>
                      {text("Subject", "Asunto")}
                      <input
                        value={selectedDraft.subject}
                        onChange={(event) => setDraftEdits((current) => ({
                          ...current,
                          [selected.id]: { subject: event.target.value, body: selectedDraft.body },
                        }))}
                      />
                    </label>
                    <label>
                      {text("Message draft", "Borrador del mensaje")}
                      <textarea
                        ref={draftBodyRef}
                        rows={8}
                        value={selectedDraft.body}
                        onChange={(event) => setDraftEdits((current) => ({
                          ...current,
                          [selected.id]: { subject: selectedDraft.subject, body: event.target.value },
                        }))}
                      />
                    </label>
                  </div>
                ) : (
                  <p className="muted">{text("A live draft preview will appear as soon as this company has a saved Business DNA.", "La vista previa del borrador aparecerá en cuanto esta empresa tenga un ADN del negocio guardado.")}</p>
                )}
              </div>

              <div className="review-actions">
                <button onClick={() => update("approved")} className="button button-primary">{text("Approve and prepare sequence", "Aprobar y preparar secuencia")}<span className="button-arrow">↗</span></button>
                <button onClick={() => update("discarded")} className="button button-ghost">{text("Discard", "Descartar")}</button>
                <span className="status-text">{selected.status}</span>
              </div>
            </section>
          </div>

          <div className="table-panel panel">
            <div className="panel-title">
              <h2>{text("Queue", "Cola")}</h2>
              <a href="#manual-prospect">{text("Add manually", "Añadir manualmente")} ↗</a>
            </div>
            <div className="table-row table-head">
              <span>{text("Prospect", "Prospecto")}</span>
              <span>{text("Status", "Estado")}</span>
              <span>{text("Score", "Puntuación")}</span>
              <span>{text("Location", "Ubicación")}</span>
              <span>{text("Action", "Acción")}</span>
            </div>
            {prospects.map((item) => (
              <button key={item.id} onClick={() => setSelectedId(item.id)} className={`table-row data-row ${item.id === selected.id ? "data-row--active" : ""}`}>
                <span className="prospect-name"><span className="company-mark">{item.name.slice(0, 1)}</span>{item.name}</span>
                <span className="status-chip">{item.status}</span>
                <span className="score">{item.score ?? "—"}</span>
                <span className="muted">{[item.city, item.country].filter(Boolean).join(", ") || "—"}</span>
                <span className="muted">{text("Open", "Abrir")} ↗</span>
              </button>
            ))}
          </div>

          <section id="manual-prospect" className="panel manual-prospect-panel">
            <div className="panel-title">
              <h2>{text("Need another company?", "¿Necesitas otra empresa?")}</h2>
              <span className="feature-status">{text("Manual entry", "Entrada manual")}</span>
            </div>
            <form ref={manualFormRef} className="settings-fields manual-prospect-form" onSubmit={createManualProspect}>
              <label>{text("Company name", "Nombre de la empresa")}<input required name="name" placeholder="Preserva" /></label>
              <label>{text("Category", "Categoría")}<input name="category" placeholder={text("e.g. hospitality", "p. ej. hostelería")} /></label>
              <label>{text("City", "Ciudad")}<input name="city" placeholder="Quito" /></label>
              <label>{text("Country code", "Código de país")}<input name="country" maxLength={2} placeholder="EC" /></label>
              <label>{text("Website", "Sitio web")}<input name="website" placeholder="preserva.com" /></label>
              <label>{text("Phone", "Teléfono")}<input name="phone" placeholder="+593..." /></label>
              <label>{text("Email", "Correo")}<input name="email" placeholder="hello@preserva.com" /></label>
              <label>{text("Instagram", "Instagram")}<input name="instagram" placeholder="@preserva" /></label>
              <label>{text("Why add this company?", "¿Por qué añadir esta empresa?")}<textarea name="note" rows={3} placeholder={text("Short context for later review", "Contexto breve para la revisión")} /></label>
              <button className="button button-ghost" disabled={savingManual}>{savingManual ? text("Saving…", "Guardando…") : text("Add manual prospect", "Añadir prospecto manual")}</button>
            </form>
          </section>
        </>
      )}
    </AppShell>
  );
}

function sourceLabel(source: string, text: (english: string, spanish: string) => string) {
  if (source === "google_places") return "Google Places";
  if (source === "exa") return "Exa";
  if (source === "manual") return text("Manual entry", "Entrada manual");
  return source;
}

function extractResearchSignals(
  prospect: Prospect,
  text: (english: string, spanish: string) => string,
) {
  const raw = readObject(prospect.raw);
  const enrichment = readObject(prospect.enrichment);
  const items: Array<{ label: string; value: string; href?: string }> = [
    {
      label: text("Best channel", "Mejor canal"),
      value: prospect.best_channel ?? text("Not identified yet", "Todavía no identificado"),
    },
  ];

  if (prospect.source === "manual") {
    const note = typeof raw?.manual_note === "string" ? raw.manual_note.trim() : "";
    if (note) {
      items.push({
        label: text("Operator note", "Nota del operador"),
        value: note,
      });
    }
  }

  if (typeof raw?.formattedAddress === "string" && raw.formattedAddress.trim()) {
    items.push({
      label: text("Observed address", "Dirección observada"),
      value: raw.formattedAddress.trim(),
    });
  }

  if (typeof raw?.primaryType === "string" && raw.primaryType.trim()) {
    items.push({
      label: text("Observed category", "Categoría observada"),
      value: raw.primaryType.trim(),
    });
  }

  if (typeof raw?.businessStatus === "string" && raw.businessStatus.trim()) {
    items.push({
      label: text("Business status", "Estado del negocio"),
      value: raw.businessStatus.trim(),
    });
  }

  if (typeof raw?.url === "string" && raw.url.trim()) {
    items.push({
      label: text("Web source", "Fuente web"),
      value: compactSnippet(raw.url, 72),
      href: raw.url,
    });
  }

  if (typeof prospect.website === "string" && prospect.website.trim()) {
    items.push({
      label: text("Company website", "Sitio web de la empresa"),
      value: compactSnippet(prospect.website, 72),
      href: prospect.website,
    });
  }

  if (typeof raw?.text === "string" && raw.text.trim()) {
    items.push({
      label: text("Observed web evidence", "Evidencia web observada"),
      value: compactSnippet(raw.text, 190),
    });
  }

  if (typeof enrichment?.mode === "string" && enrichment.mode.trim()) {
    items.push({
      label: text("Capture mode", "Modo de captura"),
      value: enrichment.mode.trim(),
    });
  }

  return items;
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function compactSnippet(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}
