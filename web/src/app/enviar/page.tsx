"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell, { ButtonArrow, SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";
import { buildChannelHref, describeChannelPolicy, labelChannel } from "@/lib/channel-policy";

type Message = {
  id: string;
  step: number;
  channel: string;
  channel_url?: string | null;
  subject: string | null;
  body: string;
  due_at: string | null;
  sent_at: string | null;
  created_at: string;
  edited?: boolean;
  prospects: { name?: string; status?: string; best_channel?: string; email?: string | null; phone?: string | null; website?: string | null; instagram?: string | null; country?: string | null } | null;
};

export default function SendPage() {
  const { language, text } = useLanguage();
  const [incomingNoticeCode] = useState<string | null>(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("notice") : null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/messages", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail);
        const nextMessages = body.messages ?? [];
        setMessages(nextMessages);
        setDrafts(Object.fromEntries(nextMessages.map((message: Message) => [message.id, { subject: message.subject ?? "", body: message.body }])));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : text("Could not load messages", "No se pudieron cargar los mensajes")))
      .finally(() => setLoading(false));
  }, [text]);

  const queryNotice = incomingNoticeCode === "draft-ready"
    ? text("The outreach sequence is ready. Adjust the wording, open the right channel, then mark each step as sent.", "La secuencia de contacto ya está lista. Ajusta el texto, abre el canal correcto y luego marca cada paso como enviado.")
    : null;

  useEffect(() => {
    if (incomingNoticeCode !== "draft-ready") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("notice");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
  }, [incomingNoticeCode]);

  async function copy(message: Message) {
    await navigator.clipboard.writeText(drafts[message.id]?.body ?? message.body);
    setCopied(message.id);
  }

  async function saveDraft(message: Message) {
    const draft = drafts[message.id];
    if (!draft) return;
    setSavingId(message.id);
    setError(null);
    const response = await fetch("/api/messages", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: message.id, action: "save_draft", subject: draft.subject, body: draft.body }) });
    const body = await response.json();
    setSavingId(null);
    if (!response.ok) {
      setError(body.detail);
      return;
    }
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, ...body.message } : item));
    setNotice(text("Draft saved. The edited version is now the live company record.", "Borrador guardado. La versión editada ahora es el registro activo de la empresa."));
  }

  async function mark(messageId: string, action: "mark_sent" | "mark_unsent") {
    const response = await fetch("/api/messages", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: messageId, action }) });
    const body = await response.json();
    if (!response.ok) {
      setError(body.detail);
      return;
    }
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, sent_at: action === "mark_sent" ? body.message.sent_at : null, prospects: { ...message.prospects, status: body.prospect_status } } : message));
    setNotice(action === "mark_sent" ? text("Message marked as sent. Follow-ups stay visible here, and the result belongs in Learning Loop once you know it.", "Mensaje marcado como enviado. Los seguimientos siguen visibles aquí y el resultado va al Ciclo de aprendizaje cuando lo sepas.") : text("Message reopened for another review pass.", "Mensaje reabierto para otra revisión."));
  }

  const readyNow = messages.filter((message) => !message.sent_at && (!message.due_at || new Date(message.due_at).getTime() <= now));
  const scheduled = messages.filter((message) => !message.sent_at && message.due_at && new Date(message.due_at).getTime() > now);
  const sent = messages.filter((message) => Boolean(message.sent_at));
  const firstContactsSentToday = sent.filter((message) => {
    if (!message.sent_at || message.step !== 1) return false;
    const sentAt = new Date(message.sent_at);
    const today = new Date(now);
    return sentAt.getFullYear() === today.getFullYear()
      && sentAt.getMonth() === today.getMonth()
      && sentAt.getDate() === today.getDate();
  }).length;
  const ruModeActive = messages.some((message) => {
    const country = message.prospects?.country?.toUpperCase();
    return country === "RU" || country === "KZ" || country === "BY";
  });
  const countryMix = Array.from(
    new Set(
      messages
        .map((message) => message.prospects?.country?.toUpperCase())
        .filter((country): country is string => Boolean(country)),
    ),
  );

  return (
    <AppShell>
      <div className="page-toolbar">
        <SectionHeading
          eyebrow={text("Outreach / controlled send", "Contacto / envío controlado")}
          title={text("Every message stays human-approved.", "Cada mensaje requiere aprobación humana.")}
          detail={text("Step 1, follow-up 1 and follow-up 2 now live together inside the active company.", "El paso 1, el seguimiento 1 y el seguimiento 2 ahora viven juntos dentro de la empresa activa.")}
        />
        <ButtonArrow href="/learning-loop">{text("Open learning loop", "Abrir ciclo de aprendizaje")}</ButtonArrow>
      </div>

      {(notice ?? queryNotice) && <p className="notice" aria-live="polite">{notice ?? queryNotice}</p>}
      {error && <p className="error" aria-live="polite">{error}</p>}

      <div className="learning-layout">
        <section className="panel learning-progress">
          <div className="panel-title">
            <h2>{text("Ready now", "Listos ahora")}</h2>
            <span className="feature-status feature-status--ready">{readyNow.length}</span>
          </div>
          <div className="learning-stat"><strong>{readyNow.length}</strong><span>{text("messages can be sent immediately", "mensajes se pueden enviar ahora")}</span></div>
          <div className="learning-stat"><strong>{scheduled.length}</strong><span>{text("scheduled follow-ups", "seguimientos programados")}</span></div>
          <div className="learning-stat"><strong>{sent.length}</strong><span>{text("already marked as sent", "ya marcados como enviados")}</span></div>
          {ruModeActive && <div className="learning-stat"><strong>{firstContactsSentToday}/30</strong><span>{text("first contacts sent today in RU/KZ/BY mode", "primeros contactos enviados hoy en modo RU/KZ/BY")}</span></div>}
        </section>

        <section className="panel learning-hero">
          <p className="eyebrow">{text("Message sequence", "Secuencia de mensajes")}</p>
          <h2>{text("Edit the wording, then", "Edita el texto y luego")}<br /><em>{text("send it as a human.", "envíalo como humano.")}</em></h2>
          <p>{text("Every saved edit becomes the company record. Follow-ups stay visible with their due dates instead of disappearing into email.", "Cada edición guardada se convierte en el registro de la empresa. Los seguimientos siguen visibles con su fecha prevista en vez de desaparecer en el correo.")}</p>
          <small>{messages[0]?.prospects?.country ? describeChannelPolicy(messages[0].prospects.country, text) : text("Channel policy depends on the prospect market and the contact path you can verify publicly.", "La política del canal depende del mercado del prospecto y de la vía de contacto que puedas verificar públicamente.")}</small>
          {!!countryMix.length && (
            <small>
              {text("Current market mix", "Mercados activos")}: {countryMix.join(" · ")}
              {ruModeActive ? ` · ${text("Daily first-contact ceiling: 30 per sender", "Techo diario de primeros contactos: 30 por remitente")}` : ""}
            </small>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-title">
          <h2>{text("Prepared outreach", "Contacto preparado")}</h2>
          <span className="live-label">{messages.length} {text("steps", "pasos")}</span>
        </div>

        {loading ? <div className="empty-state">{text("Loading messages…", "Cargando mensajes…")}</div> : messages.length ? (
          <div className="activity-list">
            {messages.map((message) => {
              const currentSubject = drafts[message.id]?.subject ?? "";
              const currentBody = drafts[message.id]?.body ?? message.body;
              const channelHref = buildChannelHref({
                channel: message.channel,
                subject: currentSubject,
                body: currentBody,
                contact: {
                  email: message.prospects?.email,
                  phone: message.prospects?.phone,
                  website: message.prospects?.website,
                  instagram: message.prospects?.instagram,
                  country: message.prospects?.country,
                },
              });
              return (
                <article className="activity-row" key={message.id}>
                  <span className="activity-icon">{message.prospects?.name?.slice(0, 1) ?? "M"}</span>
                  <div className="message-record">
                    <p><strong>{message.prospects?.name ?? text("Unknown prospect", "Prospecto desconocido")}</strong></p>
                    <small>{stepLabel(message.step, text)} · {labelChannel(message.channel, text)} · {message.sent_at ? text("sent", "enviado") : message.due_at ? `${text("due", "vence")} ${new Date(message.due_at).toLocaleDateString(language === "es" ? "es-EC" : "en-US")}` : text("ready now", "listo ahora")}</small>
                    {message.prospects?.country && (
                      <small>{describeChannelPolicy(message.prospects.country, text)}</small>
                    )}
                    <div className="settings-fields">
                      <label>{text("Subject", "Asunto")}<input value={currentSubject} onChange={(event) => setDrafts((current) => ({ ...current, [message.id]: { subject: event.target.value, body: currentBody } }))} /></label>
                      <label>{text("Message", "Mensaje")}<textarea rows={6} value={currentBody} onChange={(event) => setDrafts((current) => ({ ...current, [message.id]: { subject: currentSubject, body: event.target.value } }))} /></label>
                    </div>
                    <div className="message-actions">
                      <button className="button button-ghost" onClick={() => saveDraft(message)} disabled={savingId === message.id}>{savingId === message.id ? text("Saving…", "Guardando…") : message.edited ? text("Save changes", "Guardar cambios") : text("Save draft", "Guardar borrador")}</button>
                      <button className="button button-ghost" onClick={() => copy(message)}>{copied === message.id ? text("Copied", "Copiado") : text("Copy message", "Copiar mensaje")}</button>
                      {channelHref && <a className="button button-primary" href={channelHref} target="_blank" rel="noreferrer">{text("Open channel", "Abrir canal")}<span className="button-arrow" /></a>}
                      <button className="button button-ghost" onClick={() => mark(message.id, message.sent_at ? "mark_unsent" : "mark_sent")}>{message.sent_at ? text("Mark unsent", "Marcar como no enviado") : text("Mark sent", "Marcar como enviado")}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state empty-state--action">
            <strong>{text("No prepared messages yet.", "Aún no hay mensajes preparados.")}</strong>
            <p>{text("Approve a real prospect first. The outreach sequence for that prospect will appear here.", "Aprueba primero un prospecto real. La secuencia de contacto para ese prospecto aparecerá aquí.")}</p>
            <Link href="/prospectos">{text("Open prospect review", "Abrir revisión de prospectos")} ↗</Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function stepLabel(step: number, text: (english: string, spanish: string) => string) {
  if (step === 1) return text("Step 1", "Paso 1");
  if (step === 2) return text("Follow-up 1", "Seguimiento 1");
  return text("Follow-up 2", "Seguimiento 2");
}
