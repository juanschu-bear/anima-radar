"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell, { SectionHeading } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";

export default function PasswordPage() {
  const router = useRouter();
  const required = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("required") === "1";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password.length < 10) { setError("Use at least 10 characters for your new password."); setBusy(false); return; }
    if (password !== confirmation) { setError("The passwords do not match."); setBusy(false); return; }
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session has expired. Please sign in again.");
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      const { error: profileError } = await supabase.from("users").update({ must_change_password: false }).eq("id", user.id);
      if (profileError) throw profileError;
      setSaved(true); window.setTimeout(() => router.push("/panel"), 700);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update your password"); }
    finally { setBusy(false); }
  }

  return <AppShell><div className="account-page"><SectionHeading eyebrow="Account / security" title={required ? "Make this password yours." : "Update your password."} detail={required ? "Your workspace owner gave you a one-time password. Choose a private password before entering the workspace." : "Keep your AnimaRadar access private and up to date."} /><section className="panel password-card"><div className="password-card-copy"><p className="eyebrow">Private access</p><h2>{required ? "One last step before your radar opens." : "Change your password whenever you need."}</h2><p>{required ? "The temporary password is no longer needed after this change. Your new password is never shown or stored by AnimaRadar in readable form." : "Use a password that is unique to this workspace. The change takes effect immediately."}</p></div><form className="password-form" onSubmit={submit}><label>New password<input required name="password" minLength={10} autoComplete="new-password" type="password" placeholder="At least 10 characters" /></label><label>Confirm new password<input required name="confirmation" minLength={10} autoComplete="new-password" type="password" placeholder="Repeat your new password" /></label><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save password"}<span className="button-arrow" aria-hidden="true" /></button>{saved&&<p className="notice" aria-live="polite">Password saved. Opening your workspace…</p>}{error&&<p className="error" aria-live="polite">{error}</p>}</form></section></div></AppShell>;
}
