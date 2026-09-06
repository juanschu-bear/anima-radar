"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const questions = [
  "¿Qué vende y cómo se entrega?", "¿Quiénes son sus 3 mejores clientes hoy y por qué compran?",
  "¿Qué tipo de empresa nunca sería cliente?", "¿En qué ciudades quiere crecer?",
  "¿Qué lo hace diferente de la competencia, en sus palabras?", "¿Qué prueba tiene de eso?",
  "¿Quién firma los mensajes y en qué idioma?", "¿Qué quiere que pase después del primer mensaje?",
];

export default function ProfilePage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const answers = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`answer-${index + 1}`, String(form.get(`answer-${index + 1}`) ?? "")]));
    try {
      const response = await fetch("/api/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers, market_lang: "en-CA", tenant_tone: "concrete and respectful" }) });
      if (!response.ok) throw new Error("No se pudo guardar el perfil");
      const body = (await response.json()) as { id: string };
      setProfileId(body.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return <main className="paper-grid min-h-screen px-5 py-8 md:px-12 md:py-12"><div className="mx-auto max-w-5xl"><header className="flex items-start justify-between gap-6"><div><p className="text-xs font-bold uppercase tracking-[.3em] text-[var(--accent)]">ANIMARADAR / PERFIL</p><h1 className="mt-4 text-5xl md:text-7xl">Tu negocio, una vez.</h1><p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">Cuéntanos cómo vendes. Radar convertirá tus respuestas en un perfil de cliente ideal y una búsqueda accionable.</p></div><span className="rounded-full border border-black/10 px-3 py-1 text-xs">ES · EN</span></header><form id="profile-form" onSubmit={submit} className="mt-12 grid gap-5 md:grid-cols-2">{questions.map((question, index) => <label key={question} className="rounded-2xl border border-black/10 bg-white/50 p-5 shadow-sm"><span className="text-xs font-bold text-[var(--accent)]">0{index + 1}</span><span className="mt-3 block font-semibold">{question}</span><textarea required name={`answer-${index + 1}`} rows={3} className="mt-4 w-full resize-none rounded-xl border border-black/10 bg-transparent p-3 outline-none focus:border-[var(--accent)]" placeholder="Escribe como se lo contarías a una persona…" /></label>)}</form><div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-black/10 pt-6 sm:flex-row sm:items-center"><p className="text-sm text-[var(--muted)]">Puedes editar tu perfil y las señales después.</p><button type="submit" form="profile-form" disabled={saving} className="rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-bold text-[var(--paper)] disabled:opacity-50">{saving ? "Guardando…" : "Derivar perfil →"}</button></div>{error && <p className="mt-4 text-sm text-red-700">{error}</p>}{profileId && <p className="mt-4 text-sm text-green-800">Perfil creado. <Link href="/radar" className="font-bold underline">Continuar al Radar →</Link></p>}</div></main>;
}
