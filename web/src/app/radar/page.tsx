"use client";

import Link from "next/link";
import { useState } from "react";

type ScanResponse = { id: string; status: string; city: string; counts: Record<string, number> };

export default function RadarPage() {
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startScan() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city: "Vancouver", country: "CA", radius_m: 15000, categories: ["florist", "flower shop"], sources: ["google_places", "exa"] }) });
      if (!response.ok) throw new Error("No se pudo iniciar el scan");
      setScan((await response.json()) as ScanResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error desconocido");
    } finally {
      setStarting(false);
    }
  }

  return <main className="min-h-screen px-5 py-8 md:px-12 md:py-12"><div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase tracking-[.3em] text-[var(--accent)]">RADAR / ESCANEAR</p><div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><h1 className="text-6xl">Encuentra tu próximo sí.</h1><p className="mt-3 max-w-xl text-[var(--muted)]">Configura una ciudad, elige señales y deja que Radar lea el mercado.</p></div><button onClick={startScan} disabled={starting} className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{starting ? "Iniciando…" : "Escanear Vancouver"}</button></div>{error && <p className="mt-4 text-sm text-red-700">{error}</p>}{scan && <div className="mt-6 rounded-2xl border border-black/10 bg-white/50 p-4 text-sm">Scan {scan.id.slice(0, 8)} · estado: <strong>{scan.status}</strong> · encontrados: {scan.counts.found}</div>}<section className="mt-12 grid gap-6 lg:grid-cols-[1.5fr_1fr]"><div className="paper-grid flex min-h-[420px] items-center justify-center rounded-3xl border border-black/10 bg-[#e5ded0] p-8"><div className="text-center"><div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-2 border-[var(--accent)] text-2xl">⌖</div><p className="mt-5 font-semibold">Vancouver · radio 15 km</p><p className="mt-2 text-sm text-[var(--muted)]">MapLibre se conectará aquí para el centro y radio.</p></div></div><aside className="rounded-3xl border border-black/10 bg-white/45 p-6"><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--muted)]">Plan de búsqueda</p><h2 className="mt-3 text-3xl">Andes Bloom</h2><div className="mt-6 flex flex-wrap gap-2">{["florist", "flower shop", "wedding florist"].map((x) => <span key={x} className="rounded-full border border-black/15 px-3 py-2 text-sm">{x} ×</span>)}</div><div className="mt-8 space-y-4 border-t border-black/10 pt-6 text-sm"><div className="flex justify-between"><span>Google Places</span><span>activo</span></div><div className="flex justify-between"><span>Exa</span><span>activo</span></div><div className="flex justify-between"><span>2GIS</span><span>inactivo</span></div><Link href="/prospectos" className="mt-6 inline-block font-bold underline">Ver prospectos demo →</Link></div></aside></section></div></main>;
}
