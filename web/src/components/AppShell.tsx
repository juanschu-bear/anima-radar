"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Route } from "next";
import { isPlatformAdmin } from "@/lib/access";
import { createClient } from "@/lib/supabase/client";
import { LanguageToggle, useLanguage } from "@/components/LanguageProvider";

type IconName = "overview" | "profile" | "radar" | "prospects" | "send" | "learn" | "settings";
const companyNav = [["overview", "/panel", "overview"], ["profile", "/perfil", "profile"], ["radar", "/radar", "radar"], ["prospects", "/prospectos", "prospects"], ["send", "/enviar", "send"]] as const;

function Icon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    profile: <><circle cx="12" cy="8" r="3"/><path d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5"/></>,
    radar: <><circle cx="12" cy="12" r="8"/><path d="M12 12l5-5M12 4v2M4 12h2M12 18v2M18 12h2"/><circle cx="12" cy="12" r="1.5"/></>,
    prospects: <><path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-7"/><circle cx="18" cy="6" r="1.5"/></>,
    send: <><path d="m21 3-7.5 18-3.3-7.2L3 10.5 21 3Z"/><path d="M10.2 13.8 21 3"/></>,
    learn: <><path d="M4 19.5V5.8a1 1 0 0 1 1-1h14v15H5a1 1 0 0 1-1 1Zm0 0a1 1 0 0 0 1 1h14"/><path d="M8 8h7M8 11h7M8 14h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6v-2.6h.5A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>
  };
  return <svg aria-hidden="true" {...common}>{paths[name]}</svg>;
}

