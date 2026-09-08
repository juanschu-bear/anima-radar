"use client";

import { useEffect, useState } from "react";
import AppShell, { SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type ErrorEvent = {
  id: string;
  kind: "scan" | "job";
  title: string;
  status: string;
  detail: string;
  created_at: string | null;
  meta: Record<string, unknown>;
};

export default function ErrorsPage() {
  const { language, text } = useLanguage();
  const [events, setEvents] = useState<ErrorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/errors", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail);
        setEvents(body.events ?? []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : text("Could not load error view", "No se pudo cargar la vista de errores")))
      .finally(() => setLoading(false));
  }, [text]);

  return (
    <AppShell>
      <div className="page-toolbar">
        <SectionHeading
          eyebrow={text("Diagnostics / inspection", "Diagnóstico / inspección")}
          title={text("See what failed and why.", "Ver qué falló y por qué.")}
          detail={text(
            "This page shows failed scans and failed background jobs for the active company, so operational issues are visible instead of hidden.",
            "Esta página muestra escaneos fallidos y jobs fallidos de la empresa activa, para que los problemas operativos sean visibles y no queden ocultos.",
          )}
        />
      </div>

      {error && <p className="error" aria-live="polite">{error}</p>}

      <section className="panel outcome-records error-view">
        <div className="panel-title">
          <h2>{text("Recent failures", "Fallos recientes")}</h2>
          <span>{events.length}</span>
        </div>

        {loading ? (
          <div className="empty-state">{text("Loading failures…", "Cargando fallos…")}</div>
        ) : events.length ? (
          events.map((event) => (
            <article className="error-row" key={event.id}>
              <div className="error-row-head">
                <div>
                  <strong>{event.kind === "scan" ? text("Scan", "Escaneo") : text("Job", "Job")} · {event.title}</strong>
                  <small>
                    {event.created_at
                      ? new Date(event.created_at).toLocaleString(language === "es" ? "es-EC" : "en-US")
                      : text("Time unavailable", "Hora no disponible")}
                  </small>
                </div>
                <span className="feature-status feature-status--partial">{event.status}</span>
              </div>
              <p>{event.detail}</p>
              <details>
                <summary>{text("Open technical payload", "Abrir payload técnico")}</summary>
                <pre>{JSON.stringify(event.meta, null, 2)}</pre>
              </details>
            </article>
          ))
        ) : (
          <div className="empty-state empty-state--action">
            <strong>{text("No failed scans or jobs for this company.", "No hay escaneos ni jobs fallidos para esta empresa.")}</strong>
            <p>{text("That does not prove perfection, but it means the current live flow has not recorded an operational failure here yet.", "Eso no demuestra perfección, pero sí significa que el flujo en vivo actual todavía no registró un fallo operativo aquí.")}</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
