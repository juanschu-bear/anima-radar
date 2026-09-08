"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import AppShell, { SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Scan = { id: string; status: string; city: string; country: string; radius_m: number; categories: string[]; sources: string[]; counts: Record<string, number>; created_at: string };

export default function RadarPage() {
  const { language, text } = useLanguage();
  const [scans, setScans] = useState<Scan[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [setupComplete, setSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const arrivedFromSetup = new URLSearchParams(window.location.search).get("setup")?.startsWith("business-dna") === true;
    Promise.all([fetch("/api/scans", { cache: "no-store" }), fetch("/api/workspace", { cache: "no-store" })])
      .then(async ([scanResponse, workspaceResponse]) => {
        const scanBody = await scanResponse.json();
        const workspaceBody = await workspaceResponse.json();
        if (!scanResponse.ok) throw new Error(scanBody.detail);
        if (!workspaceResponse.ok) throw new Error(workspaceBody.detail);
        if (live) { setScans(scanBody.scans ?? []); setCompanyName(workspaceBody.tenant?.name ?? ""); setSetupComplete(arrivedFromSetup); }
      })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : text("Could not load scans", "No se pudieron cargar los escaneos")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [text]);

  async function startScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStarting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city: form.get("city"), country: form.get("country"), radius_m: Number(form.get("radius")) * 1000, categories: String(form.get("categories") ?? "").split(",").map((item) => item.trim()).filter(Boolean), sources: ["google_places", "exa"] }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      setScans((current) => [body as Scan, ...current]);
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not start scan", "No se pudo iniciar el escaneo"));
    } finally {
      setStarting(false);
    }
  }

  return <AppShell>
    {setupComplete && <section className="notice setup-success" aria-live="polite"><div><strong>{text("Business DNA saved", "ADN del negocio guardado")}{companyName ? ` · ${companyName}` : ""}</strong><span>{text("Next: create the first real market scan. Choose a city, radius and the business categories AnimaRadar should discover.", "Siguiente paso: crea el primer escaneo real. Elige una ciudad, un radio y las categorías que AnimaRadar debe descubrir.")}</span></div><button type="button" onClick={() => setSetupComplete(false)} aria-label={text("Dismiss", "Cerrar")}>×</button></section>}
    <div className="page-toolbar"><SectionHeading eyebrow={text("Radar / scans", "Radar / escaneos")} title={text("Point the lens at your next market.", "Apunta el radar a tu próximo mercado.")} detail={text("Define a real location, radius and categories. The scan is stored only for the active company.", "Define una ubicación, un radio y categorías reales. El escaneo se guarda únicamente para la empresa activa.")} /></div>
    {error && <p className="error" aria-live="polite">{error}</p>}
    <div className="radar-layout">
      <section className="panel scan-builder"><div className="panel-title"><h2>{text("New scan", "Nuevo escaneo")}</h2><span className="feature-status feature-status--ready">Supabase</span></div><form className="settings-fields" onSubmit={startScan}><label>{text("City", "Ciudad")}<input required name="city" placeholder={text("e.g. Quito", "p. ej. Quito")} /></label><label>{text("Country code", "Código de país")}<input required name="country" maxLength={2} placeholder="EC" /></label><label>{text("Radius in km", "Radio en km")}<input required name="radius" type="number" min="1" max="100" defaultValue="15" /></label><label>{text("Business categories", "Categorías de negocio")}<input required name="categories" placeholder={text("hotels, restaurants, agencies", "hoteles, restaurantes, agencias")} /></label><button className="button button-primary" disabled={starting}>{starting ? text("Creating scan…", "Creando escaneo…") : text("Create scan", "Crear escaneo")}<span className="button-arrow"/></button></form></section>
      <section className="panel scan-history"><div className="panel-title"><h2>{text("Scan history", "Historial de escaneos")}</h2><span>{scans.length}</span></div>{loading ? <div className="empty-state">{text("Loading scans…", "Cargando escaneos…")}</div> : scans.length ? scans.map((scan) => <div className="scan-row" key={scan.id}><span className={`status-dot status-dot--${scan.status}`}/><div><strong>{scan.city}, {scan.country}</strong><small>{scan.radius_m / 1000} km · {scan.categories.join(", ") || text("No categories", "Sin categorías")} · {new Date(scan.created_at).toLocaleDateString(language === "es" ? "es-EC" : "en-US")}</small></div><span className="feature-status">{scan.status}</span></div>) : <div className="empty-state empty-state--action"><strong>{text("No scans for this company yet.", "Aún no hay escaneos para esta empresa.")}</strong><p>{text("Your Business DNA is ready. Configure the first real market scan on the left.", "Tu ADN del negocio está listo. Configura el primer escaneo real a la izquierda.")}</p><Link href="/perfil">{text("Review Business DNA", "Revisar ADN del negocio")} ↗</Link></div>}</section>
    </div>
  </AppShell>;
}
