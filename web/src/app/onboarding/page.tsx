"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SignalMark } from "@/components/AppShell";
import { LanguageToggle, useLanguage } from "@/components/LanguageProvider";

export default function OnboardingPage() {
  const router = useRouter(); const { language, text } = useLanguage(); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [fullName, setFullName] = useState("");
  useEffect(() => { createClient().auth.getUser().then(({ data }) => { const name = data.user?.user_metadata?.full_name; if (typeof name === "string") setFullName(name); }); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(null); const form = new FormData(event.currentTarget); try { const { error: bootstrapError } = await createClient().rpc("bootstrap_tenant", { p_name: String(form.get("workspace") ?? "").trim(), p_default_market_lang: language, p_full_name: fullName.trim() }); if (bootstrapError) throw bootstrapError; router.replace("/perfil"); } catch (cause) { setError(cause instanceof Error ? cause.message : text("Could not create workspace", "No se pudo crear el espacio")); } finally { setSaving(false); } }
  return <main className="login-page"><section className="login-visual"><div className="brand"><SignalMark/><span>Anima<span style={{ color: "var(--champagne)" }}>Radar</span></span></div><div className="login-quote"><h1>{text("Give the radar a point of view.", "Dale un punto de vista al radar.")}</h1><p>{text("Your company keeps its data separate from every other workspace.", "Tu empresa mantiene sus datos separados de todos los demás espacios.")}</p></div></section><section className="login-form-side"><div className="login-card"><LanguageToggle/><SignalMark small/><p className="eyebrow">{text("Create workspace", "Crear espacio")}</p><h1>{text("Start with your company.", "Empieza con tu empresa.")}</h1><form onSubmit={submit}><label>{text("Full name", "Nombre completo")}<input required name="full_name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label>{text("Company name", "Nombre de la empresa")}<input required name="workspace" autoComplete="organization" placeholder="Preserva" /></label><button className="button button-primary" disabled={saving}>{saving ? text("Creating…", "Creando…") : text("Create workspace", "Crear espacio")}</button>{error && <p className="error" aria-live="polite">{error}</p>}</form></div></section></main>;
}
