"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/client";
import { SignalMark } from "@/components/AppShell";

export default function LoginPage() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); const form = new FormData(event.currentTarget); try { const supabase = createClient(); const { data, error: authError } = await supabase.auth.signInWithPassword({ email: String(form.get("login") ?? "").trim(), password: String(form.get("password") ?? "") }); if (authError) throw authError; const { data: profile } = data.user ? await supabase.from("users").select("must_change_password").eq("id", data.user.id).maybeSingle() : { data: null }; router.push((profile?.must_change_password ? "/account/password?required=1" : "/panel") as Route); } catch (cause) { setError(cause instanceof Error ? cause.message : "Authentication failed"); } finally { setBusy(false); } }
  return <main className="login-page"><section className="login-visual"><div className="brand"><SignalMark/><span>Anima<span style={{color:"var(--champagne)"}}>Radar</span></span></div><div className="login-quote"><h1>See the signal before it becomes obvious.</h1><p>Private market intelligence for the people your team has invited into the workspace.</p></div><small style={{color:"#708198",fontSize:10}}>PRIVATE WORKSPACE ACCESS · 2026</small></section><section className="login-form-side"><div className="login-card"><SignalMark small/><p className="eyebrow" style={{marginTop:22,marginLeft:0}}>Workspace access</p><h1>Welcome back.</h1><p>Your workspace owner creates your login ID and gives you a temporary password privately.</p><form onSubmit={submit}><label>Login-ID<input required name="login" autoComplete="username" type="text" placeholder="name@animaradar.com" /></label><label>Password<input required name="password" autoComplete="current-password" type="password" placeholder="Your password…" /></label><button className="button button-primary" disabled={busy}>{busy?"Signing in…":"Sign in"}<span className="button-arrow" aria-hidden="true" /></button>{error&&<p className="error" aria-live="polite">{error}</p>}</form><p className="login-fine">No email is collected and no invitation is sent. Ask the workspace owner for your access credentials.</p></div></section></main>;
}
