export type AccessProfile = {
  role?: string | null;
  platform_admin?: boolean | null;
};

export function isPlatformAdmin(profile: AccessProfile | null | undefined) {
  return profile?.platform_admin === true || profile?.role === "owner";
}
