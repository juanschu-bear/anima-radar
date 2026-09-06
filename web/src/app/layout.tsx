import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "AnimaRadar", description: "Find the businesses most likely to buy from you." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
