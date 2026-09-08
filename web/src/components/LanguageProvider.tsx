"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "es";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  text: (english: string, spanish: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem("animaradar-language");
    const next = stored === "es" || stored === "en"
      ? stored
      : navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
    window.setTimeout(() => setLanguageState(next), 0);
    document.documentElement.lang = next;
  }, []);

  function setLanguage(next: Language) {
    setLanguageState(next);
    window.localStorage.setItem("animaradar-language", next);
    document.documentElement.lang = next;
  }

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    text: (english, spanish) => language === "es" ? spanish : english,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();
  return <div className={`language-toggle ${compact ? "language-toggle--compact" : ""}`} role="group" aria-label="Language / Idioma">
    <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
    <button type="button" aria-pressed={language === "es"} onClick={() => setLanguage("es")}>ES</button>
  </div>;
}
