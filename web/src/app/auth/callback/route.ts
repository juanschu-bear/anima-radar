import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: membership } = await supabase.from("users").select("tenant_id").maybeSingle();
      return NextResponse.redirect(new URL(membership?.tenant_id ? "/panel" : "/onboarding", request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth_callback", request.url));
}
