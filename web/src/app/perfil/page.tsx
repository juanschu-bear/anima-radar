"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import AppShell, { ButtonArrow, SectionHeading } from "@/components/AppShell";
import { useLanguage } from "@/components/LanguageProvider";
import { createClient } from "@/lib/supabase/client";

type QuestionCopy = {
  label: [string, string];
  placeholder: [string, string];
  helper: [string, string];
};

type DraftPayload = {
  answers: Record<string, string>;
  updatedAt: string;
};

type VaultSnapshot = {
  id: string;
  tenantId: string | null;
  companyName: string;
  source: "browser-draft" | "workspace-save" | "recovery";
  updatedAt: string;
  answers: Record<string, string>;
};

const questions: QuestionCopy[] = [
  {
    label: [
      "What do you sell, and how is it delivered?",
      "¿Qué vendes y cómo lo entregas?",
    ],
    placeholder: [
      "Example: We sell founder-led AI strategy sprints and custom system builds, delivered remotely in weekly working sessions.",
      "Ejemplo: Vendemos sprints de estrategia de IA liderados por el fundador y desarrollos de sistemas a medida, entregados de forma remota en sesiones semanales.",
    ],
    helper: [
      "Describe the offer, delivery format, and who actually does the work.",
      "Describe la oferta, el formato de entrega y quién realiza realmente el trabajo.",
    ],
  },
  {
    label: [
      "Who are your three best customers today — and why do they buy?",
      "¿Quiénes son hoy tus tres mejores clientes y por qué compran?",
    ],
    placeholder: [
      "Name real examples and the buying trigger behind each one.",
      "Nombra ejemplos reales y el detonante de compra detrás de cada uno.",
    ],
    helper: [
      "Mention company type, situation, and the concrete reason they said yes.",
      "Menciona el tipo de empresa, la situación y la razón concreta por la que dijeron que sí.",
    ],
  },
  {
    label: [
      "What kind of company would never be a fit?",
      "¿Qué tipo de empresa nunca encajaría?",
    ],
    placeholder: [
      "Example: Teams looking for a cheap plug-and-play tool without founder access or implementation depth.",
      "Ejemplo: Equipos que buscan una herramienta barata y plug-and-play sin acceso al fundador ni profundidad de implementación.",
    ],
    helper: [
      "Be explicit about the bad-fit traits, not just the industries.",
      "Sé explícito sobre los rasgos de mal encaje, no solo sobre las industrias.",
    ],
  },
  {
    label: [
      "Where do you want to grow next?",
      "¿Dónde quieres crecer a continuación?",
    ],
    placeholder: [
      "Example: Spain and Mexico first, then enterprise buyers in the US with higher-ticket custom deployments.",
      "Ejemplo: España y México primero, luego compradores enterprise en EE. UU. con implementaciones personalizadas de mayor ticket.",
    ],
    helper: [
      "Include geography, segment, and the next logical expansion bet.",
      "Incluye geografía, segmento y la siguiente apuesta lógica de expansión.",
    ],
  },
  {
    label: [
      "What makes you different, in your own words?",
      "¿Qué te hace diferente, en tus propias palabras?",
    ],
    placeholder: [
      "Say it the way you would in a sales conversation, not as a slogan.",
      "Dilo como lo dirías en una conversación comercial, no como un eslogan.",
    ],
    helper: [
      "Focus on the actual edge customers can feel or verify.",
      "Enfócate en la ventaja real que los clientes pueden sentir o verificar.",
    ],
  },
  {
    label: [
      "What proof do you have of that difference?",
      "¿Qué pruebas tienes de esa diferencia?",
    ],
    placeholder: [
      "List evidence such as case outcomes, measurable results, customer behavior, or public proof.",
      "Enumera evidencias como resultados de casos, métricas, comportamiento del cliente o pruebas públicas.",
    ],
    helper: [
      "The more observable the proof, the better the radar can justify the fit.",
      "Cuanto más observable sea la prueba, mejor podrá el radar justificar el encaje.",
    ],
  },
  {
    label: [
      "Who signs your messages, and in which language?",
      "¿Quién firma tus mensajes y en qué idioma?",
    ],
    placeholder: [
      "Example: Juan signs strategic replies in English and Spanish; German is used for DACH founder outreach.",
      "Ejemplo: Juan firma respuestas estratégicas en inglés y español; el alemán se usa para outreach de founders en DACH.",
    ],
    helper: [
      "Say who takes over, how personal it should sound, and the language logic.",
      "Indica quién toma el relevo, qué tan personal debe sonar y la lógica del idioma.",
    ],
  },
  {
    label: [
      "What should happen after the first message?",
      "¿Qué debería ocurrir después del primer mensaje?",
    ],
    placeholder: [
      "Example: The goal is a short founder call. No deck by email — just enough frictionless context to earn the reply.",
      "Ejemplo: El objetivo es una llamada corta con el fundador. Sin deck por email; solo el contexto suficiente para conseguir la respuesta.",
    ],
    helper: [
      "Define the desired next step, not the whole sales cycle.",
      "Define el siguiente paso deseado, no todo el ciclo comercial.",
    ],
  },
];

