"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SignalMark } from "@/components/AppShell";

export default function OnboardingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const metadataName = data.user?.user_metadata?.full_name;
      if (typeof metadataName === "string") setFullName(metadataName);
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("workspace") ?? "").trim();
    const marketLang = String(form.get("market-language") ?? "en-CA");
    const submittedFullName = String(form.get("full_name") ?? "").trim();

    try {
      const supabase = createClient();
      const { error: bootstrapError } = await supabase.rpc("bootstrap_tenant", {
        p_name: name,
        p_default_market_lang: marketLang,
        p_full_name: submittedFullName,
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

  return <main className="login-page"><section className="login-visual"><div className="brand"><SignalMark/><span>Anima<span style={{color:"var(--champagne)"}}>Radar</span></span></div><div className="login-quote"><h1>Give the radar a point of view.</h1><p>Your workspace keeps your offer, market and evidence separate from every other company.</p></div><small style={{color:"#708198",fontSize:10}}>FIRST-RUN WORKSPACE SETUP</small></section><section className="login-form-side"><div className="login-card"><SignalMark small/><p className="eyebrow" style={{marginTop:22,marginLeft:0}}>Create your workspace</p><h1>Start with your company.</h1><p>This creates your private tenant. You can edit the details later in Settings.</p><form onSubmit={submit}><label>Full name<input required name="full_name" autoComplete="name" value={fullName} onChange={(event)=>setFullName(event.target.value)} placeholder="e.g. Juan Schu…" /></label><label>Workspace name<input required name="workspace" autoComplete="organization" placeholder="e.g. Andes Bloom…" /></label><label>Market language<select name="market-language" defaultValue="en-CA"><option value="en-CA">English · Canada</option><option value="de-DE">Deutsch · Germany</option><option value="ru-RU">Русский</option></select></label><button className="button button-primary" disabled={saving}>{saving?"Creating workspace…":"Create workspace"}<span className="button-arrow" aria-hidden="true" /></button>{error&&<p className="error" aria-live="polite">{error}</p>}</form><p className="login-fine">Your full name is used to personalize the workspace and remains protected by tenant isolation.</p></div></section></main>;
}
