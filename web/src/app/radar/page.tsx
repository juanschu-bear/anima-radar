"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AppShell, { SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Scan = {
  id: string;
  status: string;
  city: string;
  country: string;
  radius_m: number;
  categories: string[];
  sources: string[];
  counts: Record<string, number>;
  created_at: string | null;
  error?: string | null;
};

type ScanSource = "google_places" | "exa" | "manual";
type ProviderState = { google_places: boolean; exa: boolean; manual: boolean };

export default function RadarPage() {
  const router = useRouter();
  const { language, text } = useLanguage();

  const [setupCode] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("setup") : null,
  );
  const [scans, setScans] = useState<Scan[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [setupComplete, setSetupComplete] = useState(() =>
    Boolean(
      typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("setup")?.startsWith("business-dna"),
    ),
  );
  const [providers, setProviders] = useState<ProviderState>({ google_places: false, exa: false, manual: true });
  const [usesCreatedAtFallback, setUsesCreatedAtFallback] = useState(false);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [radius, setRadius] = useState("15");
  const [categories, setCategories] = useState("");
  const [sources, setSources] = useState<ScanSource[]>(["manual"]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasLiveProviders = providers.google_places || providers.exa;
  const latestScan = scans[0] ?? null;
  const activeScan = useMemo(
    () => (activeScanId ? scans.find((scan) => scan.id === activeScanId) ?? null : null),
    [activeScanId, scans],
  );

  useEffect(() => {
    let live = true;

    Promise.all([
      fetch("/api/scans", { cache: "no-store" }),
      fetch("/api/workspace", { cache: "no-store" }),
    ])
      .then(async ([scanResponse, workspaceResponse]) => {
        const scanBody = await scanResponse.json();
        const workspaceBody = await workspaceResponse.json();
        if (!scanResponse.ok) throw new Error(scanBody.detail);
        if (!workspaceResponse.ok) throw new Error(workspaceBody.detail);
        if (!live) return;

        const nextScans = Array.isArray(scanBody.scans) ? (scanBody.scans as Scan[]) : [];
        const nextProviders = scanBody.providers ?? { google_places: false, exa: false, manual: true };
        const unfinishedScan = nextScans.find((scan) => !["done", "failed"].includes(scan.status)) ?? null;

        setScans(nextScans);
        setProviders(nextProviders);
        setSources(resolveDefaultSources(nextProviders));
        setUsesCreatedAtFallback(scanBody.compatibility?.scans_created_at_fallback === true);
        setCompanyName(workspaceBody.tenant?.name ?? "");
        setActiveScanId(unfinishedScan?.id ?? null);
      })
      .catch((cause) => {
        if (live) {
          setError(
            cause instanceof Error
              ? cause.message
              : text("Could not load scans", "No se pudieron cargar los escaneos"),
          );
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [text]);

  useEffect(() => {
    if (!setupCode?.startsWith("business-dna")) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("setup");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
  }, [setupCode]);

  const handleScanFinished = useCallback(
    (scan: Scan) => {
      const discovered = Number(scan.counts?.unique ?? 0);
      const completionNotice =
        discovered > 0
          ? text(
              "The scan finished and surfaced real prospects. We are taking you into the review queue now.",
              "El escaneo terminó y encontró prospectos reales. Te llevamos ahora a la cola de revisión.",
            )
          : hasLiveProviders
            ? text(
                "The scan finished but did not find strong matches yet. We are taking you to the review queue so you can add one manually or widen the search.",
                "El escaneo terminó pero todavía no encontró coincidencias fuertes. Te llevamos a la cola de revisión para añadir una manualmente o ampliar la búsqueda.",
              )
            : text(
                "The scan was saved for this company. Because no live providers are active yet, the next step is manual prospect capture.",
                "El escaneo se guardó para esta empresa. Como todavía no hay proveedores activos, el siguiente paso es la captura manual de prospectos.",
              );

      setNotice(completionNotice);

      const destination =
        discovered > 0
          ? "/prospectos?notice=scan-complete"
          : !hasLiveProviders
            ? "/prospectos?notice=manual-needed"
            : "/prospectos?notice=no-matches";

      window.setTimeout(() => {
        router.push(destination as Route);
        router.refresh();
      }, 900);
    },
    [hasLiveProviders, router, text],
  );

  useEffect(() => {
    if (!activeScanId) return;

    let live = true;
    let timer: number | undefined;

    async function pollScan() {
      const response = await fetch(`/api/scans/${activeScanId}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (live) {
          setError(typeof body.detail === "string" ? body.detail : text("Could not refresh scan", "No se pudo actualizar el escaneo"));
          setActiveScanId(null);
        }
        return;
      }

      const nextScan = body.scan as Scan | null;
      if (!live || !nextScan) return;

      setUsesCreatedAtFallback(body.compatibility?.scans_created_at_fallback === true);
      setScans((current) => mergeScanIntoList(current, nextScan));

      if (nextScan.status === "done") {
        setActiveScanId(null);
        handleScanFinished(nextScan);
        return;
      }

      if (nextScan.status === "failed") {
        setActiveScanId(null);
        setError(nextScan.error ?? text("The scan failed", "El escaneo falló"));
        return;
      }

      timer = window.setTimeout(() => {
        void pollScan();
      }, 1800);
    }

    void pollScan();

    return () => {
      live = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeScanId, handleScanFinished, text]);

  async function startScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStarting(true);
    setNotice(null);
    setError(null);
    const formElement = event.currentTarget;

    const categoryList = categories
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city,
          country,
          radius_m: Number(radius) * 1000,
          categories: categoryList,
          sources,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);

      const nextScan = body as Scan;
      formElement.reset();
      setScans((current) => mergeScanIntoList(current, nextScan));
      setActiveScanId(nextScan.id);
      setNotice(
        text(
          "Scan started. Stay here for the live progress, then we will move you to the next step automatically.",
          "El escaneo comenzó. Quédate aquí para ver el progreso en vivo y luego te llevaremos al siguiente paso automáticamente.",
        ),
      );
      setCity("");
      setCountry("");
      setRadius("15");
      setCategories("");
      setSources(resolveDefaultSources(providers));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : text("Could not start scan", "No se pudo iniciar el escaneo"),
      );
    } finally {
      setStarting(false);
    }
  }

  return (
    <AppShell>
      {setupComplete && (
        <section className="notice setup-success" aria-live="polite">
          <div>
            <strong>{text("Business DNA saved", "ADN del negocio guardado")}{companyName ? ` · ${companyName}` : ""}</strong>
            <span>
              {text(
                "Next: create the first real market scan. Choose a city, radius and the business categories AnimaRadar should discover.",
                "Siguiente paso: crea el primer escaneo real. Elige una ciudad, un radio y las categorías que AnimaRadar debe descubrir.",
              )}
            </span>
          </div>
          <button type="button" onClick={() => setSetupComplete(false)} aria-label={text("Dismiss", "Cerrar")}>
            ×
          </button>
        </section>
      )}

      {notice && (
        <section className="notice setup-success" aria-live="polite">
          <div>
            <strong>
              {activeScanId ? text("Scan in progress", "Escaneo en progreso") : text("Scan complete", "Escaneo completado")}
            </strong>
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)} aria-label={text("Dismiss", "Cerrar")}>
            ×
          </button>
        </section>
      )}

      <div className="page-toolbar">
        <SectionHeading
          eyebrow={text("Radar / scans", "Radar / escaneos")}
          title={text("Point the lens at your next market.", "Apunta el radar a tu próximo mercado.")}
          detail={text(
            "Define a real location, radius and categories. The scan is stored only for the active company.",
            "Define una ubicación, un radio y categorías reales. El escaneo se guarda únicamente para la empresa activa.",
          )}
        />
      </div>

      {error && <p className="error" aria-live="polite">{error}</p>}

      {usesCreatedAtFallback && (
        <p className="notice" aria-live="polite">
          {text(
            "This workspace is still compatible with an older scans schema. Existing scan history is being shown through a safe fallback while the database catches up.",
            "Este espacio sigue siendo compatible con un esquema antiguo de escaneos. El historial actual se muestra mediante un fallback seguro mientras la base de datos se pone al día.",
          )}
        </p>
      )}

      <div className="learning-layout">
        <section className="panel learning-hero">
          <p className="eyebrow">{text("What happens next", "Qué pasa después")}</p>
          <h2>
            {text("Save one scan, then", "Guarda un escaneo y luego")}
            <br />
            <em>{text("review the surfaced companies.", "revisa las empresas detectadas.")}</em>
          </h2>
          <p>
            {hasLiveProviders
              ? text(
                  "This deployment can already query live providers. If a scan comes back empty, the manual fallback still keeps the workflow moving.",
                  "Esta implementación ya puede consultar proveedores reales. Si un escaneo vuelve vacío, el fallback manual igualmente mantiene el flujo en marcha.",
                )
              : text(
                  "This deployment is still running in manual-fallback mode. A saved scan becomes the container for the prospects you add next.",
                  "Esta implementación todavía funciona en modo fallback manual. Un escaneo guardado se convierte en el contenedor de los prospectos que añades después.",
                )}
          </p>
        </section>

        <section className="panel learning-progress">
          <div className="panel-title">
            <h2>{text("Radar state", "Estado del radar")}</h2>
            <span className={`feature-status ${hasLiveProviders ? "feature-status--ready" : "feature-status--partial"}`}>
              {hasLiveProviders ? text("Live discovery", "Descubrimiento real") : text("Manual workflow", "Flujo manual")}
            </span>
          </div>
          <div className="learning-stat">
            <strong>{scans.length}</strong>
            <span>{text("saved scans in this company", "escaneos guardados en esta empresa")}</span>
          </div>
          <div className="learning-stat">
            <strong>{latestScan?.counts?.unique ?? 0}</strong>
            <span>{text("prospects from the latest scan", "prospectos del último escaneo")}</span>
          </div>
          <div className="learning-stat">
            <strong>{latestScan ? statusLabel(latestScan.status, text) : "—"}</strong>
            <span>{text("latest scan status", "estado del último escaneo")}</span>
          </div>
        </section>
      </div>

      <div className="radar-layout">
        <section className="panel scan-builder">
          <div className="panel-title">
            <h2>{text("New scan", "Nuevo escaneo")}</h2>
            <span className={`feature-status ${hasLiveProviders ? "feature-status--ready" : "feature-status--partial"}`}>
              {hasLiveProviders ? text("Live discovery", "Descubrimiento real") : text("Manual fallback ready", "Fallback manual listo")}
            </span>
          </div>

          <form className="settings-fields" onSubmit={startScan}>
            <label>
              {text("City", "Ciudad")}
              <input
                required
                name="city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder={text("e.g. Quito", "p. ej. Quito")}
              />
            </label>
            <label>
              {text("Country code", "Código de país")}
              <input
                required
                name="country"
                maxLength={2}
                value={country}
                onChange={(event) => setCountry(event.target.value.toUpperCase())}
                placeholder="EC"
              />
            </label>
            <label>
              {text("Radius in km", "Radio en km")}
              <input
                required
                name="radius"
                type="number"
                min="1"
                max="100"
                value={radius}
                onChange={(event) => setRadius(event.target.value)}
              />
            </label>
            <label>
              {text("Business categories", "Categorías de negocio")}
              <input
                required
                name="categories"
                value={categories}
                onChange={(event) => setCategories(event.target.value)}
                placeholder={text("hotels, restaurants, agencies", "hoteles, restaurantes, agencias")}
              />
            </label>

            <fieldset className="source-selector">
              <legend>{text("Discovery sources", "Fuentes de descubrimiento")}</legend>
              <div className="source-grid">
                <SourceToggle
                  label="Google Places"
                  description={text("Best for businesses visible on the map.", "Mejor para negocios visibles en el mapa.")}
                  unavailableText={text("This provider is not configured in this deployment yet.", "Este proveedor todavía no está configurado en esta implementación.")}
                  checked={sources.includes("google_places")}
                  enabled={providers.google_places}
                  onChange={(checked) => setSources((current) => toggleSource(current, "google_places", checked))}
                />
                <SourceToggle
                  label="Exa"
                  description={text("Best for companies that are found through the web, not only maps.", "Mejor para empresas detectadas en la web, no solo en mapas.")}
                  unavailableText={text("This provider is not configured in this deployment yet.", "Este proveedor todavía no está configurado en esta implementación.")}
                  checked={sources.includes("exa")}
                  enabled={providers.exa}
                  onChange={(checked) => setSources((current) => toggleSource(current, "exa", checked))}
                />
                <SourceToggle
                  label={text("Manual fallback", "Fallback manual")}
                  description={text("Lets you continue even if no live providers are active.", "Te permite continuar incluso si no hay proveedores activos.")}
                  unavailableText={text("This provider is not configured in this deployment yet.", "Este proveedor todavía no está configurado en esta implementación.")}
                  checked={sources.includes("manual")}
                  enabled={providers.manual}
                  onChange={(checked) => setSources((current) => toggleSource(current, "manual", checked))}
                />
              </div>
            </fieldset>

            <div className="scan-helper">
              <strong>{text("About auto-discovery", "Sobre el auto-descubrimiento")}</strong>
              <p>
                {hasLiveProviders
                  ? text(
                      "Auto-discovery means AnimaRadar can query live external providers like Google Places or Exa for this scan. Manual fallback stays available when you want to add a company yourself or a provider returns nothing useful.",
                      "Auto-descubrimiento significa que AnimaRadar puede consultar proveedores externos reales como Google Places o Exa para este escaneo. El fallback manual sigue disponible cuando quieres añadir una empresa tú mismo o un proveedor no devuelve nada útil.",
                    )
                  : text(
                      "Auto-discovery is not active in this deployment yet because no live provider key is configured. Right now this screen still saves the market scan and hands you off to manual prospect capture.",
                      "El auto-descubrimiento todavía no está activo en esta implementación porque no hay ninguna clave de proveedor real configurada. Por ahora esta pantalla guarda el escaneo de mercado y te lleva a la captura manual de prospectos.",
                    )}
              </p>
            </div>

            <button className="button button-primary" disabled={starting || !sources.length || Boolean(activeScanId)}>
              {starting
                ? text("Starting scan…", "Iniciando escaneo…")
                : activeScanId
                  ? text("Scan running…", "Escaneo en marcha…")
                  : hasLiveProviders
                    ? text("Run live scan", "Ejecutar escaneo real")
                    : text("Save scan and continue", "Guardar escaneo y continuar")}
              <span className="button-arrow" />
            </button>
          </form>

          <div className="scan-helper">
            <strong>{text("What the selected sources mean", "Qué significan las fuentes seleccionadas")}</strong>
            <p>
              {hasLiveProviders
                ? text(
                    "You can combine map-based and web-based discovery. Manual fallback stays available so the workflow never blocks on provider coverage.",
                    "Puedes combinar descubrimiento basado en mapas y en la web. El fallback manual sigue disponible para que el flujo nunca dependa por completo de la cobertura de los proveedores.",
                  )
                : text(
                    "No live provider key is active in this deployment yet. Saving a scan will take you straight to manual prospect capture for this company.",
                    "Todavía no hay una clave de proveedor activa en esta implementación. Guardar un escaneo te llevará directamente a la captura manual de prospectos para esta empresa.",
                  )}
            </p>
          </div>

          {latestScan && (
            <div className="scan-progress-strip" aria-live="polite">
              <ProgressStep label={text("Found", "Encontrados")} value={latestScan.counts?.found ?? 0} active />
              <ProgressStep
                label={text("Read", "Leídos")}
                value={latestScan.counts?.unique ?? 0}
                active={["enriching", "scoring", "drafting", "done"].includes(latestScan.status)}
              />
              <ProgressStep
                label={text("Scored", "Puntuados")}
                value={latestScan.counts?.scored ?? 0}
                active={["scoring", "drafting", "done"].includes(latestScan.status)}
              />
              <ProgressStep
                label={text("Ready for review", "Listos para revisión")}
                value={latestScan.counts?.scored ?? 0}
                active={latestScan.status === "done"}
              />
            </div>
          )}

          {activeScan && (
            <div className="notice" aria-live="polite">
              <strong>{text("Current live scan", "Escaneo activo")}</strong>{" "}
              {`${activeScan.city}, ${activeScan.country} · ${statusLabel(activeScan.status, text)}`}
            </div>
          )}
        </section>

        <section className="panel scan-history">
          <div className="panel-title">
            <h2>{text("Scan history", "Historial de escaneos")}</h2>
            <span>{scans.length}</span>
          </div>

          {loading ? (
            <div className="empty-state">{text("Loading scans…", "Cargando escaneos…")}</div>
          ) : scans.length ? (
            <>
              {scans.map((scan) => (
                <div className="scan-row" key={scan.id}>
                  <span className={`status-dot status-dot--${scan.status}`} />
                  <div>
                    <strong>{scan.city}, {scan.country}</strong>
                    <small>
                      {scan.radius_m / 1000} km · {scan.categories.join(", ") || text("No categories", "Sin categorías")} ·{" "}
                      {scan.created_at
                        ? new Date(scan.created_at).toLocaleDateString(language === "es" ? "es-EC" : "en-US")
                        : text("Date unavailable", "Fecha no disponible")}
                    </small>
                  </div>
                  <span className="feature-status">{statusLabel(scan.status, text)}</span>
                </div>
              ))}
              <div className="empty-state empty-state--action">
                <strong>{text("After every scan, the next stop is the review queue.", "Después de cada escaneo, la siguiente parada es la cola de revisión.")}</strong>
                <p>{text("Use the review queue to approve real prospects, create the outreach sequence and then log the result.", "Usa la cola de revisión para aprobar prospectos reales, crear la secuencia de contacto y luego registrar el resultado.")}</p>
                <Link href="/prospectos">{text("Open review queue", "Abrir cola de revisión")} ↗</Link>
              </div>
            </>
          ) : (
            <div className="empty-state empty-state--action">
              <strong>{text("No scans for this company yet.", "Aún no hay escaneos para esta empresa.")}</strong>
              <p>{text("Your Business DNA is ready. Configure the first real market scan on the left.", "Tu ADN del negocio está listo. Configura el primer escaneo real a la izquierda.")}</p>
              <Link href="/perfil">{text("Review Business DNA", "Revisar ADN del negocio")} ↗</Link>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function statusLabel(status: string, text: (english: string, spanish: string) => string) {
  switch (status) {
    case "queued":
      return text("Queued", "En cola");
    case "discovering":
      return text("Discovering", "Descubriendo");
    case "enriching":
      return text("Reading", "Leyendo");
    case "scoring":
      return text("Scoring", "Puntuando");
    case "drafting":
      return text("Preparing next step", "Preparando el siguiente paso");
    case "done":
      return text("Done", "Listo");
    case "failed":
      return text("Failed", "Falló");
    default:
      return status;
  }
}

function toggleSource(current: ScanSource[], source: ScanSource, checked: boolean) {
  if (checked) return current.includes(source) ? current : [...current, source];
  return current.filter((item) => item !== source);
}

function resolveDefaultSources(providers: ProviderState) {
  const next: ScanSource[] = [];
  if (providers.google_places) next.push("google_places");
  if (providers.exa) next.push("exa");
  if (!next.length && providers.manual) next.push("manual");
  return next;
}

function mergeScanIntoList(current: Scan[], nextScan: Scan) {
  const remaining = current.filter((scan) => scan.id !== nextScan.id);
  return [nextScan, ...remaining];
}

function SourceToggle({
  label,
  description,
  unavailableText,
  checked,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  unavailableText: string;
  checked: boolean;
  enabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`source-card ${enabled ? "" : "source-card--disabled"}`}>
      <input type="checkbox" checked={checked} disabled={!enabled} onChange={(event) => onChange(event.target.checked)} />
      <div>
        <strong>{label}</strong>
        <small>{enabled ? description : unavailableText}</small>
      </div>
    </label>
  );
}

function ProgressStep({
  label,
  value,
  active,
}: {
  label: string;
  value: number;
  active: boolean;
}) {
  return (
    <div className={`scan-progress-step ${active ? "scan-progress-step--active" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