export function SignalMark({ small = false }: { small?: boolean }) { return <span className={`signal-mark ${small ? "signal-mark--small" : ""}`} aria-hidden="true"><i/><i/><i/></span>; }

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { text } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [firstName, setFirstName] = useState(text("there", "allí"));
  const [initials, setInitials] = useState("AR");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [activeCompanyId, setActiveCompanyId] = useState("");
  const [activeCompanyName, setActiveCompanyName] = useState("");
  const navLabels: Record<string, string> = {
    overview: text("Overview", "Resumen"), profile: "Business DNA", radar: text("Radar scans", "Escaneos de radar"),
    prospects: text("Prospects", "Prospectos"), send: text("Outreach", "Contacto"),
  };
  const currentLabel = pathname === "/admin/companies" ? text("Companies", "Empresas")
    : pathname === "/admin/users" ? text("Users", "Usuarios")
    : companyNav.find((item) => item[1] === pathname) ? navLabels[companyNav.find((item) => item[1] === pathname)![0]]
    : pathname === "/learning-loop" ? text("Learning loop", "Ciclo de aprendizaje")
    : pathname === "/settings" ? text("Settings", "Configuración") : navLabels.overview;

  useEffect(() => {
    let live = true;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!live || !data.user) return;
      const { data: profile } = await supabase.from("users").select("tenant_id,role,platform_admin,full_name").eq("id", data.user.id).maybeSingle();
      if (!live || !profile) return;
      const name = (profile.full_name || data.user.user_metadata?.full_name || "").trim();
      if (name) {
        setFullName(name); setFirstName(name.split(/\s+/)[0]);
        setInitials(name.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase());
      }
      const admin = isPlatformAdmin(profile);
      setIsAdmin(admin);
      setActiveCompanyId(profile.tenant_id);
      if (admin) {
        const response = await fetch("/api/admin/tenants", { cache: "no-store" });
        const body = await response.json() as { tenants?: Array<{ id: string; name: string }>; active_tenant_id?: string };
        if (!live) return;
        const list = body.tenants ?? [];
        const selectedId = body.active_tenant_id ?? profile.tenant_id;
        setCompanies(list); setActiveCompanyId(selectedId);
        setActiveCompanyName(list.find((company) => company.id === selectedId)?.name ?? "");
      } else {
        const { data: tenant } = await supabase.from("tenants").select("id,name").eq("id", profile.tenant_id).maybeSingle();
        if (live && tenant) { setCompanies([tenant]); setActiveCompanyName(tenant.name); }
      }
    });
    return () => { live = false; };
  }, []);

  async function switchCompany(tenantId: string) {
    if (!tenantId || tenantId === activeCompanyId) return;
    const previous = activeCompanyId;
    setActiveCompanyId(tenantId);
    setActiveCompanyName(companies.find((company) => company.id === tenantId)?.name ?? "");
    const response = await fetch("/api/admin/active-tenant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant_id: tenantId }) });
    if (!response.ok) { setActiveCompanyId(previous); return; }
    router.push(`/panel?tenant=${tenantId}`);
    router.refresh();
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{text("Skip to content", "Saltar al contenido")}</a>
    <aside className="sidebar">
      <Link href="/panel" className="brand"><SignalMark/><span>Anima<span>Radar</span></span></Link>
      <div className="workspace-switcher workspace-switcher--stable"><span className="workspace-dot"/><div><small>{text("Active company", "Empresa activa")}</small>{isAdmin ? <select aria-label={text("Switch active company", "Cambiar empresa activa")} value={activeCompanyId} onChange={(event) => switchCompany(event.target.value)} disabled={!companies.length}>{!companies.length && <option value="">{text("Loading…", "Cargando…")}</option>}{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select> : <strong>{activeCompanyName || text("Loading…", "Cargando…")}</strong>}</div></div>
      <div className="admin-nav-slot" aria-busy={isAdmin === null}>{isAdmin === true && <><p className="nav-label">{text("Admin control", "Control de administrador")}</p><nav className="primary-nav" aria-label={text("Admin control", "Control de administrador")}><Link href={"/admin/companies" as Route} className={pathname === "/admin/companies" ? "active" : ""}><Icon name="overview"/><span>{text("Companies", "Empresas")}</span></Link><Link href={"/admin/users" as Route} className={pathname === "/admin/users" ? "active" : ""}><Icon name="profile"/><span>{text("Users", "Usuarios")}</span></Link></nav></>}</div>
      <p className="nav-label">{text("Active company workspace", "Espacio de la empresa activa")}</p>
      <nav className="primary-nav" aria-label={text("Active company workspace", "Espacio de la empresa activa")}>{companyNav.map(([key, href, icon]) => <Link key={key} href={href} className={pathname === href ? "active" : ""}><Icon name={icon as IconName}/><span>{navLabels[key]}</span></Link>)}</nav>
      <div className="sidebar-bottom"><Link href={"/learning-loop" as Route} className={pathname === "/learning-loop" ? "active" : ""}><Icon name="learn"/><span>{text("Learning loop", "Ciclo de aprendizaje")}</span></Link><Link href={"/settings" as Route} className={pathname === "/settings" ? "active" : ""}><Icon name="settings"/><span>{text("Settings", "Configuración")}</span></Link><div className="user-row"><span className="avatar">{initials}</span><div><strong>{fullName || text("Your account", "Tu cuenta")}</strong><small>{isAdmin ? text("Platform administrator", "Administrador de plataforma") : text("User", "Usuario")}</small></div></div></div>
    </aside>
    <div className="main-column"><header className="topbar"><div className="mobile-brand"><SignalMark small/><span>AnimaRadar</span></div><div className="breadcrumbs"><span>{text("Hello", "Hola")}, {firstName}</span><b>/</b><strong>{currentLabel}</strong></div><div className="top-actions"><LanguageToggle compact/><Link href="/perfil" className="top-avatar" aria-label={text("Open profile", "Abrir perfil")}>{initials}</Link></div></header><main id="main-content" className="content-area">{children}</main></div>
  </div>;
}

export function ButtonArrow({ children, href }: { children: React.ReactNode; href?: Route }) { const content = <>{children}<span className="button-arrow" aria-hidden="true"/></>; return href ? <Link href={href} className="button button-primary">{content}</Link> : <button className="button button-primary">{content}</button>; }
export function SectionHeading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: React.ReactNode }) { return <div className="section-heading">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{detail && <div className="section-detail">{detail}</div>}</div>; }
