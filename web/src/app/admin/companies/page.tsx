"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell, { SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type ReadyState = "needs_profile" | "ready_to_scan" | "needs_prospects" | "review_ready" | "outreach_ready" | "awaiting_outcomes" | "learning_live";
type Company = {
  id: string;
  name: string;
  default_market_lang: string;
  created_at: string;
  has_profile: boolean;
  metrics?: { profiles: number; scans: number; prospects: number; approved: number; sent: number; outcomes: number; positive_replies: number };
  workspace_readiness?: { state: ReadyState; complete: boolean; next_route: string };
};

export default function CompaniesPage() {
  const router = useRouter();
  const { text } = useLanguage();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState("");
  const [name, setName] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/tenants", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail);
        if (live) {
          setCompanies(body.tenants ?? []);
          setActiveId(body.active_tenant_id ?? "");
        }
      })
      .catch((cause) => {
        if (live) setError(cause instanceof Error ? cause.message : text("Could not load companies", "No se pudieron cargar las empresas"));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [text]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/tenants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, default_market_lang: defaultLanguage }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      setCompanies((current) => [...current, body.tenant]);
      setActiveId(body.tenant.id);
      setName("");
      const nextRoute = typeof body.tenant?.workspace_readiness?.next_route === "string"
        ? body.tenant.workspace_readiness.next_route
        : "/perfil";
      router.push(`${nextRoute}?setup=new-company` as Route);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Could not create company", "No se pudo crear la empresa"));
    } finally {
      setSaving(false);
    }
  }

  async function openCompany(id: string, copyCurrentProfile = false) {
    setSwitching(id);
    setError(null);
    const response = await fetch("/api/admin/active-tenant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant_id: id, copy_profile_from: copyCurrentProfile ? activeId : undefined }) });
    const body = await response.json();
    if (!response.ok) {
      setError(body.detail);
      setSwitching("");
      return;
    }
    const targetCompany = body.tenant ?? companies.find((company) => company.id === id);
    const destination = copyCurrentProfile
      ? "/radar?setup=business-dna-copied"
      : targetCompany?.workspace_readiness?.next_route
        ? `${targetCompany.workspace_readiness.next_route}?tenant=${id}`
        : targetCompany?.has_profile
          ? `/panel?tenant=${id}`
          : `/perfil?tenant=${id}&setup=new-company`;
    router.push(destination as Route);
    router.refresh();
  }

  const activeCompany = companies.find((company) => company.id === activeId);

  return (
    <AppShell>
      <div className="admin-page">
        <div className="page-toolbar">
          <SectionHeading title={text("Companies", "Empresas")} detail={text("Create and open real, isolated company workspaces. The active company is always visible in the sidebar.", "Crea y abre espacios reales y aislados para cada empresa. La empresa activa siempre se ve en la barra lateral.")} />
          <Link href={"/admin/users" as Route} className="button button-ghost">{text("Manage users", "Gestionar usuarios")}<span className="button-arrow" /></Link>
        </div>

        <div className="admin-layout">
          <section className="panel admin-create">
            <h2>{text("Add a company", "Añadir una empresa")}</h2>
            <p className="admin-card-intro">{text("The new company becomes active immediately and opens its Business DNA next.", "La nueva empresa se activa inmediatamente y después abre su ADN del negocio.")}</p>
            <form onSubmit={submit}>
              <label>{text("Company name", "Nombre de la empresa")}<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder={text("e.g. Preserva", "p. ej. Preserva")} /></label>
              <label>{text("Default language", "Idioma predeterminado")}<select value={defaultLanguage} onChange={(event) => setDefaultLanguage(event.target.value)}><option value="en">English</option><option value="es">Español</option></select></label>
              <button className="button button-primary" disabled={saving}>{saving ? text("Creating and opening…", "Creando y abriendo…") : text("Create company and continue", "Crear empresa y continuar")}<span className="button-arrow" /></button>
              {error && <p className="error" aria-live="polite">{error}</p>}
            </form>
          </section>

          <section className="panel company-list">
            <div className="panel-title">
              <h2>{text("All companies", "Todas las empresas")}</h2>
              <span>{companies.length} {text("total", "en total")}</span>
            </div>
            {loading ? <div className="empty-state">{text("Loading companies…", "Cargando empresas…")}</div> : companies.map((company) => (
              <div className={`company-row ${company.id === activeId ? "is-active" : ""}`} key={company.id}>
                <span className="company-mark">{company.name.charAt(0).toUpperCase()}</span>
                <div>
                  <strong>{company.name}</strong>
                  <small>{company.default_market_lang?.startsWith("es") ? "Español" : "English"} · {readinessLabel(company.workspace_readiness?.state, text)}</small>
                  <small>{text("Prospects", "Prospectos")}: {company.metrics?.prospects ?? 0} · {text("Contacted", "Contactados")}: {company.metrics?.sent ?? 0} · {text("Outcomes", "Resultados")}: {company.metrics?.outcomes ?? 0}</small>
                </div>
                <div className="company-actions">
                  {company.id === activeId ? (
                    <span className="feature-status feature-status--ready">{text("Active", "Activa")}</span>
                  ) : (
                    <>
                      <button onClick={() => openCompany(company.id)} disabled={switching === company.id}>{switching === company.id ? text("Opening…", "Abriendo…") : actionLabel(company.workspace_readiness?.state, text)}</button>
                      {!company.has_profile && activeCompany?.has_profile && <button className="copy-profile-action" onClick={() => openCompany(company.id, true)} disabled={switching === company.id}>{text("Copy current DNA & open", "Copiar ADN actual y abrir")}</button>}
                    </>
                  )}
                  <Link href={`/admin/users?tenant=${company.id}` as Route}>{text("Add user", "Añadir usuario")} ↗</Link>
                </div>
              </div>
            ))}
            {!loading && !companies.length && <div className="empty-state">{text("No companies yet.", "Aún no hay empresas.")}</div>}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function readinessLabel(state: ReadyState | undefined, text: (english: string, spanish: string) => string) {
  switch (state) {
    case "needs_profile": return text("Needs Business DNA", "Falta ADN del negocio");
    case "ready_to_scan": return text("Ready for first scan", "Lista para primer escaneo");
    case "needs_prospects": return text("Needs prospects", "Faltan prospectos");
    case "review_ready": return text("Review queue ready", "Cola de revisión lista");
    case "outreach_ready": return text("Outreach ready", "Contacto listo");
    case "awaiting_outcomes": return text("Waiting for outcomes", "Esperando resultados");
    case "learning_live": return text("Learning from live results", "Aprendiendo de resultados reales");
    default: return text("Setup in progress", "Configuración en curso");
  }
}

function actionLabel(state: ReadyState | undefined, text: (english: string, spanish: string) => string) {
  switch (state) {
    case "needs_profile": return text("Continue setup", "Continuar configuración");
    case "ready_to_scan": return text("Open radar", "Abrir radar");
    case "needs_prospects":
    case "review_ready": return text("Open review queue", "Abrir revisión");
    case "outreach_ready":
    case "awaiting_outcomes": return text("Open outreach", "Abrir contacto");
    case "learning_live": return text("Open workspace", "Abrir espacio");
    default: return text("Open workspace", "Abrir espacio");
  }
}
