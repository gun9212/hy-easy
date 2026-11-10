// Automatic operator login through the Hanyang portal (api.hanyang.ac.kr OAuth).
// Form structure measured on 2026-11-10. Credentials come only from the environment
// (HYWEP_ID / HYWEP_PW: .env.local locally, Secret Manager in the cloud) and are never logged.
import type { Page } from "playwright";
import { SessionExpired, sourceUrl, type Selectors } from "./adapter";

const HYWEP_INDEX = "https://hywep.hanyang.ac.kr/index.do";
const PORTAL_LOGIN = /^https:\/\/api\.hanyang\.ac\.kr\/oauth\/login/;
const HYWEP_PAGE = /^https:\/\/hywep\.hanyang\.ac\.kr\//;
const PORTAL_FORM = { id: "#uid", password: "#upw", submit: "#login_btn" } as const;
/** `topLogin('1')` is the student login on the HY-WEP index page. */
const STUDENT_LOGIN_SCRIPT = "topLogin('1')";
const LOGIN_TIMEOUT_MS = 30_000;

export type Credentials = { id: string; password: string };
export type SessionResult = "reused" | "logged_in";

export class LoginFailed extends Error {
  constructor(reason: string) {
    super(`LOGIN_FAILED: ${reason}`);
  }
}

export function credentialsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Credentials | null {
  const id = env.HYWEP_ID?.trim();
  const password = env.HYWEP_PW;
  return id && password ? { id, password } : null;
}

async function isAuthenticated(page: Page, s: Selectors): Promise<boolean> {
  return (await page.locator(s.authenticated).count()) > 0;
}

/** Logs in with the operator's portal account. Throws LoginFailed without revealing input values. */
export async function loginWithPassword(page: Page, credentials: Credentials): Promise<void> {
  await page.goto(HYWEP_INDEX, { waitUntil: "domcontentloaded", timeout: LOGIN_TIMEOUT_MS });
  await Promise.all([
    page.waitForURL(PORTAL_LOGIN, { timeout: LOGIN_TIMEOUT_MS }),
    page.evaluate(STUDENT_LOGIN_SCRIPT),
  ]).catch(() => {
    throw new LoginFailed("PORTAL_NOT_REACHED");
  });

  await page.locator(PORTAL_FORM.id).fill(credentials.id);
  await page.locator(PORTAL_FORM.password).fill(credentials.password);
  await Promise.all([
    page.waitForURL(HYWEP_PAGE, { timeout: LOGIN_TIMEOUT_MS }),
    page.locator(PORTAL_FORM.submit).click(),
  ]).catch(() => {
    throw new LoginFailed("PORTAL_REJECTED_OR_TIMEOUT");
  });
}

/**
 * Opens the list page with the stored session; logs in again only when the session has expired.
 * Without credentials an expired session stays a SessionExpired error.
 */
export async function ensureSession(
  page: Page,
  s: Selectors,
  listUrl: string,
  credentials: Credentials | null,
): Promise<SessionResult> {
  const url = sourceUrl(listUrl);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: LOGIN_TIMEOUT_MS });
  if (await isAuthenticated(page, s)) return "reused";
  if (!credentials) throw new SessionExpired();

  await loginWithPassword(page, credentials);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: LOGIN_TIMEOUT_MS });
  if (!(await isAuthenticated(page, s))) throw new LoginFailed("NOT_AUTHENTICATED_AFTER_LOGIN");
  return "logged_in";
}
