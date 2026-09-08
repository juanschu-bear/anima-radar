"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import AppShell, { SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Scan = { id: string; status: string; city: string; country: string; radius_m: number; categories: string[]; sources: string[]; counts: Record<string, number>; created_at: string | null };
type ScanSource = "google_places" | "exa" | "manual";
type ProviderState = { google_places: boolean; exa: boolean; manual: boolean };

export default function RadarPage() {
  const router = useRouter();
  const { language, text } = useLanguage();
  const [setupCode] = useState<string | null>(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("setup") : null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [setupComplete, setSetupComplete] = useState(() => Boolean(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup")?.startsWith("business-dna")));
  const [providers, setProviders] = useState<ProviderState>({ google_places: false, exa: false, manual: true });
  const [usesCreatedAtFallback, setUsesCreatedAtFallback] = useState(false);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [radius, setRadius] = useState("15");
  const [categories, setCategories] = useState("");
  const [sources, setSources] = useState<ScanSource[]>(["manual"]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestScan = scans[0] ?? null;
  const hasLiveProviders = providers.google_places || providers.exa;

  useEffect(() => {
    let live = true;
    Promise.all([fetch("/api/scans", { cache: "no-store" }), fetch("/api/workspace", { cache: "no-store" })])
      .then(async ([scanResponse, workspaceResponse]) => {
        const scanBody = await scanResponse.json();
        const workspaceBody = await workspaceResponse.json();
        if (!scanResponse.ok) throw new Error(scanBody.detail);
        if (!workspaceResponse.ok) throw new Error(workspaceBody.detail);
        if (live) {
          setScans(scanBody.scans ?? []);
          const nextProviders = scanBody.providers ?? { google_places: false, exa: false, manual: true };
          setProviders(nextProviders);
          setSources(resolveDefaultSources(nextProviders));
          setUsesCreatedAtFallback(scanBody.compatibility?.scans_created_at_fallback === true);
          setCompanyName(workspaceBody.tenant?.name ?? "");
        }
      })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : text("Could not load scans", "No se pudieron cargar los escaneos")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [text]);
  useEffect(() => {
    if (!setupCode?.startsWith("business-dna")) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("setup");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
  }, [setupCode]);

  async function startScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStarting(true);
    setError(null);
    const categoryList = categories.split(",").map((item) => item.trim()).filter(Boolean);
    try {
      const response = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, country, radius_m: Number(radius) * 1000, categories: categoryList, sources }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      setScans((current) => [{ ...(body as Scan) }, ...current]);
      const discovered = Number(body.counts?.unique ?? 0);
      setNotice(
        discovered > 0
          ? text("The scan was saved and surfaced real prospects. You are moving straight into the review queue now.", "El escaneo se guardó y encontró prospectos reales. Ahora pasas directamente a la cola de revisión.")
          : hasLiveProviders
            ? text("The scan was saved but returned no strong matches yet. You can widen the search or add a company manually next.", "El escaneo se guardó pero todavía no encontró coincidencias fuertes. A continuación puedes ampliar la búsqueda o añadir una empresa manualmente.")
            : text("The scan was saved for this company. Because no live providers are active yet, the next step is manual prospect capture.", "El escaneo se guardó para esta empresa. Como todavía no hay proveedores activos, el siguiente paso es la captura manual de prospectos."),
      );
      setCity("");
      setCountry("");
      setRadius("15");
      setCategories("");
      if (discovered > 0) {
        router.push("/prospectos?notice=scan-complete");
        router.refresh();
        return;
      }
      const manualOnly = !hasLiveProviders;
      router.push(manualOnly ? "/prospectos?notice=manual-needed" : "/prospectos?notice=no-matches");
      router.refresh();
      return;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not start scan", "No se pudo iniciar el escaneo"));
    } finally {
      setStarting(false);
    }
  }

  return <AppShell>
    {setupComplete && <section className="notice setup-success" aria-live="polite"><div><strong>{text("Business DNA saved", "ADN del negocio guardado")}{companyName ? ` · ${companyName}` : ""}</strong><span>{text("Next: create the first real market scan. Choose a city, radius and the business categories AnimaRadar should discover.", "Siguiente paso: crea el primer escaneo real. Elige una ciudad, un radio y las categorías que AnimaRadar debe descubrir.")}</span></div><button type="button" onClick={() => setSetupComplete(false)} aria-label={text("Dismiss", "Cerrar")}>×</button></section>}
    {notice && <section className="notice setup-success" aria-live="polite"><div><strong>{text("Scan complete", "Escaneo completado")}</strong><span>{notice}</span></div><button type="button" onClick={() => setNotice(null)} aria-label={text("Dismiss", "Cerrar")}>×</button></section>}
    <div className="page-toolbar"><SectionHeading eyebrow={text("Radar / scans", "Radar / escaneos")} title={text("Point the lens at your next market.", "Apunta el radar a tu próximo mercado.")} detail={text("Define a real location, radius and categories. The scan is stored only for the active company.", "Define una ubicación, un radio y categorías reales. El escaneo se guarda únicamente para la empresa activa.")} /></div>
    {error && <p className="error" aria-live="polite">{error}</p>}
    {usesCreatedAtFallback && <p className="notice" aria-live="polite">{text("This workspace is still compatible with an older scans schema. Existing scan history is being shown through a safe fallback while the database catches up.", "Este espacio sigue siendo compatible con un esquema antiguo de escaneos. El historial actual se muestra mediante un fallback seguro mientras la base de datos se pone al día.")}</p>}
    <div className="learning-layout">
      <section className="panel learning-hero"><p className="eyebrow">{text("What happens next", "Qué pasa después")}</p><h2>{text("Save one scan, then", "Guarda un escaneo y luego")}<br/><em>{text("review the surfaced companies.", "revisa las empresas detectadas.")}</em></h2><p>{hasLiveProviders ? text("This deployment can already query live providers. If a scan comes back empty, the manual fallback still keeps the workflow moving.", "Esta implementación ya puede consultar proveedores reales. Si un escaneo vuelve vacío, el fallback manual igualmente mantiene el flujo en marcha.") : text("This deployment is still running in manual-fallback mode. A saved scan becomes the container for the prospects you add next.", "Esta implementación todavía funciona en modo fallback manual. Un escaneo guardado se convierte en el contenedor de los prospectos que añades después.")}</p></section>
      <section className="panel learning-progress"><div className="panel-title"><h2>{text("Radar state", "Estado del radar")}</h2><span className={`feature-status ${hasLiveProviders ? "feature-status--ready" : "feature-status--partial"}`}>{hasLiveProviders ? text("Live discovery", "Descubrimiento real") : text("Manual workflow", "Flujo manual")}</span></div><div className="learning-stat"><strong>{scans.length}</strong><span>{text("saved scans in this company", "escaneos guardados en esta empresa")}</span></div><div className="learning-stat"><strong>{latestScan?.counts?.unique ?? 0}</strong><span>{text("prospects from the latest scan", "prospectos del último escaneo")}</span></div><div className="learning-stat"><strong>{latestScan ? statusLabel(latestScan.status, text) : "—"}</strong><span>{text("latest scan status", "estado del último escaneo")}</span></div></section>
    </div>
    <div className="radar-layout">
      <section className="panel scan-builder"><div className="panel-title"><h2>{text("New scan", "Nuevo escaneo")}</h2><span className={`feature-status ${hasLiveProviders ? "feature-status--ready" : "feature-status--partial"}`}>{hasLiveProviders ? text("Live discovery", "Descubrimiento real") : text("Manual fallback ready", "Fallback manual listo")}</span></div><form className="settings-fields" onSubmit={startScan}><label>{text("City", "Ciudad")}<input required name="city" value={city} onChange={(event) => setCity(event.target.value)} placeholder={text("e.g. Quito", "p. ej. Quito")} /></label><label>{text("Country code", "Código de país")}<input required name="country" maxLength={2} value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} placeholder="EC" /></label><label>{text("Radius in km", "Radio en km")}<input required name="radius" type="number" min="1" max="100" value={radius} onChange={(event) => setRadius(event.target.value)} /></label><label>{text("Business categories", "Categorías de negocio")}<input required name="categories" value={categories} onChange={(event) => setCategories(event.target.value)} placeholder={text("hotels, restaurants, agencies", "hoteles, restaurantes, agencias")} /></label><fieldset className="source-selector"><legend>{text("Discovery sources", "Fuentes de descubrimiento")}</legend><div className="source-grid"><SourceToggle label="Google Places" description={text("Best for businesses visible on the map.", "Mejor para negocios visibles en el mapa.")} unavailableText={text("This provider is not configured in this deployment yet.", "Este proveedor todavía no está configurado en esta implementación.")} checked={sources.includes("google_places")} enabled={providers.google_places} onChange={(checked) => setSources((current) => toggleSource(current, "google_places", checked))} /><SourceToggle label="Exa" description={text("Best for companies that are found through the web, not only maps.", "Mejor para empresas detectadas en la web, no solo en mapas.")} unavailableText={text("This provider is not configured in this deployment yet.", "Este proveedor todavía no está configurado en esta implementación.")} checked={sources.includes("exa")} enabled={providers.exa} onChange={(checked) => setSources((current) => toggleSource(current, "exa", checked))} /><SourceToggle label={text("Manual fallback", "Fallback manual")} description={text("Lets you continue even if no live providers are active.", "Te permite continuar incluso si no hay proveedores activos.")} unavailableText={text("This provider is not configured in this deployment yet.", "Este proveedor todavía no está configurado en esta implementación.")} checked={sources.includes("manual")} enabled={providers.manual} onChange={(checked) => setSources((current) => toggleSource(current, "manual", checked))} /></div></fieldset><button className="button button-primary" disabled={starting || !sources.length}>{starting ? text("Discovering businesses…", "Descubriendo empresas…") : hasLiveProviders ? text("Run live scan", "Ejecutar escaneo real") : text("Save scan and continue", "Guardar escaneo y continuar")}<span className="button-arrow"/></button></form><div className="scan-helper"><strong>{text("What the selected sources mean", "Qué significan las fuentes seleccionadas")}</strong><p>{hasLiveProviders ? text("You can combine map-based and web-based discovery. Manual fallback stays available so the workflow never blocks on provider coverage.", "Puedes combinar descubrimiento basado en mapas y en la web. El fallback manual sigue disponible para que el flujo nunca dependa por completo de la cobertura de los proveedores.") : text("No live provider key is active in this deployment yet. Saving a scan will take you straight to manual prospect capture for this company.", "Todavía no hay una clave de proveedor activa en esta implementación. Guardar un escaneo te llevará directamente a la captura manual de prospectos para esta empresa.")}</p></div>{latestScan && <div className="scan-progress-strip" aria-live="polite"><ProgressStep label={text("Found", "Encontrados")} value={latestScan.counts?.found ?? 0} active /><ProgressStep label={text("Unique", "Únicos")} value={latestScan.counts?.unique ?? 0} active={(latestScan.counts?.unique ?? 0) > 0 || latestScan.status !== "queued"} /><ProgressStep label={text("Enriched", "Enriquecidos")} value={latestScan.counts?.enriched ?? 0} active={["enriching", "scoring", "drafting", "done"].includes(latestScan.status)} /><ProgressStep label={text("Ready for review", "Listos para revisión")} value={latestScan.counts?.scored ?? 0} active={latestScan.status === "done"} /></div>}</section>
      <section className="panel scan-history"><div className="panel-title"><h2>{text("Scan history", "Historial de escaneos")}</h2><span>{scans.length}</span></div>{loading ? <div className="empty-state">{text("Loading scans…", "Cargando escaneos…")}</div> : scans.length ? <>{scans.map((scan) => <div className="scan-row" key={scan.id}><span className={`status-dot status-dot--${scan.status}`}/><div><strong>{scan.city}, {scan.country}</strong><small>{scan.radius_m / 1000} km · {scan.categories.join(", ") || text("No categories", "Sin categorías")} · {scan.created_at ? new Date(scan.created_at).toLocaleDateString(language === "es" ? "es-EC" : "en-US") : text("Date unavailable", "Fecha no disponible")}</small></div><span className="feature-status">{statusLabel(scan.status, text)}</span></div>)}<div className="empty-state empty-state--action"><strong>{text("After every scan, the next stop is the review queue.", "Después de cada escaneo, la siguiente parada es la cola de revisión.")}</strong><p>{text("Use the review queue to approve real prospects, create the outreach sequence and then log the result.", "Usa la cola de revisión para aprobar prospectos reales, crear la secuencia de contacto y luego registrar el resultado.")}</p><Link href="/prospectos">{text("Open review queue", "Abrir cola de revisión")} ↗</Link></div></> : <div className="empty-state empty-state--action"><strong>{text("No scans for this company yet.", "Aún no hay escaneos para esta empresa.")}</strong><p>{text("Your Business DNA is ready. Configure the first real market scan on the left.", "Tu ADN del negocio está listo. Configura el primer escaneo real a la izquierda.")}</p><Link href="/perfil">{text("Review Business DNA", "Revisar ADN del negocio")} ↗</Link></div>}</section>
    </div>
  </AppShell>;
}

function statusLabel(status: string, text: (english: string, spanish: string) => string) {
  switch (status) {
    case "queued": return text("Queued", "En cola");
    case "discovering": return text("Discovering", "Descubriendo");
    case "enriching": return text("Enriching", "Enriqueciendo");
    case "scoring": return text("Scoring", "Puntuando");
    case "drafting": return text("Drafting", "Redactando");
    case "done": return text("Done", "Listo");
    case "failed": return text("Failed", "Falló");
    default: return status;
  }
}

function toggleSource(current: ScanSource[], source: ScanSource, checked: boolean) {
  if (checked) return current.includes(source) ? current : [...current, source];
  const next = current.filter((item) => item !== source);
  return next;
}

function resolveDefaultSources(providers: ProviderState) {
  const next: ScanSource[] = [];
  if (providers.google_places) next.push("google_places");
  if (providers.exa) next.push("exa");
  if (!next.length && providers.manual) next.push("manual");
  return next;
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
      <input
        type="checkbox"
        checked={checked}
        disabled={!enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
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
