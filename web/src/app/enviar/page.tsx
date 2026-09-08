"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell, { ButtonArrow, SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";

type Message = { id: string; channel: string; channel_url?: string | null; subject: string | null; body: string; due_at: string | null; sent_at: string | null; created_at: string; prospects: { name?: string; status?: string; best_channel?: string; email?: string | null; phone?: string | null; website?: string | null } | null };

export default function SendPage() {
  const { text } = useLanguage(); const [incomingNoticeCode] = useState<string | null>(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("notice") : null); const [messages, setMessages] = useState<Message[]>([]); const [loading, setLoading] = useState(true); const [copied, setCopied] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/messages", { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.detail); setMessages(body.messages ?? []); }).catch((cause) => setError(cause instanceof Error ? cause.message : text("Could not load messages", "No se pudieron cargar los mensajes"))).finally(() => setLoading(false)); }, [text]);
  const queryNotice = incomingNoticeCode === "draft-ready"
    ? text("The draft is ready. Open the right channel, send it yourself, then mark it as sent.", "El borrador ya está listo. Abre el canal adecuado, envíalo tú mismo y luego márcalo como enviado.")
    : null;
  useEffect(() => {
    if (incomingNoticeCode !== "draft-ready") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("notice");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
  }, [incomingNoticeCode]);
  async function copy(message: Message) { await navigator.clipboard.writeText(message.body); setCopied(message.id); }
  async function mark(messageId: string, action: "mark_sent" | "mark_unsent") {
    const response = await fetch("/api/messages", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: messageId, action }) });
    const body = await response.json();
    if (!response.ok) {
      setError(body.detail);
      return;
    }
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, sent_at: action === "mark_sent" ? body.message.sent_at : null, prospects: { ...message.prospects, status: body.prospect_status } } : message));
    setNotice(action === "mark_sent" ? text("Message marked as sent. Record the reply or business result in Learning Loop when it happens.", "Mensaje marcado como enviado. Registra la respuesta o el resultado en el Ciclo de aprendizaje cuando ocurra.") : text("Message reopened for another review pass.", "Mensaje reabierto para otra revisión."));
  }

  return <AppShell><div className="page-toolbar"><SectionHeading eyebrow={text("Outreach / controlled send", "Contacto / envío controlado")} title={text("Every message stays human-approved.", "Cada mensaje requiere aprobación humana.")} detail={text("Only messages stored for the active company appear here. AnimaRadar does not send them automatically.", "Aquí solo aparecen mensajes guardados para la empresa activa. AnimaRadar no los envía automáticamente.")} /><ButtonArrow href="/prospectos">{text("Back to review", "Volver a revisión")}</ButtonArrow></div>{(notice ?? queryNotice) && <p className="notice" aria-live="polite">{notice ?? queryNotice}</p>}{error && <p className="error" aria-live="polite">{error}</p>}<section className="panel"><div className="panel-title"><h2>{text("Prepared messages", "Mensajes preparados")}</h2><span className="live-label">{messages.length} {text("ready", "listos")}</span></div>{loading ? <div className="empty-state">{text("Loading messages…", "Cargando mensajes…")}</div> : messages.length ? <div className="activity-list">{messages.map((message) => <article className="activity-row" key={message.id}><span className="activity-icon">{message.prospects?.name?.slice(0, 1) ?? "M"}</span><div className="message-record"><p><strong>{message.prospects?.name ?? text("Unknown prospect", "Prospecto desconocido")}</strong></p><small>{message.channel} · {message.sent_at ? text("sent", "enviado") : text("ready to send", "listo para enviar")}</small>{message.subject && <h3>{message.subject}</h3>}<p className="message-preview">{message.body}</p><div className="message-actions"><button className="button button-ghost" onClick={() => copy(message)}>{copied === message.id ? text("Copied", "Copiado") : text("Copy message", "Copiar mensaje")}</button>{message.channel_url && <a className="button button-primary" href={message.channel_url} target="_blank" rel="noreferrer">{text("Open channel", "Abrir canal")}<span className="button-arrow"/></a>}<button className="button button-ghost" onClick={() => mark(message.id, message.sent_at ? "mark_unsent" : "mark_sent")}>{message.sent_at ? text("Mark unsent", "Marcar como no enviado") : text("Mark sent", "Marcar como enviado")}</button></div></div></article>)}</div> : <div className="empty-state empty-state--action"><strong>{text("No prepared messages yet.", "Aún no hay mensajes preparados.")}</strong><p>{text("Approve a real prospect first. Message drafts created for that prospect will appear here.", "Aprueba primero un prospecto real. Los borradores creados para ese prospecto aparecerán aquí.")}</p><Link href="/prospectos">{text("Open prospect review", "Abrir revisión de prospectos")} ↗</Link></div>}</section></AppShell>;
}
