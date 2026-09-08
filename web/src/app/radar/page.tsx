"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import AppShell, { SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Scan = { id: string; status: string; city: string; country: string; radius_m: number; categories: string[]; sources: string[]; counts: Record<string, number>; created_at: string };

export default function RadarPage() {
  const router = useRouter();
  const { language, text } = useLanguage();
  const [setupCode] = useState<string | null>(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("setup") : null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [setupComplete, setSetupComplete] = useState(() => Boolean(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup")?.startsWith("business-dna")));
  const [providers, setProviders] = useState({ google_places: false, exa: false, manual: true });
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
          setProviders(scanBody.providers ?? { google_places: false, exa: false, manual: true });
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const city = String(form.get("city") ?? "");
    const country = String(form.get("country") ?? "");
    const radius = Number(form.get("radius"));
    const categories = String(form.get("categories") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    try {
      const response = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, country, radius_m: radius * 1000, categories, sources: ["google_places", "exa"] }) });
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
      formElement.reset();
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
    <div className="learning-layout">
      <section className="panel learning-hero"><p className="eyebrow">{text("What happens next", "Qué pasa después")}</p><h2>{text("Save one scan, then", "Guarda un escaneo y luego")}<br/><em>{text("review the surfaced companies.", "revisa las empresas detectadas.")}</em></h2><p>{hasLiveProviders ? text("This deployment can already query live providers. If a scan comes back empty, the manual fallback still keeps the workflow moving.", "Esta implementación ya puede consultar proveedores reales. Si un escaneo vuelve vacío, el fallback manual igualmente mantiene el flujo en marcha.") : text("This deployment is still running in manual-fallback mode. A saved scan becomes the container for the prospects you add next.", "Esta implementación todavía funciona en modo fallback manual. Un escaneo guardado se convierte en el contenedor de los prospectos que añades después.")}</p></section>
      <section className="panel learning-progress"><div className="panel-title"><h2>{text("Radar state", "Estado del radar")}</h2><span className={`feature-status ${hasLiveProviders ? "feature-status--ready" : "feature-status--partial"}`}>{hasLiveProviders ? text("Live discovery", "Descubrimiento real") : text("Manual workflow", "Flujo manual")}</span></div><div className="learning-stat"><strong>{scans.length}</strong><span>{text("saved scans in this company", "escaneos guardados en esta empresa")}</span></div><div className="learning-stat"><strong>{latestScan?.counts?.unique ?? 0}</strong><span>{text("prospects from the latest scan", "prospectos del último escaneo")}</span></div><div className="learning-stat"><strong>{latestScan ? statusLabel(latestScan.status, text) : "—"}</strong><span>{text("latest scan status", "estado del último escaneo")}</span></div></section>
    </div>
    <div className="radar-layout">
      <section className="panel scan-builder"><div className="panel-title"><h2>{text("New scan", "Nuevo escaneo")}</h2><span className={`feature-status ${hasLiveProviders ? "feature-status--ready" : "feature-status--partial"}`}>{hasLiveProviders ? text("Live discovery", "Descubrimiento real") : text("Manual fallback ready", "Fallback manual listo")}</span></div><form className="settings-fields" onSubmit={startScan}><label>{text("City", "Ciudad")}<input required name="city" placeholder={text("e.g. Quito", "p. ej. Quito")} /></label><label>{text("Country code", "Código de país")}<input required name="country" maxLength={2} placeholder="EC" /></label><label>{text("Radius in km", "Radio en km")}<input required name="radius" type="number" min="1" max="100" defaultValue="15" /></label><label>{text("Business categories", "Categorías de negocio")}<input required name="categories" placeholder={text("hotels, restaurants, agencies", "hoteles, restaurantes, agencias")} /></label><button className="button button-primary" disabled={starting}>{starting ? text("Discovering businesses…", "Descubriendo empresas…") : hasLiveProviders ? text("Run live scan", "Ejecutar escaneo real") : text("Save scan and continue", "Guardar escaneo y continuar")}<span className="button-arrow"/></button></form><div className="scan-helper"><strong>{text("Discovery sources", "Fuentes de descubrimiento")}</strong><p>{hasLiveProviders ? text("This workspace can query live providers right now. If a scan returns zero matches, you can still add prospects manually in the review queue.", "Este espacio ya puede consultar proveedores reales. Si un escaneo devuelve cero coincidencias, todavía puedes añadir prospectos manualmente en la cola de revisión.") : text("No live provider key is active in this deployment yet. Saving a scan will take you straight to manual prospect capture for this company.", "Todavía no hay una clave de proveedor activa en esta implementación. Guardar un escaneo te llevará directamente a la captura manual de prospectos para esta empresa.")}</p></div></section>
      <section className="panel scan-history"><div className="panel-title"><h2>{text("Scan history", "Historial de escaneos")}</h2><span>{scans.length}</span></div>{loading ? <div className="empty-state">{text("Loading scans…", "Cargando escaneos…")}</div> : scans.length ? <>{scans.map((scan) => <div className="scan-row" key={scan.id}><span className={`status-dot status-dot--${scan.status}`}/><div><strong>{scan.city}, {scan.country}</strong><small>{scan.radius_m / 1000} km · {scan.categories.join(", ") || text("No categories", "Sin categorías")} · {new Date(scan.created_at).toLocaleDateString(language === "es" ? "es-EC" : "en-US")}</small></div><span className="feature-status">{statusLabel(scan.status, text)}</span></div>)}<div className="empty-state empty-state--action"><strong>{text("After every scan, the next stop is the review queue.", "Después de cada escaneo, la siguiente parada es la cola de revisión.")}</strong><p>{text("Use the review queue to approve real prospects, create the outreach sequence and then log the result.", "Usa la cola de revisión para aprobar prospectos reales, crear la secuencia de contacto y luego registrar el resultado.")}</p><Link href="/prospectos">{text("Open review queue", "Abrir cola de revisión")} ↗</Link></div></> : <div className="empty-state empty-state--action"><strong>{text("No scans for this company yet.", "Aún no hay escaneos para esta empresa.")}</strong><p>{text("Your Business DNA is ready. Configure the first real market scan on the left.", "Tu ADN del negocio está listo. Configura el primer escaneo real a la izquierda.")}</p><Link href="/perfil">{text("Review Business DNA", "Revisar ADN del negocio")} ↗</Link></div>}</section>
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
