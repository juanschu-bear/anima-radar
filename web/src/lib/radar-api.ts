export type RadarApiError = { detail: string };

export async function radarApi<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.RADAR_API_URL ?? "http://localhost:8000";
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ detail: response.statusText }))) as RadarApiError;
    throw new Error(body.detail);
  }

  return (await response.json()) as T;
}
