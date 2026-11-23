"use client";

// Google Identity Services button. Google shows this site's own domain in its sign-in window (the redirect flow
// shows the Supabase project domain instead). The ID token is exchanged for a Supabase session by /auth/google.
import Script from "next/script";
import { useCallback, useRef, useState } from "react";

type CredentialResponse = { credential?: string };
type GoogleId = {
  initialize(options: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce: string;
    hd: string;
    ux_mode: "popup";
    auto_select: boolean;
    context: "signin";
  }): void;
  renderButton(
    element: HTMLElement,
    options: {
      type: "standard";
      theme: "filled_blue";
      size: "large";
      text: "continue_with";
      locale: string;
      width: number;
    },
  ): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCHOOL_DOMAIN = "hanyang.ac.kr";
const MAX_BUTTON_WIDTH = 400;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function exchange(credential: string, nonce: string): Promise<string> {
  const response = await fetch("/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, nonce }),
  });
  const body: unknown = await response.json().catch(() => null);
  const redirect = (body as { redirect?: unknown } | null)?.redirect;
  return typeof redirect === "string" && redirect.startsWith("/") ? redirect : "/login?error=oauth";
}

export function GoogleSignIn({ clientId }: { clientId: string }) {
  const slot = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const render = useCallback(async () => {
    const google = window.google;
    const element = slot.current;
    if (!google || !element) return setFailed(true);
    // Google signs the hashed nonce into the token; Supabase checks it against the raw value.
    const nonce = crypto.randomUUID();
    google.accounts.id.initialize({
      client_id: clientId,
      nonce: await sha256Hex(nonce),
      hd: SCHOOL_DOMAIN,
      ux_mode: "popup",
      auto_select: false,
      context: "signin",
      callback: async ({ credential }) => {
        if (!credential) return;
        setBusy(true);
        try {
          window.location.assign(await exchange(credential, nonce));
        } catch {
          setBusy(false);
          // A full reload on purpose: the login page re-renders its error and re-initialises the Google button.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/login?error=oauth");
        }
      },
    });
    google.accounts.id.renderButton(element, {
      type: "standard",
      theme: "filled_blue",
      size: "large",
      text: "continue_with",
      locale: "ko",
      width: Math.min(element.clientWidth || MAX_BUTTON_WIDTH, MAX_BUTTON_WIDTH),
    });
  }, [clientId]);

  if (failed) {
    return (
      <a className="google-login" href="/auth/login">
        <span className="google-g">G</span>한양대 Google 계정으로 계속
      </a>
    );
  }
  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => void render()}
        onError={() => setFailed(true)}
      />
      <div ref={slot} className="google-button-slot" aria-busy={busy} />
      {busy && (
        <p className="google-status" role="status">
          로그인하는 중…
        </p>
      )}
    </>
  );
}
