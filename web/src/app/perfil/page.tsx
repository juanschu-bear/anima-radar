"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import AppShell, { ButtonArrow, SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";
import { createClient } from "@/lib/supabase/client";

const questions = [
  ["What do you sell, and how is it delivered?", "¿Qué vendes y cómo lo entregas?"],
  ["Who are your three best customers today — and why do they buy?", "¿Quiénes son hoy tus tres mejores clientes y por qué compran?"],
  ["What kind of company would never be a fit?", "¿Qué tipo de empresa nunca encajaría?"],
  ["Where do you want to grow next?", "¿Dónde quieres crecer a continuación?"],
  ["What makes you different, in your own words?", "¿Qué te hace diferente, en tus propias palabras?"],
  ["What proof do you have of that difference?", "¿Qué pruebas tienes de esa diferencia?"],
  ["Who signs your messages, and in which language?", "¿Quién firma tus mensajes y en qué idioma?"],
  ["What should happen after the first message?", "¿Qué debería ocurrir después del primer mensaje?"],
] as const;

export default function ProfilePage() {
  const router = useRouter();
  const { language, text } = useLanguage();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/profiles", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.detail);
        if (!active) return;
        const currentTenantId = typeof body.tenant_id === "string" ? body.tenant_id : null;
        const serverAnswers = isAnswerRecord(body.profile?.raw_answers) ? body.profile.raw_answers : {};
        let draftAnswers: Record<string, string> = {};
        if (currentTenantId) {
          const storedDraft = window.localStorage.getItem(draftKey(currentTenantId));
          if (storedDraft) {
            try {
              const parsedDraft: unknown = JSON.parse(storedDraft);
              if (isAnswerRecord(parsedDraft)) draftAnswers = parsedDraft;
            } catch {
              window.localStorage.removeItem(draftKey(currentTenantId));
            }
          }
        }
        setTenantId(currentTenantId);
        setAnswers({ ...serverAnswers, ...draftAnswers });
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : text("Could not load Business DNA", "No se pudo cargar el ADN del negocio"));
      });
    return () => { active = false; };
  }, [text]);

  useEffect(() => {
    if (!tenantId || Object.keys(answers).length === 0) return;
    window.localStorage.setItem(draftKey(tenantId), JSON.stringify(answers));
  }, [answers, tenantId]);

  async function saveProfile() {
    return fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers, market_lang: language, tenant_tone: "concrete and respectful" }),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setSessionExpired(false);
    setError(null);
    try {
      let response = await saveProfile();
      if (response.status === 401) {
        const { error: refreshError } = await createClient().auth.refreshSession();
        if (!refreshError) response = await saveProfile();
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) setSessionExpired(true);
        throw new Error(typeof body.detail === "string" ? body.detail : text("Could not save Business DNA", "No se pudo guardar el ADN del negocio"));
      }
      if (tenantId) window.localStorage.removeItem(draftKey(tenantId));
      setSaved(true);
      router.replace("/radar?setup=business-dna-complete");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not save Business DNA", "No se pudo guardar el ADN del negocio"));
    } finally {
      setSaving(false);
    }
  }
  return <AppShell><div className="page-toolbar"><SectionHeading eyebrow={text("Business DNA / profile", "ADN del negocio / perfil")} title={text("Tell us what makes you a fit.", "Cuéntanos qué te hace encajar.")} detail={text("Your answers become the real lens AnimaRadar uses for this company. They can be edited at any time.", "Tus respuestas se convierten en el criterio real que AnimaRadar usa para esta empresa. Puedes editarlas en cualquier momento.")} /><ButtonArrow href="/radar">{text("Continue to radar", "Continuar al radar")}</ButtonArrow></div><form id="profile-form" onSubmit={submit} className="form-grid">{questions.map((question, index) => { const key = `answer-${index + 1}`; return <div className="question" key={key}><label><span>{text("Signal", "Señal")} 0{index + 1}</span>{question[language === "es" ? 1 : 0]}</label><textarea required name={key} rows={3} value={answers[key] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))} placeholder={text("Write it as you would explain it to a sharp colleague…", "Escríbelo como se lo explicarías a un colega perspicaz…")} /></div>; })}</form><div className="form-footer"><span>{text("8 signals · saved as a browser draft until submitted", "8 señales · guardadas como borrador en el navegador hasta enviarlas")}</span><button type="submit" form="profile-form" className="button button-primary" disabled={saving}>{saving ? text("Saving…", "Guardando…") : text("Save Business DNA", "Guardar ADN del negocio")}<span className="button-arrow">↗</span></button></div>{error && <p className="error" aria-live="polite">{error} {sessionExpired && <Link href="/login">{text("Sign in again — your draft is safe", "Vuelve a iniciar sesión — tu borrador está seguro")} ↗</Link>}</p>}{saved && <p className="notice" aria-live="polite">{text("Business DNA saved.", "ADN del negocio guardado.")} <Link href="/radar">{text("Create a scan", "Crear un escaneo")} ↗</Link></p>}</AppShell>;
}

function draftKey(tenantId: string) {
  return `animaradar:business-dna-draft:${tenantId}`;
}

function isAnswerRecord(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}
