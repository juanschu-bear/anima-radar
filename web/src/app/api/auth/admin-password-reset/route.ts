import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    login?: string;
    recovery_key?: string;
    password?: string;
  };

  const login = String(payload.login ?? "").trim().toLowerCase();
  const recoveryKey = String(payload.recovery_key ?? "").trim();
  const password = String(payload.password ?? "");
  const configuredRecoveryKey = process.env.ADMIN_RECOVERY_KEY?.trim();

  if (!login) {
    return NextResponse.json({ detail: "Login ID is required" }, { status: 400 });
  }
  if (password.length < 10) {
    return NextResponse.json(
      { detail: "Password must contain at least 10 characters" },
      { status: 400 },
    );
  }
  if (!configuredRecoveryKey) {
    return NextResponse.json(
      {
        detail:
          "Admin password recovery is not configured yet. Add ADMIN_RECOVERY_KEY in the deployment environment first.",
      },
      { status: 503 },
    );
  }
  if (!recoveryKey || !safeEqual(recoveryKey, configuredRecoveryKey)) {
    return NextResponse.json({ detail: "Recovery key is invalid" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id,email,platform_admin")
    .eq("email", login)
    .eq("platform_admin", true)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ detail: profileError.message }, { status: 502 });
  }
  if (!profile) {
    return NextResponse.json(
      { detail: "No platform admin was found for that login ID" },
      { status: 404 },
    );
  }

  const { error: authError } = await admin.auth.admin.updateUserById(profile.id, {
    password,
    email_confirm: true,
  });
  if (authError) {
    return NextResponse.json({ detail: authError.message }, { status: 502 });
  }

  const { error: userUpdateError } = await admin
    .from("users")
    .update({ must_change_password: false })
    .eq("id", profile.id);

  if (userUpdateError) {
    return NextResponse.json({ detail: userUpdateError.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, login });
}
