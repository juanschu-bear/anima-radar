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
    full_name?: string;
    workspace_name?: string;
    password?: string;
  };

  const login = String(payload.login ?? "").trim().toLowerCase();
  const recoveryKey = String(payload.recovery_key ?? "").trim();
  const fullName = String(payload.full_name ?? "").trim();
  const workspaceName = String(payload.workspace_name ?? "").trim();
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
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id,email,platform_admin,full_name,tenant_id,role")
    .eq("email", login)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ detail: profileError.message }, { status: 502 });
  }
  if (!profile) {
    return NextResponse.json(
      { detail: "No account was found for that login ID" },
      { status: 404 },
    );
  }

  let authorized = false;

  if (configuredRecoveryKey && recoveryKey) {
    authorized = safeEqual(recoveryKey, configuredRecoveryKey);
  } else {
    if (!fullName || !workspaceName) {
      return NextResponse.json(
        {
          detail:
            "Full name and company name are required when no recovery key is configured.",
        },
        { status: 400 },
      );
    }

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("id,name")
      .eq("id", profile.tenant_id)
      .maybeSingle();

    if (tenantError) {
      return NextResponse.json({ detail: tenantError.message }, { status: 502 });
    }

    authorized =
      normalize(profile.full_name ?? "") === normalize(fullName) &&
      normalize(tenant?.name ?? "") === normalize(workspaceName);
  }

  if (!authorized) {
    return NextResponse.json(
      { detail: "Recovery details do not match this account" },
      { status: 403 },
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

  return NextResponse.json({
    ok: true,
    login,
    account_type: profile.platform_admin ? "platform_admin" : profile.role ?? "member",
  });
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
