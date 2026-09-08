"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import AppShell, { SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Tenant = { id: string; name: string; default_market_lang: string; created_at: string };
type SystemStatus = {
  actor: { role: string; platform_admin: boolean; full_name: string | null };
  providers: {
    supabase_browser: boolean;
    supabase_server: boolean;
    google_places: boolean;
    exa: boolean;
    radar_api_url: string | null;
    manual_prospect_fallback: boolean;
  };
  workflow: {
    has_business_dna: boolean;
    scans: number;
    prospects: number;
    messages: number;
    outcomes: number;
  };
};

export default function SettingsPage() {
  const { text } = useLanguage();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [name, setName] = useState("");
  const [marketLanguage, setMarketLanguage] = useState("en");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/workspace", { cache: "no-store" }),
      fetch("/api/system/status", { cache: "no-store" }),
    ])
      .then(async ([workspaceResponse, systemResponse]) => {
        const workspaceBody = await workspaceResponse.json();
        const systemBody = await systemResponse.json();
        if (!workspaceResponse.ok) throw new Error(workspaceBody.detail);
        if (!systemResponse.ok) throw new Error(systemBody.detail);
        setTenant(workspaceBody.tenant);
        setSystem(systemBody);
        setName(workspaceBody.tenant.name);
        setMarketLanguage(workspaceBody.tenant.default_market_lang?.startsWith("es") ? "es" : "en");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : text("Could not load settings", "No se pudo cargar la configuración")));
  }, [text]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, default_market_lang: marketLanguage }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      setTenant(body.tenant);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not save settings", "No se pudo guardar la configuración"));
    } finally {
      setSaving(false);
    }
  }

  const systemRows = [
    [text("Browser auth", "Auth del navegador"), system?.providers.supabase_browser ? text("Connected", "Conectado") : text("Missing", "Falta")],
    [text("Server admin access", "Acceso admin del servidor"), system?.providers.supabase_server ? text("Connected", "Conectado") : text("Missing", "Falta")],
    [text("Google Places", "Google Places"), system?.providers.google_places ? text("Live discovery enabled", "Descubrimiento activo") : text("Not configured", "No configurado")],
    [text("Exa search", "Búsqueda Exa"), system?.providers.exa ? text("Live discovery enabled", "Descubrimiento activo") : text("Not configured", "No configurado")],
    [text("Manual prospect fallback", "Fallback manual de prospectos"), system?.providers.manual_prospect_fallback ? text("Always available", "Siempre disponible") : text("Off", "Apagado")],
    [text("Current actor", "Actor actual"), system?.actor.platform_admin ? text("Platform admin", "Admin de plataforma") : text("Company user", "Usuario de empresa")],
  ];

  const workflowRows = [
    [text("Scans", "Escaneos"), String(system?.workflow.scans ?? 0)],
    [text("Prospects", "Prospectos"), String(system?.workflow.prospects ?? 0)],
    [text("Messages", "Mensajes"), String(system?.workflow.messages ?? 0)],
    [text("Outcomes", "Resultados"), String(system?.workflow.outcomes ?? 0)],
  ];

  return (
    <AppShell>
      <div className="page-toolbar">
        <SectionHeading
          eyebrow={text("Settings / company", "Configuración / empresa")}
          title={text("Configure the active company.", "Configura la empresa activa.")}
          detail={text(
            "These settings are stored in Supabase and apply only to the company selected in the sidebar.",
            "Esta configuración se guarda en Supabase y se aplica solo a la empresa seleccionada en la barra lateral.",
          )}
        />
      </div>

      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="panel-title">
            <h2>{text("Company identity", "Identidad de la empresa")}</h2>
            <span className="feature-status feature-status--ready">{text("Live", "Real")}</span>
          </div>

          <form className="settings-fields" onSubmit={save}>
            <label>
              {text("Company name", "Nombre de la empresa")}
              <input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} />
            </label>

            <label>
              {text("Default workspace language", "Idioma predeterminado del espacio")}
              <select value={marketLanguage} onChange={(event) => setMarketLanguage(event.target.value)}>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </label>

            <button className="button button-primary" disabled={saving || !tenant}>
              {saving ? text("Saving…", "Guardando…") : text("Save company", "Guardar empresa")}
              <span className="button-arrow" />
            </button>

            {saved && <p className="notice" aria-live="polite">{text("Company settings saved.", "Configuración de la empresa guardada.")}</p>}
            {error && <p className="error" aria-live="polite">{error}</p>}
          </form>
        </section>

        <section className="panel settings-card">
          <div className="panel-title">
            <h2>{text("Workspace readiness", "Preparación del espacio")}</h2>
            <span className="feature-status feature-status--ready">RLS</span>
          </div>

          <div className="connection-list">
            <div>
              <span className="connection-dot connection-dot--ready" />
              <div>
                <strong>Supabase</strong>
                <small>{text("Company records are stored under one tenant ID.", "Los registros de empresa se guardan bajo un único ID de tenant.")}</small>
              </div>
              <b>{text("Connected", "Conectado")}</b>
            </div>

            <div>
              <span className="connection-dot connection-dot--ready" />
              <div>
                <strong>{text("Active company", "Empresa activa")}</strong>
                <small>{tenant?.name ?? text("Loading…", "Cargando…")}</small>
              </div>
              <b>{text("Isolated", "Aislada")}</b>
            </div>

            <div>
              <span className={`connection-dot ${system?.workflow.has_business_dna ? "connection-dot--ready" : ""}`} />
              <div>
                <strong>{text("Business DNA", "ADN del negocio")}</strong>
                <small>{text("The active company needs its profile before live review can start.", "La empresa activa necesita su perfil antes de que pueda empezar la revisión real.")}</small>
              </div>
              <b>{system?.workflow.has_business_dna ? text("Ready", "Listo") : text("Missing", "Falta")}</b>
            </div>

            <div>
              <span className="connection-dot connection-dot--ready" />
              <div>
                <strong>{text("Prospect workflow", "Flujo de prospectos")}</strong>
                <small>{text("Scans, manual prospects, approvals, outreach and outcomes all stay inside the selected company.", "Escaneos, prospectos manuales, aprobaciones, contacto y resultados permanecen dentro de la empresa seleccionada.")}</small>
              </div>
              <b>{text("Ready", "Listo")}</b>
            </div>
          </div>
        </section>
      </div>

      <section className="feature-strip">
        <div>
          <p className="eyebrow">{text("System status", "Estado del sistema")}</p>
          <h2>{text("What is live right now.", "Qué está activo ahora mismo.")}</h2>
        </div>

        <div className="feature-list">
          {systemRows.map(([label, value]) => (
            <div className="feature-row" key={label}>
              <div><strong>{label}</strong></div>
              <small>{value}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="feature-strip">
        <div>
          <p className="eyebrow">{text("Workflow counts", "Conteos del flujo")}</p>
          <h2>{text("What this company already has.", "Lo que esta empresa ya tiene.")}</h2>
        </div>

        <div className="feature-list">
          {workflowRows.map(([label, value]) => (
            <div className="feature-row" key={label}>
              <div><strong>{label}</strong></div>
              <small>{value}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="readiness-note">
        <div>
          <p className="eyebrow">{text("Administration", "Administración")}</p>
          <h2>{text("Companies and users are managed separately.", "Las empresas y los usuarios se gestionan por separado.")}</h2>
        </div>

        <p>
          {text(
            "Platform administrators can switch companies in the sidebar, create companies and assign users without mixing tenant data.",
            "Los administradores de plataforma pueden cambiar de empresa en la barra lateral, crear empresas y asignar usuarios sin mezclar datos entre tenants.",
          )}{" "}
          <Link href="/admin/companies">{text("Open companies", "Abrir empresas")} ↗</Link>
        </p>
      </section>
    </AppShell>
  );
}
