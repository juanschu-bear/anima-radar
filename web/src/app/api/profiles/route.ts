import { NextResponse } from "next/server";

type ProfilePayload = { answers: Record<string, string>; market_lang: string; tenant_tone: string };

export async function POST(request: Request) {
  const base = process.env.RADAR_API_URL ?? "http://localhost:8000";
  const payload = (await request.json()) as ProfilePayload;
  const response = await fetch(`${base}/profiles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
  const body: unknown = await response.json();
  return NextResponse.json(body, { status: response.status });
}
