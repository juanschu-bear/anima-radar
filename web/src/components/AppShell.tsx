"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/client";

type IconName = "overview" | "profile" | "radar" | "prospects" | "send" | "learn" | "settings";
const nav = [["overview", "Overview", "/panel", "overview"], ["profile", "Business DNA", "/perfil", "profile"], ["radar", "Radar scans", "/radar", "radar"], ["prospects", "Prospects", "/prospectos", "prospects"], ["send", "Outreach", "/enviar", "send"]] as const;

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
  const pathname = usePathname(); const [fullName, setFullName] = useState(""); const [firstName, setFirstName] = useState("there"); const [initials, setInitials] = useState("JS"); const [isOwner, setIsOwner] = useState(false);
  const currentLabel = nav.find((item) => item[2] === pathname)?.[1] ?? (pathname === "/learning-loop" ? "Learning loop" : pathname === "/settings" ? "Settings" : pathname.startsWith("/admin") ? "Team & access" : pathname.startsWith("/perfil") ? "Business DNA" : "Overview");
  useEffect(() => { const supabase = createClient(); supabase.auth.getUser().then(async ({ data }) => { const name = typeof data.user?.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name.trim() : ""; if (name) { setFullName(name); setFirstName(name.split(/\s+/)[0]); setInitials(name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()); } if (data.user) { const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).maybeSingle(); setIsOwner(profile?.role === "owner"); } }); }, []);
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><aside className="sidebar"><Link href="/panel" className="brand"><SignalMark/><span>Anima<span>Radar</span></span></Link><Link href="/settings" className="workspace-switcher"><span className="workspace-dot"/><div><strong>Andes Bloom</strong><small>Workspace identity</small></div><span className="chevron">⌄</span></Link><p className="nav-label">Workspace</p><nav className="primary-nav" aria-label="Primary navigation">{nav.map(([key, label, href, icon]) => <Link key={key} href={href} className={pathname === href ? "active" : ""}><Icon name={icon as IconName}/><span>{label}</span>{key === "prospects" && <b>12</b>}</Link>)}{isOwner && <Link href={"/admin/users" as Route} className={pathname.startsWith("/admin") ? "active" : ""}><Icon name="profile"/><span>Team & access</span></Link>}</nav><div className="sidebar-bottom"><Link href={"/learning-loop" as Route} className={pathname === "/learning-loop" ? "active" : ""}><Icon name="learn"/><span>Learning loop</span></Link><Link href={"/settings" as Route} className={pathname === "/settings" ? "active" : ""}><Icon name="settings"/><span>Settings</span></Link><div className="usage"><div className="usage-head"><span>Scan capacity</span><strong>72%</strong></div><div className="usage-bar"><i/></div><small>Resets in 12 days</small></div><div className="user-row"><span className="avatar">{initials}</span><div><strong>{fullName || "Your account"}</strong><small>{fullName ? `${firstName}'s workspace` : "Owner"}</small></div><span className="more">•••</span></div></div></aside><div className="main-column"><header className="topbar"><div className="mobile-brand"><SignalMark small/><span>AnimaRadar</span></div><div className="breadcrumbs"><span>Good to see you, {firstName}</span><b>/</b><strong>{currentLabel}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Open notifications"><span className="notification-dot"/><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button><Link href="/perfil" className="top-avatar">{initials}</Link></div></header><main id="main-content" className="content-area">{children}</main></div></div>;
}

export function ButtonArrow({ children, href }: { children: React.ReactNode; href?: Route }) { const content = <>{children}<span className="button-arrow" aria-hidden="true"/></>; return href ? <Link href={href} className="button button-primary">{content}</Link> : <button className="button button-primary">{content}</button>; }
export function SectionHeading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: React.ReactNode }) { return <div className="section-heading">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{detail && <div className="section-detail">{detail}</div>}</div>; }
