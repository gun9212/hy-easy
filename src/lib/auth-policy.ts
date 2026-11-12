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

/** The signed access-token claims requireUser reads (verified locally against the project's ES256 key). */
export type SchoolClaims = {
  sub?: string;
  email?: string;
  is_anonymous?: boolean;
  app_metadata?: { provider?: string; providers?: string[] };
};
/**
 * Per-request check from token claims. Sign-in (auth/google, auth/callback) already ran the full isSchoolUser
 * check against the auth server, and the database enforces is_school_user() on every row; this keeps a token for
 * any other account (another domain, anonymous, a non-Google provider) out of the app. Only server-controlled
 * claims are used: email and app_metadata cannot be changed by the user.
 */
export function isSchoolClaims(claims: SchoolClaims | null): boolean {
  if (!claims?.sub || claims.is_anonymous || !claims.email || !/^[^@\s]+@hanyang\.ac\.kr$/i.test(claims.email))
    return false;
  const providers = claims.app_metadata?.providers ?? [claims.app_metadata?.provider];
  return providers.includes("google");
}
