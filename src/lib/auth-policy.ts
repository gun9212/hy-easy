export type SchoolUser = {
  email?: string;
  email_confirmed_at?: string;
  identities?: { provider: string; identity_data?: Record<string, unknown> }[];
};
export function isSchoolUser(user: SchoolUser | null): boolean {
  if (!user?.email_confirmed_at || !user.email || !/^[^@\s]+@hanyang\.ac\.kr$/i.test(user.email)) return false;
  return Boolean(
    user.identities?.some(
      identity =>
        identity.provider === "google" &&
        identity.identity_data?.email_verified === true &&
        String(identity.identity_data.email).toLowerCase() === user.email?.toLowerCase(),
    ),
  );
}
