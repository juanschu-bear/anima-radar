import { isCompanyAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

export async function resolvePostAuthPath(userId: string) {
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("users")
    .select("tenant_id,role,platform_admin,must_change_password")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile?.tenant_id) return "/login?error=workspace_access";
  if (profile.must_change_password) return "/account/password?required=1";

  const { count } = await admin
    .from("business_profiles")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id);

  if ((count ?? 0) === 0) {
    return isCompanyAdmin(profile) ? "/perfil?setup=new-company" : "/panel?notice=company-setup-pending";
  }

  return "/panel";
}
