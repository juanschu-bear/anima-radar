"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/client";
import { SignalMark } from "@/components/AppShell";
import { LanguageToggle, useLanguage } from "@/components/LanguageProvider";

type Mode = "member" | "admin";

function PasswordField({ name, placeholder, autoComplete }: { name: string; placeholder: string; autoComplete: string }) {
  const { text } = useLanguage(); const [visible, setVisible] = useState(false);
  return <div className="password-field"><input required name={name} autoComplete={autoComplete} type={visible ? "text" : "password"} placeholder={placeholder} /><button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? text("Hide password", "Ocultar contraseña") : text("Show password", "Mostrar contraseña")} aria-pressed={visible}>{visible ? <EyeOpenIcon/> : <EyeClosedIcon/>}</button></div>;
}

export default function LoginPage() {
  const router = useRouter(); const { text } = useLanguage(); const [mode, setMode] = useState<Mode>("member"); const [ownerSetupOpen, setOwnerSetupOpen] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/setup/owner", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail);
        if (!live) return;
        setOwnerSetupOpen(body.can_setup === true);
        if (body.can_setup !== true) setMode("member");
      })
      .catch(() => {
        if (live) setOwnerSetupOpen(false);
      });
    return () => { live = false; };
  }, []);
  async function submitMember(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); const form = new FormData(event.currentTarget); try { const supabase = createClient(); const { data, error: authError } = await supabase.auth.signInWithPassword({ email: String(form.get("login") ?? "").trim(), password: String(form.get("password") ?? "") }); if (authError) throw authError; const { data: profile } = data.user ? await supabase.from("users").select("must_change_password").eq("id", data.user.id).maybeSingle() : { data: null }; router.push((profile?.must_change_password ? "/account/password?required=1" : "/panel") as Route); } catch { setError(text("Invalid login ID or password.", "ID de acceso o contraseña incorrectos.")); } finally { setBusy(false); } }
  async function submitAdmin(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? ""); try { const response = await fetch("/api/setup/owner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ full_name: form.get("full_name"), workspace_name: form.get("workspace_name"), password }) }); const body = await response.json(); if (!response.ok) throw new Error(body.detail); const supabase = createClient(); const { error: authError } = await supabase.auth.signInWithPassword({ email: body.login, password }); if (authError) throw authError; router.push("/panel"); } catch (cause) { setError(cause instanceof Error ? cause.message : text("Admin setup failed", "Falló la configuración de administrador")); } finally { setBusy(false); } }
  const admin = mode === "admin";
  return <main className="login-page"><section className="login-visual"><div className="brand"><SignalMark/><span>Anima<span style={{ color: "var(--champagne)" }}>Radar</span></span></div><div className="login-quote"><h1>{admin ? text("Build the first private workspace.", "Crea el primer espacio privado.") : text("See the signal before it becomes obvious.", "Detecta la señal antes de que sea evidente.")}</h1><p>{admin ? text("Initial setup is available only before the first platform administrator exists.", "La configuración inicial solo está disponible solo antes de que exista el primer administrador de la plataforma.") : text("Use the login ID and password created for you inside AnimaRadar.", "Usa el ID de acceso y la contraseña creados para ti dentro de AnimaRadar.")}</p></div><small>{text("PRIVATE PLATFORM ACCESS", "ACCESO PRIVADO A LA PLATAFORMA")}</small></section><section className="login-form-side"><div className="login-card"><LanguageToggle/><SignalMark small/><p className="eyebrow">{admin ? text("First-run setup", "Configuración inicial") : text("Workspace access", "Acceso al espacio")}</p><div className="auth-tabs" role="tablist"><button type="button" className={mode === "member" ? "active" : ""} onClick={() => { setMode("member"); setError(null); }}>{text("Sign in", "Iniciar sesión")}</button><button type="button" className={mode === "admin" ? "active" : ""} onClick={() => { if (ownerSetupOpen !== false) { setMode("admin"); setError(null); } }} disabled={ownerSetupOpen === false}>{text("Initial admin", "Admin inicial")}</button></div><h1>{admin ? text("Create the owner.", "Crea al propietario.") : text("Welcome back.", "Bienvenido de nuevo.")}</h1>{admin ? <form onSubmit={submitAdmin}><label>{text("Full name", "Nombre completo")}<input required name="full_name" autoComplete="name" placeholder="Juan Schubert" /></label><label>{text("Company name", "Nombre de la empresa")}<input required name="workspace_name" autoComplete="organization" placeholder="Preserva" /></label><label>{text("Admin password", "Contraseña de administrador")}<PasswordField name="password" autoComplete="new-password" placeholder={text("At least 10 characters", "Al menos 10 caracteres")} /></label><button className="button button-primary" disabled={busy || ownerSetupOpen === false}>{busy ? text("Creating…", "Creando…") : text("Create administrator", "Crear administrador")}</button></form> : <form onSubmit={submitMember}><label>Login ID<input required name="login" autoComplete="username" type="text" placeholder="name@animaradar.com" /></label><label>{text("Password", "Contraseña")}<PasswordField name="password" autoComplete="current-password" placeholder={text("Your password…", "Tu contraseña…")} /></label><button className="button button-primary" disabled={busy}>{busy ? text("Signing in…", "Entrando…") : text("Sign in", "Iniciar sesión")}<span className="button-arrow"/></button></form>}{error && <p className="error" aria-live="polite">{error}</p>}<p className="login-fine">{ownerSetupOpen === false ? text("The first owner already exists. Sign in with an existing login ID below.", "El primer propietario ya existe. Inicia sesión con un ID de acceso existente.") : text("No mailbox is required. Access is managed by the platform administrator.", "No se necesita buzón de correo. El acceso lo gestiona el administrador de la plataforma.")}</p></div></section></main>;
}

function PasswordToggleIcon({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function EyeOpenIcon() {
  return <PasswordToggleIcon><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3.2"/></PasswordToggleIcon>;
}

function EyeClosedIcon() {
  return <PasswordToggleIcon><path d="M3 3l18 18"/><path d="M10.6 6.3A11.3 11.3 0 0 1 12 6c6.4 0 10 6 10 6a17.6 17.6 0 0 1-3.2 3.8"/><path d="M6.7 6.8C4 8.6 2 12 2 12a17.6 17.6 0 0 0 10 6c1.7 0 3.3-.4 4.7-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></PasswordToggleIcon>;
}
