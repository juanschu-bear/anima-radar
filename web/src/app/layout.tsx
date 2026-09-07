import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: "AnimaRadar — Market intelligence", description: "Find the businesses most likely to buy from you." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" style={{ colorScheme: "dark" }}><head><meta name="theme-color" content="#08111f" /></head><body>{children}</body></html>;
}
