import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const base = process.env.RADAR_API_URL ?? "http://localhost:8000";
  const payload: unknown = await request.json();
  const response = await fetch(`${base}/scans`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
  const body: unknown = await response.json();
  return NextResponse.json(body, { status: response.status });
}
