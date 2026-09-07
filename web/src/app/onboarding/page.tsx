"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SignalMark } from "@/components/AppShell";

export default function OnboardingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("workspace") ?? "").trim();
    const marketLang = String(form.get("market-language") ?? "en-CA");

    try {
      const supabase = createClient();
      const { error: bootstrapError } = await supabase.rpc("bootstrap_tenant", {
        p_name: name,
        p_default_market_lang: marketLang,
      });
      if (bootstrapError) throw bootstrapError;
      router.replace("/perfil");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't create your workspace");
    } finally {
      setSaving(false);
    }
  }

  return <main className="login-page"><section className="login-visual"><div className="brand"><SignalMark/><span>Anima<span style={{color:"var(--champagne)"}}>Radar</span></span></div><div className="login-quote"><h1>Give the radar a point of view.</h1><p>Your workspace keeps your offer, market and evidence separate from every other company.</p></div><small style={{color:"#708198",fontSize:10}}>FIRST-RUN WORKSPACE SETUP</small></section><section className="login-form-side"><div className="login-card"><SignalMark small/><p className="eyebrow" style={{marginTop:22,marginLeft:0}}>Create your workspace</p><h1>Start with your company.</h1><p>This creates your private tenant. You can edit the details later in Settings.</p><form onSubmit={submit}><label>Workspace name<input required name="workspace" autoComplete="organization" placeholder="e.g. Andes Bloom…" /></label><label>Market language<select name="market-language" defaultValue="en-CA"><option value="en-CA">English · Canada</option><option value="de-DE">Deutsch · Germany</option><option value="ru-RU">Русский</option></select></label><button className="button button-primary" disabled={saving}>{saving?"Creating workspace…":"Create workspace"}<span className="button-arrow" aria-hidden="true" /></button>{error&&<p className="error" aria-live="polite">{error}</p>}</form><p className="login-fine">Your account is identified by the email address used for the magic link.</p></div></section></main>;
}
