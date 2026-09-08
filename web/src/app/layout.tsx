import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";

export const metadata: Metadata = { title: "AnimaRadar — Market intelligence", description: "Find the businesses most likely to buy from you." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" style={{ colorScheme: "dark" }} suppressHydrationWarning><head><meta name="theme-color" content="#08111f" /></head><body><LanguageProvider>{children}</LanguageProvider></body></html>;
}
