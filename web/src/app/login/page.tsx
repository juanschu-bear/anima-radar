"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/client";
import { SignalMark } from "@/components/AppShell";
import { LanguageToggle, useLanguage } from "@/components/LanguageProvider";

type Mode = "member" | "admin";

function PasswordToggleIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function EyeOpenIcon() {
  return (
    <PasswordToggleIcon>
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3.2" />
    </PasswordToggleIcon>
  );
}

function EyeClosedIcon() {
  return (
    <PasswordToggleIcon>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.3A11.3 11.3 0 0 1 12 6c6.4 0 10 6 10 6a17.6 17.6 0 0 1-3.2 3.8" />
      <path d="M6.7 6.8C4 8.6 2 12 2 12a17.6 17.6 0 0 0 10 6c1.7 0 3.3-.4 4.7-1.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </PasswordToggleIcon>
  );
}

function PasswordField({
  name,
  placeholder,
  autoComplete,
}: {
  name: string;
  placeholder: string;
  autoComplete: string;
}) {
  const { text } = useLanguage();
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        required
        name={name}
        autoComplete={autoComplete}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={
          visible
            ? text("Hide password", "Ocultar contraseña")
            : text("Show password", "Mostrar contraseña")
        }
        aria-pressed={visible}
      >
        {visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
      </button>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { text } = useLanguage();
  const [mode, setMode] = useState<Mode>("member");
  const [ownerSetupOpen, setOwnerSetupOpen] = useState<boolean | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/setup/owner", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail);
        if (!live) return;
        setOwnerSetupOpen(body.can_setup === true);
      })
      .catch(() => {
        if (live) setOwnerSetupOpen(false);
      });

    return () => {
      live = false;
    };
  }, []);

  const adminSetupMode = mode === "admin" && ownerSetupOpen === true;
  const adminSignInMode = mode === "admin" && ownerSetupOpen !== true;
  const resetAudience = mode === "admin"
    ? {
        button: text("I forgot my admin password", "Olvidé mi contraseña de admin"),
        title: text("Reset admin password", "Restablecer contraseña de admin"),
        detail: text(
          "Use your internal login details to create a new password without leaving the platform.",
          "Usa tus datos internos de acceso para crear una nueva contraseña sin salir de la plataforma.",
        ),
        loginLabel: text("Admin login ID", "ID de acceso admin"),
        passwordLabel: text("New admin password", "Nueva contraseña de admin"),
      }
    : {
        button: text("I forgot my user password", "Olvidé mi contraseña de usuario"),
        title: text("Reset user password", "Restablecer contraseña de usuario"),
        detail: text(
          "If your access was created inside AnimaRadar, you can create a fresh password here too.",
          "Si tu acceso fue creado dentro de AnimaRadar, también puedes crear una contraseña nueva aquí.",
        ),
        loginLabel: text("User login ID", "ID de acceso usuario"),
        passwordLabel: text("New user password", "Nueva contraseña de usuario"),
      };

  async function signInWithPassword(login: string, password: string) {
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: login,
      password,
    });
    if (authError) throw authError;
    const { data: profile } = data.user
      ? await supabase
          .from("users")
          .select("must_change_password")
          .eq("id", data.user.id)
          .maybeSingle()
      : { data: null };
    router.push((profile?.must_change_password ? "/account/password?required=1" : "/panel") as Route);
  }

  async function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);

    try {
      await signInWithPassword(
        String(form.get("login") ?? "").trim(),
        String(form.get("password") ?? ""),
      );
    } catch {
      setError(text("Invalid login ID or password.", "ID de acceso o contraseña incorrectos."));
    } finally {
      setBusy(false);
    }
  }

  async function submitAdminSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");

    try {
      const response = await fetch("/api/setup/owner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: form.get("full_name"),
          workspace_name: form.get("workspace_name"),
          password,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail);
      await signInWithPassword(body.login, password);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : text("Admin setup failed", "Falló la configuración de administrador"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitAdminSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);

    try {
      await signInWithPassword(
        String(form.get("login") ?? "").trim(),
        String(form.get("password") ?? ""),
      );
    } catch {
      setError(text("Invalid admin login or password.", "Acceso de admin o contraseña incorrectos."));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const login = String(form.get("login") ?? "").trim().toLowerCase();
    const fullName = String(form.get("full_name") ?? "").trim();
    const workspaceName = String(form.get("workspace_name") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");

    if (password.length < 10) {
      setError(text("Use at least 10 characters.", "Usa al menos 10 caracteres."));
      setBusy(false);
      return;
    }
    if (password !== confirmation) {
      setError(text("The passwords do not match.", "Las contraseñas no coinciden."));
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/admin-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          login,
          full_name: fullName,
          workspace_name: workspaceName,
          password,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : text("Could not reset the password.", "No se pudo restablecer la contraseña."),
        );
      }
      formElement.reset();
      setShowReset(false);
      setNotice(
        mode === "admin"
          ? text(
              `Admin password updated for ${login}. Sign in above with the new password.`,
              `La contraseña admin de ${login} fue actualizada. Inicia sesión arriba con la nueva contraseña.`,
            )
          : text(
              `User password updated for ${login}. Sign in above with the new password.`,
              `La contraseña de usuario de ${login} fue actualizada. Inicia sesión arriba con la nueva contraseña.`,
            ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : text("Could not reset the password.", "No se pudo restablecer la contraseña."),
      );
    } finally {
      setBusy(false);
    }
  }

  const heading = adminSetupMode
    ? text("Create the first admin.", "Crea el primer admin.")
    : mode === "admin"
      ? text("Admin access.", "Acceso de admin.")
      : text("Welcome back.", "Bienvenido de nuevo.");

  const detail = adminSetupMode
    ? text(
        "Create the first platform administrator and private workspace.",
        "Crea el primer administrador de la plataforma y el espacio privado.",
      )
    : mode === "admin"
      ? text(
          "Sign in as the platform owner or create a fresh password if you no longer know it.",
          "Inicia sesión como propietario de la plataforma o crea una contraseña nueva si ya no la conoces.",
        )
      : text(
          "Use the login ID and password created for you inside AnimaRadar.",
          "Usa el ID de acceso y la contraseña creados para ti dentro de AnimaRadar.",
        );

  const recoveryCard = !adminSetupMode ? (
    <div className="auth-recovery-card">
      <div className="auth-recovery-header">
        <div>
          <span className="feature-status feature-status--partial">
            {mode === "admin"
              ? text("Private admin recovery", "Recuperación privada de admin")
              : text("Internal password help", "Ayuda interna de contraseña")}
          </span>
          <h2>{resetAudience.title}</h2>
          <p>{resetAudience.detail}</p>
        </div>
        <button
          type="button"
          className={`auth-recovery-toggle${showReset ? " is-open" : ""}`}
          onClick={() => {
            setShowReset((current) => !current);
            setError(null);
            setNotice(null);
          }}
          aria-expanded={showReset}
        >
          <span>{resetAudience.button}</span>
          <i aria-hidden="true">{showReset ? "−" : "+"}</i>
        </button>
      </div>

      <div className="auth-recovery-points">
        <div>
          <strong>{text("No email step", "Sin paso por email")}</strong>
          <small>
            {text(
              "Everything stays inside the platform.",
              "Todo se mantiene dentro de la plataforma.",
            )}
          </small>
        </div>
        <div>
          <strong>{text("Identity match", "Verificación de identidad")}</strong>
          <small>
            {mode === "admin"
              ? text(
                  "Admin login ID, full name, and company must match.",
                  "El ID admin, el nombre completo y la empresa deben coincidir.",
                )
              : text(
                  "User login ID, full name, and company must match.",
                  "El ID de usuario, el nombre completo y la empresa deben coincidir.",
                )}
          </small>
        </div>
      </div>

      {notice && (
        <div className="auth-recovery-result" aria-live="polite">
          <strong>{text("Password updated", "Contraseña actualizada")}</strong>
          <p>{notice}</p>
        </div>
      )}

      {showReset && (
        <form onSubmit={submitReset} className="password-reset-panel">
          <p className="eyebrow">
            {mode === "admin"
              ? text("Admin password reset", "Reset de contraseña admin")
              : text("User password reset", "Reset de contraseña usuario")}
          </p>
          <label>
            {resetAudience.loginLabel}
            <input
              required
              name="login"
              autoComplete="username"
              type="text"
              placeholder={
                mode === "admin"
                  ? "juan.schubert@animaradar.com"
                  : "name@animaradar.com"
              }
            />
          </label>
          <label>
            {text("Full name", "Nombre completo")}
            <input required name="full_name" autoComplete="name" placeholder="Juan Schubert" />
          </label>
          <label>
            {text("Company name", "Nombre de la empresa")}
            <input required name="workspace_name" autoComplete="organization" placeholder="Preserva" />
          </label>
          <label>
            {resetAudience.passwordLabel}
            <PasswordField
              name="password"
              autoComplete="new-password"
              placeholder={text("At least 10 characters", "Al menos 10 caracteres")}
            />
          </label>
          <label>
            {text("Confirm new password", "Confirmar nueva contraseña")}
            <PasswordField
              name="confirmation"
              autoComplete="new-password"
              placeholder={text("Repeat the new password", "Repite la nueva contraseña")}
            />
          </label>
          <button className="button button-ghost" disabled={busy}>
            {busy ? text("Updating…", "Actualizando…") : text("Create new password", "Crear nueva contraseña")}
          </button>
        </form>
      )}
    </div>
  ) : null;

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="brand">
          <SignalMark />
          <span>
            Anima<span style={{ color: "var(--champagne)" }}>Radar</span>
          </span>
        </div>
        <div className="login-quote">
          <h1>
            {mode === "admin"
              ? text("Private control for the platform owner.", "Control privado para el propietario de la plataforma.")
              : text("See the signal before it becomes obvious.", "Detecta la señal antes de que sea evidente.")}
          </h1>
          <p>{detail}</p>
        </div>
        <small>{text("PRIVATE PLATFORM ACCESS", "ACCESO PRIVADO A LA PLATAFORMA")}</small>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <LanguageToggle />
          <SignalMark small />
          <p className="eyebrow">
            {mode === "admin"
              ? text("Admin access", "Acceso admin")
              : text("Workspace access", "Acceso al espacio")}
          </p>

          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              className={mode === "member" ? "active" : ""}
              onClick={() => {
                setMode("member");
                setShowReset(false);
                setError(null);
                setNotice(null);
              }}
            >
              {text("User login", "Login usuario")}
            </button>
            <button
              type="button"
              className={mode === "admin" ? "active" : ""}
              onClick={() => {
                setMode("admin");
                setError(null);
                setNotice(null);
              }}
            >
              {text("Admin login", "Login admin")}
            </button>
          </div>

          <h1>{heading}</h1>

          {mode === "member" ? (
            <>
              <form onSubmit={submitMember}>
                <label>
                  Login ID
                  <input
                    required
                    name="login"
                    autoComplete="username"
                    type="text"
                    placeholder="name@animaradar.com"
                  />
                </label>
                <label>
                  {text("Password", "Contraseña")}
                  <PasswordField
                    name="password"
                    autoComplete="current-password"
                    placeholder={text("Your password…", "Tu contraseña…")}
                  />
                </label>
                <button className="button button-primary" disabled={busy}>
                  {busy ? text("Signing in…", "Entrando…") : text("Sign in", "Iniciar sesión")}
                  <span className="button-arrow" />
                </button>
              </form>
              {recoveryCard}
            </>
          ) : adminSetupMode ? (
            <form onSubmit={submitAdminSetup}>
              <label>
                {text("Full name", "Nombre completo")}
                <input required name="full_name" autoComplete="name" placeholder="Juan Schubert" />
              </label>
              <label>
                {text("Company name", "Nombre de la empresa")}
                <input required name="workspace_name" autoComplete="organization" placeholder="Preserva" />
              </label>
              <label>
                {text("Admin password", "Contraseña de admin")}
                <PasswordField
                  name="password"
                  autoComplete="new-password"
                  placeholder={text("At least 10 characters", "Al menos 10 caracteres")}
                />
              </label>
              <button className="button button-primary" disabled={busy}>
                {busy ? text("Creating…", "Creando…") : text("Create admin workspace", "Crear espacio admin")}
                <span className="button-arrow" />
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={submitAdminSignIn}>
                <label>
                  {text("Admin login ID", "ID de acceso admin")}
                  <input
                    required
                    name="login"
                    autoComplete="username"
                    type="text"
                    placeholder="juan.schubert@animaradar.com"
                  />
                </label>
                <label>
                  {text("Admin password", "Contraseña de admin")}
                  <PasswordField
                    name="password"
                    autoComplete="current-password"
                    placeholder={text("Your admin password…", "Tu contraseña de admin…")}
                  />
                </label>
                <button className="button button-primary" disabled={busy}>
                  {busy ? text("Signing in…", "Entrando…") : text("Sign in as admin", "Entrar como admin")}
                  <span className="button-arrow" />
                </button>
              </form>
              {recoveryCard}
            </>
          )}

          {notice && (
            <p className="notice" aria-live="polite">
              {notice}
            </p>
          )}
          {error && (
            <p className="error" aria-live="polite">
              {error}
            </p>
          )}

          <p className="login-fine">
            {mode === "member"
              ? text(
                  "Use the credentials created for you by the platform administrator, or open the reset panel if you forgot the password.",
                  "Usa las credenciales creadas para ti por el administrador de la plataforma, o abre el panel de recuperación si olvidaste la contraseña.",
                )
              : ownerSetupOpen === true
                ? text(
                    "This setup closes automatically after the first admin workspace exists.",
                    "Esta configuración se cierra automáticamente después de que exista el primer espacio admin.",
                  )
                : text(
                    "Admin access stays inside the platform. No recovery email is required.",
                    "El acceso admin se mantiene dentro de la plataforma. No se requiere correo de recuperación.",
                  )}
          </p>
        </div>
      </section>
    </main>
  );
}
