"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SignalMark } from "@/components/AppShell";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        if (data.session) router.push("/onboarding");
        else setMessage("Account created. Confirm your email, then come back and sign in.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.push("/panel");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";
  return <main className="login-page"><section className="login-visual"><div className="brand"><SignalMark/><span>Anima<span style={{color:"var(--champagne)"}}>Radar</span></span></div><div className="login-quote"><h1>See the signal before it becomes obvious.</h1><p>A quieter, sharper way to find the businesses already leaning toward what you sell.</p></div><small style={{color:"#708198",fontSize:10}}>PRIVATE MARKET INTELLIGENCE · 2026</small></section><section className="login-form-side"><div className="login-card"><SignalMark small/><p className="eyebrow" style={{marginTop:22,marginLeft:0}}>{isSignup?"Create account":"Secure workspace access"}</p><h1>{isSignup?"Start your radar.":"Welcome back."}</h1><p>{isSignup?"Create your account with an email address and password.":"Sign in with the password you created for your workspace."}</p>{message&&<div className="notice" aria-live="polite">{message}</div>}<form onSubmit={submit}><label>Email address<input required name="email" autoComplete="email" spellCheck={false} type="email" placeholder="you@company.com" /></label><label>Password<input required name="password" autoComplete={isSignup?"new-password":"current-password"} type="password" minLength={8} placeholder="At least 8 characters…" /></label><button className="button button-primary" disabled={busy}>{busy?(isSignup?"Creating account…":"Signing in…"):(isSignup?"Create account":"Sign in")}<span className="button-arrow" aria-hidden="true" /></button>{error&&<p className="error" aria-live="polite">{error}</p>}</form><button type="button" className="auth-switch" onClick={()=>{setMode(isSignup?"signin":"signup");setError(null);setMessage(null)}}>{isSignup?"Already have an account? Sign in":"Need an account? Create one"}</button><p className="login-fine">Your workspace and data remain isolated to your authenticated account.</p></div></section></main>;
}