const MAX_VAULT_SNAPSHOTS = 6;
const PROFILE_VAULT_KEY = "animaradar:business-dna-vault";

export default function ProfilePage() {
  const router = useRouter();
  const { language, text } = useLanguage();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [hasServerProfile, setHasServerProfile] = useState(false);
  const [serverSnapshot, setServerSnapshot] = useState<VaultSnapshot | null>(null);
  const [localDraftSnapshot, setLocalDraftSnapshot] = useState<VaultSnapshot | null>(null);
  const [vaultSnapshots, setVaultSnapshots] = useState<VaultSnapshot[]>([]);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [setupCode] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("setup")
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  const answerExport = useMemo(() => buildAnswerExport(answers, language), [answers, language]);
  const hasMeaningfulContent = hasMeaningfulAnswers(answers);
  const liveDraftSnapshot = useMemo(() => {
    if (!tenantId || !hasMeaningfulContent) return localDraftSnapshot;
    return createSnapshot({
      tenantId,
      companyName,
      source: "browser-draft",
      answers,
      updatedAt: localDraftSnapshot?.updatedAt ?? new Date().toISOString(),
    });
  }, [answers, companyName, hasMeaningfulContent, localDraftSnapshot, tenantId]);
  const visibleVaultSnapshots = useMemo(
    () =>
      sortSnapshots(
        dedupeSnapshots(
          getRelatedSnapshots(
            mergeVaultSnapshots(vaultSnapshots, liveDraftSnapshot),
            tenantId,
            companyName,
          ),
        ),
      ),
    [companyName, liveDraftSnapshot, tenantId, vaultSnapshots],
  );

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/profiles", { cache: "no-store" }),
      fetch("/api/workspace", { cache: "no-store" }),
    ])
      .then(async ([profileResponse, workspaceResponse]) => {
        const body = await profileResponse.json().catch(() => ({}));
        const workspaceBody = await workspaceResponse.json().catch(() => ({}));

        if (!profileResponse.ok) throw new Error(body.detail);
        if (!workspaceResponse.ok) throw new Error(workspaceBody.detail);
        if (!active) return;

        const currentTenantId = typeof body.tenant_id === "string" ? body.tenant_id : null;
        const currentCompanyName = workspaceBody.tenant?.name ?? "";
        const serverAnswers = isAnswerRecord(body.profile?.raw_answers)
          ? body.profile.raw_answers
          : {};
        const serverProfileExists = Boolean(body.profile);

        setCanEdit(body.can_edit !== false);
        setCompanyName(currentCompanyName);
        setTenantId(currentTenantId);
        setHasServerProfile(serverProfileExists);

        const draftSnapshot = currentTenantId
          ? readDraftSnapshot(currentTenantId, currentCompanyName)
          : null;
        const latestServerSnapshot = serverProfileExists
          ? createSnapshot({
              tenantId: currentTenantId,
              companyName: currentCompanyName,
              source: "workspace-save",
              answers: serverAnswers,
              updatedAt: body.profile?.created_at,
            })
          : null;

        const storedSnapshots = readVaultSnapshots();
        const snapshotsWithServer = mergeVaultSnapshots(
          storedSnapshots,
          latestServerSnapshot,
        );
        const updatedSnapshots = mergeVaultSnapshots(
          snapshotsWithServer,
          draftSnapshot,
        );
        writeVaultSnapshots(updatedSnapshots);
        const relatedSnapshots = sortSnapshots(
          dedupeSnapshots(
            getRelatedSnapshots(updatedSnapshots, currentTenantId, currentCompanyName),
          ),
        );

        setServerSnapshot(latestServerSnapshot);
        setLocalDraftSnapshot(draftSnapshot);
        setVaultSnapshots(relatedSnapshots);

        let nextAnswers: Record<string, string> = {};
        let nextRecoveryNotice: string | null = null;

        if (latestServerSnapshot) {
          nextAnswers = latestServerSnapshot.answers;
        } else if (draftSnapshot) {
          nextAnswers = draftSnapshot.answers;
          nextRecoveryNotice = text(
            "We restored the last browser draft for this company. Save it to lock it into the workspace.",
            "Recuperamos el último borrador del navegador de esta empresa. Guárdalo para fijarlo en el espacio de trabajo.",
          );
        } else if (relatedSnapshots[0]) {
          nextAnswers = relatedSnapshots[0].answers;
          nextRecoveryNotice = text(
            "We recovered the latest known answer backup for this company. Review it, then save it back into the workspace.",
            "Recuperamos la última copia conocida de respuestas para esta empresa. Revísala y luego guárdala de nuevo en el espacio de trabajo.",
          );
        }

        setAnswers(nextAnswers);
        setRecoveryNotice(nextRecoveryNotice);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : text("Could not load Business DNA", "No se pudo cargar el ADN del negocio"),
          );
        }
      });

    return () => {
      active = false;
    };
  }, [text]);

  useEffect(() => {
    if (setupCode !== "new-company") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("setup");
    const nextQuery = params.toString();
    window.history.replaceState(
      {},
      "",
      nextQuery
        ? `${window.location.pathname}?${nextQuery}`
        : window.location.pathname,
    );
  }, [setupCode]);

  useEffect(() => {
    if (!tenantId || !hasMeaningfulContent) return;

    const payload: DraftPayload = {
      answers,
      updatedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(draftKey(tenantId), JSON.stringify(payload));

    const nextSnapshot = createSnapshot({
      tenantId,
      companyName,
      source: "browser-draft",
      answers,
      updatedAt: payload.updatedAt,
    });

    const merged = mergeVaultSnapshots(readVaultSnapshots(), nextSnapshot);
    writeVaultSnapshots(merged);
  }, [answers, companyName, hasMeaningfulContent, tenantId]);

  const setupNotice =
    setupCode === "new-company"
      ? text(
          "Company created. Next, define the Business DNA for this workspace so the radar can use real criteria.",
          "Empresa creada. Ahora define el ADN del negocio de este espacio para que el radar use criterios reales.",
        )
      : null;

  const draftConflict =
    serverSnapshot &&
    liveDraftSnapshot &&
    !areAnswersEqual(serverSnapshot.answers, liveDraftSnapshot.answers)
      ? text(
          "Your workspace has a saved version and your browser has a newer-looking draft. You can restore either version below.",
          "Tu espacio de trabajo tiene una versión guardada y tu navegador tiene un borrador que parece más nuevo. Puedes restaurar cualquiera de las dos versiones abajo.",
        )
      : null;

  async function saveProfile() {
    return fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answers,
        market_lang: language,
        tenant_tone: "concrete and respectful",
      }),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    setSaved(false);
    setSessionExpired(false);
    setError(null);
    setStatusMessage(null);

    try {
      let response = await saveProfile();
      if (response.status === 401) {
        const { error: refreshError } = await createClient().auth.refreshSession();
        if (!refreshError) response = await saveProfile();
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) setSessionExpired(true);
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : text("Could not save Business DNA", "No se pudo guardar el ADN del negocio"),
        );
      }

      const timestamp = new Date().toISOString();
      const latestWorkspaceSnapshot = createSnapshot({
        tenantId,
        companyName,
        source: "workspace-save",
        answers,
        updatedAt: timestamp,
      });

      const latestDraftSnapshot = createSnapshot({
        tenantId,
        companyName,
        source: "browser-draft",
        answers,
        updatedAt: timestamp,
      });

      const merged = mergeVaultSnapshots(
        mergeVaultSnapshots(readVaultSnapshots(), latestWorkspaceSnapshot),
        latestDraftSnapshot,
      );

      writeVaultSnapshots(merged);
      if (tenantId) {
        window.localStorage.setItem(
          draftKey(tenantId),
          JSON.stringify({ answers, updatedAt: timestamp } satisfies DraftPayload),
        );
      }

      setServerSnapshot(latestWorkspaceSnapshot);
      setLocalDraftSnapshot(latestDraftSnapshot);
      setVaultSnapshots(
        sortSnapshots(dedupeSnapshots(getRelatedSnapshots(merged, tenantId, companyName))),
      );
      setRecoveryNotice(null);
      setSaved(true);
      setStatusMessage(
        text(
          "Business DNA saved. We’re taking you to the radar next.",
          "ADN del negocio guardado. Te llevamos al radar ahora.",
        ),
      );

      window.setTimeout(() => {
        router.replace("/radar?setup=business-dna-complete");
      }, 700);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : text("Could not save Business DNA", "No se pudo guardar el ADN del negocio"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyAnswersToClipboard(snapshot?: VaultSnapshot | null) {
    const payload = buildAnswerExport(snapshot?.answers ?? answers, language);

    try {
      await navigator.clipboard.writeText(payload);
      setCopyState("done");
      setStatusMessage(
        text("Answer pack copied to clipboard.", "Paquete de respuestas copiado al portapapeles."),
      );
    } catch {
      setCopyState("failed");
      setStatusMessage(
        text(
          "Clipboard copy failed on this browser. Open the answer pack below and copy it manually.",
          "La copia al portapapeles falló en este navegador. Abre el paquete de respuestas abajo y cópialo manualmente.",
        ),
      );
    }
  }

  function restoreSnapshot(snapshot: VaultSnapshot) {
    setAnswers(snapshot.answers);
    setError(null);
    setSaved(false);
    setRecoveryNotice(
      text(
        `Restored ${snapshotLabel(snapshot, "en")} from ${formatTimestamp(snapshot.updatedAt, "en")}. Save to make this the live workspace version.`,
        `Se restauró ${snapshotLabel(snapshot, "es")} de ${formatTimestamp(snapshot.updatedAt, "es")}. Guarda para convertirlo en la versión activa del espacio.`,
      ),
    );
  }

  return (
    <AppShell>
      <div className="page-toolbar">
        <SectionHeading
          eyebrow={text("Business DNA / profile", "ADN del negocio / perfil")}
          title={text("Tell us what makes you a fit.", "Cuéntanos qué te hace encajar.")}
          detail={text(
            "Your answers become the real lens AnimaRadar uses for this company. They can be edited at any time.",
            "Tus respuestas se convierten en el criterio real que AnimaRadar usa para esta empresa. Puedes editarlas en cualquier momento.",
          )}
        />
        <ButtonArrow href="/radar">
          {text("Continue to radar", "Continuar al radar")}
        </ButtonArrow>
      </div>

      {setupNotice && (
        <p className="notice" aria-live="polite">
          {setupNotice}
        </p>
      )}
      {recoveryNotice && (
        <p className="notice" aria-live="polite">
          {recoveryNotice}
        </p>
      )}
      {draftConflict && (
        <p className="notice" aria-live="polite">
          {draftConflict}
        </p>
      )}
      {!canEdit && (
        <p className="notice" aria-live="polite">
          {text(
            "Only a company admin can edit Business DNA for this company. Standard users can still review prospects and outcomes.",
            "Solo un administrador de empresa puede editar el ADN del negocio de esta empresa. Los usuarios estándar aún pueden revisar prospectos y resultados.",
          )}
        </p>
      )}

      <section className="profile-vault panel" aria-labelledby="answer-vault-title">
        <div className="panel-title">
          <div>
            <h2 id="answer-vault-title">
              {text("Answer vault", "Bóveda de respuestas")}
            </h2>
            <small>
              {text(
                "Visible backup, restore, and copy controls",
                "Controles visibles para respaldo, restauración y copia",
              )}
            </small>
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => copyAnswersToClipboard(null)}
            >
              {text("Copy current answers", "Copiar respuestas actuales")}
            </button>
          </div>
        </div>

        <div className="vault-grid">
          <article className="vault-card">
            <small>{text("Workspace version", "Versión del espacio")}</small>
            <strong>
              {serverSnapshot
                ? text("Saved in the company workspace", "Guardado en el espacio de la empresa")
                : text("No workspace save yet", "Aún no hay guardado del espacio")}
            </strong>
            <p>
              {serverSnapshot
                ? text(
                    `Last locked-in version: ${formatTimestamp(serverSnapshot.updatedAt, "en")}`,
                    `Última versión confirmada: ${formatTimestamp(serverSnapshot.updatedAt, "es")}`,
                  )
                : text(
                    "Once you save, this becomes the live version used by the radar.",
                    "Cuando guardes, esta se convierte en la versión activa que usa el radar.",
                  )}
            </p>
            {serverSnapshot && (
              <div className="vault-actions">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => restoreSnapshot(serverSnapshot)}
                >
                  {text("Restore workspace version", "Restaurar versión del espacio")}
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => copyAnswersToClipboard(serverSnapshot)}
                >
                  {text("Copy saved version", "Copiar versión guardada")}
                </button>
              </div>
            )}
          </article>

          <article className="vault-card">
            <small>{text("Browser safety draft", "Borrador de seguridad del navegador")}</small>
            <strong>
              {localDraftSnapshot
                ? text("Draft protection is active", "La protección de borrador está activa")
                : text("No local draft yet", "Aún no hay borrador local")}
            </strong>
            <p>
              {liveDraftSnapshot
                ? text(
                    `Latest browser draft: ${formatTimestamp(liveDraftSnapshot.updatedAt, "en")}`,
                    `Último borrador del navegador: ${formatTimestamp(liveDraftSnapshot.updatedAt, "es")}`,
                  )
                : text(
                    "As soon as you type, we keep a local fallback on this device too.",
                    "En cuanto escribes, también guardamos un respaldo local en este dispositivo.",
                  )}
            </p>
            {liveDraftSnapshot && (
              <div className="vault-actions">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => restoreSnapshot(liveDraftSnapshot)}
                >
                  {text("Restore browser draft", "Restaurar borrador del navegador")}
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => copyAnswersToClipboard(liveDraftSnapshot)}
                >
                  {text("Copy draft", "Copiar borrador")}
                </button>
              </div>
            )}
          </article>

          <article className="vault-card vault-card--wide">
            <small>{text("Recovery snapshots", "Snapshots de recuperación")}</small>
            <strong>
              {text(
                "Recent known versions for this company",
                "Versiones recientes conocidas para esta empresa",
              )}
            </strong>
            <p>
              {text(
                "If anything ever feels missing, restore one of these snapshots instead of rewriting everything from scratch.",
                "Si algo alguna vez parece faltar, restaura uno de estos snapshots en lugar de reescribir todo desde cero.",
              )}
            </p>
            <div className="vault-snapshot-list">
              {visibleVaultSnapshots.length === 0 ? (
                <div className="vault-snapshot-empty">
                  {text(
                    "No recovery snapshots yet. As soon as you type or save, they will appear here.",
                    "Aún no hay snapshots de recuperación. En cuanto escribas o guardes, aparecerán aquí.",
                  )}
                </div>
              ) : (
                visibleVaultSnapshots.map((snapshot) => (
                  <div className="vault-snapshot-row" key={snapshot.id}>
                    <div>
                      <strong>{snapshotLabel(snapshot, language)}</strong>
                      <small>
                        {formatTimestamp(snapshot.updatedAt, language)} ·{" "}
                        {text(
                          `${countAnswered(snapshot.answers)}/8 answers filled`,
                          `${countAnswered(snapshot.answers)}/8 respuestas completas`,
                        )}
                      </small>
                    </div>
                    <div className="vault-actions">
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => restoreSnapshot(snapshot)}
                      >
                        {text("Restore", "Restaurar")}
                      </button>
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => copyAnswersToClipboard(snapshot)}
                      >
                        {text("Copy", "Copiar")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>

        <details className="vault-preview">
          <summary>{text("Open answer pack", "Abrir paquete de respuestas")}</summary>
          <p>
            {text(
              "This is the exact text block you can copy, save, or paste elsewhere.",
              "Este es el bloque exacto de texto que puedes copiar, guardar o pegar en otro lugar.",
            )}
          </p>
          <textarea readOnly value={answerExport} rows={16} />
        </details>
      </section>

      <div className="profile-layout">
        <form id="profile-form" onSubmit={submit} className="form-grid form-grid--profile">
          {questions.map((question, index) => {
            const key = `answer-${index + 1}`;
            return (
              <div className="question question--guided" key={key}>
                <label htmlFor={key}>
                  <span>
                    {text("Signal", "Señal")} 0{index + 1}
                  </span>
                  {question.label[language === "es" ? 1 : 0]}
                </label>
                <p className="question-helper">
                  {question.helper[language === "es" ? 1 : 0]}
                </p>
                <textarea
                  id={key}
                  required
                  name={key}
                  rows={4}
                  value={answers[key] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  placeholder={question.placeholder[language === "es" ? 1 : 0]}
                  readOnly={!canEdit}
                  disabled={!canEdit}
                  aria-describedby={`${key}-helper`}
                />
                <small id={`${key}-helper`} className="question-helper-copy">
                  {text(
                    "Saved locally while you type and recoverable from the vault above.",
                    "Se guarda localmente mientras escribes y se puede recuperar desde la bóveda de arriba.",
                  )}
                </small>
              </div>
            );
          })}
        </form>
      </div>

      <div className="form-footer">
        <span>
          {text(
            hasServerProfile
              ? "8 signals · workspace version exists · browser fallback active"
              : "8 signals · browser fallback active until you save the workspace version",
            hasServerProfile
              ? "8 señales · existe versión del espacio · respaldo del navegador activo"
              : "8 señales · respaldo del navegador activo hasta que guardes la versión del espacio",
          )}
        </span>
        <button
          type="submit"
          form="profile-form"
          className="button button-primary"
          disabled={saving || !canEdit}
        >
          {saving ? text("Saving…", "Guardando…") : text("Save Business DNA", "Guardar ADN del negocio")}
          <span className="button-arrow">↗</span>
        </button>
      </div>

      {statusMessage && (
        <p className="notice" aria-live="polite">
          {statusMessage}
        </p>
      )}
      {error && (
        <p className="error" aria-live="polite">
          {error}{" "}
          {sessionExpired && (
            <Link href="/login">
              {text("Sign in again — your draft is safe", "Vuelve a iniciar sesión — tu borrador está seguro")} ↗
            </Link>
          )}
        </p>
      )}
      {saved && (
        <p className="notice" aria-live="polite">
          {text("Business DNA saved.", "ADN del negocio guardado.")}{" "}
          <Link href="/radar">
            {text("Create a scan", "Crear un escaneo")} ↗
          </Link>
        </p>
      )}
      {copyState === "failed" && (
        <p className="notice" aria-live="polite">
          {text(
            "If copy did not work in this browser, open the answer pack and copy it manually. The text remains visible there.",
            "Si la copia no funcionó en este navegador, abre el paquete de respuestas y cópialo manualmente. El texto sigue visible ahí.",
          )}
        </p>
      )}
    </AppShell>
  );
}

function draftKey(tenantId: string) {
  return `animaradar:business-dna-draft:${tenantId}`;
}

function buildAnswerExport(
  answers: Record<string, string>,
  language: "en" | "es",
) {
  return questions
    .map((question, index) => {
      const key = `answer-${index + 1}`;
      const label = question.label[language === "es" ? 1 : 0];
      const value = answers[key]?.trim() || "—";
      return `${index + 1}. ${label}\n${value}`;
    })
    .join("\n\n");
}

function readDraftSnapshot(tenantId: string, companyName: string) {
  const storedDraft = window.localStorage.getItem(draftKey(tenantId));
  if (!storedDraft) return null;

  try {
    const parsedDraft: unknown = JSON.parse(storedDraft);
    if (isDraftPayload(parsedDraft)) {
      return createSnapshot({
        tenantId,
        companyName,
        source: "browser-draft",
        answers: parsedDraft.answers,
        updatedAt: parsedDraft.updatedAt,
      });
    }
    if (isAnswerRecord(parsedDraft)) {
      return createSnapshot({
        tenantId,
        companyName,
        source: "browser-draft",
        answers: parsedDraft,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch {
    window.localStorage.removeItem(draftKey(tenantId));
  }

  return null;
}

function createSnapshot(input: {
  tenantId: string | null;
  companyName: string;
  source: VaultSnapshot["source"];
  answers: Record<string, string>;
  updatedAt?: string | null;
}) {
  return {
    id: `${input.tenantId ?? "no-tenant"}:${input.source}:${slugifyCompany(input.companyName)}`,
    tenantId: input.tenantId,
    companyName: input.companyName,
    source: input.source,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    answers: input.answers,
  } satisfies VaultSnapshot;
}

function readVaultSnapshots() {
  if (typeof window === "undefined") return [] as VaultSnapshot[];

  try {
    const raw = window.localStorage.getItem(PROFILE_VAULT_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVaultSnapshot).slice(0, MAX_VAULT_SNAPSHOTS);
  } catch {
    return [];
  }
}

function writeVaultSnapshots(snapshots: VaultSnapshot[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PROFILE_VAULT_KEY,
    JSON.stringify(sortSnapshots(dedupeSnapshots(snapshots)).slice(0, MAX_VAULT_SNAPSHOTS)),
  );
}

function mergeVaultSnapshots(
  snapshots: VaultSnapshot[],
  candidate: VaultSnapshot | null,
) {
  if (!candidate || !hasMeaningfulAnswers(candidate.answers)) return snapshots;

  const next = [candidate, ...snapshots.filter((snapshot) => snapshot.id !== candidate.id)];
  return sortSnapshots(dedupeSnapshots(next)).slice(0, MAX_VAULT_SNAPSHOTS);
}

function getRelatedSnapshots(
  snapshots: VaultSnapshot[],
  tenantId: string | null,
  companyName: string,
) {
  const tenantMatches = tenantId
    ? snapshots.filter((snapshot) => snapshot.tenantId === tenantId)
    : [];
  const companySlug = slugifyCompany(companyName);
  const companyMatches = companySlug
    ? snapshots.filter((snapshot) => slugifyCompany(snapshot.companyName) === companySlug)
    : [];

  return [...tenantMatches, ...companyMatches];
}

function dedupeSnapshots(snapshots: VaultSnapshot[]) {
  const seen = new Set<string>();
  return snapshots.filter((snapshot) => {
    if (seen.has(snapshot.id)) return false;
    seen.add(snapshot.id);
    return true;
  });
}

function sortSnapshots(snapshots: VaultSnapshot[]) {
  return [...snapshots].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function snapshotLabel(snapshot: VaultSnapshot, language: "en" | "es") {
  if (snapshot.source === "workspace-save") {
    return language === "es" ? "Versión guardada del espacio" : "Saved workspace version";
  }
  if (snapshot.source === "browser-draft") {
    return language === "es" ? "Borrador del navegador" : "Browser draft";
  }
  return language === "es" ? "Respaldo recuperado" : "Recovered backup";
}

function formatTimestamp(value: string, language: "en" | "es") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(language === "es" ? "es-EC" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function countAnswered(answers: Record<string, string>) {
  return Object.values(answers).filter((value) => value.trim().length > 0).length;
}

function hasMeaningfulAnswers(answers: Record<string, string>) {
  return Object.values(answers).some((value) => value.trim().length > 0);
}

function areAnswersEqual(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => (left[key] ?? "").trim() === (right[key] ?? "").trim());
}

function slugifyCompany(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function isDraftPayload(value: unknown): value is DraftPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    "answers" in value &&
    isAnswerRecord((value as { answers?: unknown }).answers) &&
    "updatedAt" in value &&
    typeof (value as { updatedAt?: unknown }).updatedAt === "string"
  );
}

function isVaultSnapshot(value: unknown): value is VaultSnapshot {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<VaultSnapshot>;
  return (
    typeof snapshot.id === "string" &&
    (snapshot.tenantId === null || typeof snapshot.tenantId === "string") &&
    typeof snapshot.companyName === "string" &&
    (snapshot.source === "browser-draft" ||
      snapshot.source === "workspace-save" ||
      snapshot.source === "recovery") &&
    typeof snapshot.updatedAt === "string" &&
    isAnswerRecord(snapshot.answers)
  );
}

function isAnswerRecord(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}
