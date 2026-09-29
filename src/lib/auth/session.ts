import { SESSION_SECRET } from "@/lib/github-app/env";

/**
 * Signs and verifies the `/dashboard` session cookie — a tiny hand-rolled JWT-alike (base64url(payload) +
 * "." + base64url(HMAC-SHA256 signature)), not a real JWT library, because the payload here is trivial and
 * this project has no JWT dependency to reach for. Built on Web Crypto (`crypto.subtle`) specifically
 * because it's the one crypto API available identically in both the Node runtime (Server Actions, route
 * handlers) and the Edge runtime (`proxy.ts`, if a future change moves the /dashboard gate into it) — no
 * new dependency, no runtime-specific branching.
 *
 * This is deliberately NOT how `/admin`'s Basic Auth works (`proxy.ts`): that's one operator, one shared
 * password, no per-user identity needed. `/dashboard` is the opposite — many different GitHub accounts,
 * each of whom must only ever see their own installations — so the session has to carry *who this is* and
 * be tamper-evident, which a shared password can't do.
 */

export type Session = {
  uid: number; // GitHub account id (numeric, stable across username changes) — from GET /user during OAuth
  login: string; // GitHub username, for display only — never used for authorization checks
  installationIds: number[]; // resolved once at login from installationIdsForAccount(uid); see oauth/callback
  exp: number; // unix ms
};

export const SESSION_COOKIE = "ah_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — short enough that a revoked GitHub Sign-in eventually stops mattering, long enough not to be annoying

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  if (!SESSION_SECRET) {
    throw new Error("SESSION_SECRET isn't set — /dashboard can't issue or verify sessions without it. See .env.example.");
  }
  return crypto.subtle.importKey("raw", new TextEncoder().encode(SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(session: Omit<Session, "exp">): Promise<string> {
  const full: Session = { ...session, exp: Date.now() + SESSION_TTL_MS };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(full));
  const payloadPart = base64UrlEncode(payloadBytes);
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart));
  const signaturePart = base64UrlEncode(new Uint8Array(signature));
  return `${payloadPart}.${signaturePart}`;
}

/** Verifies the signature and expiry, returning the session or null — never throws on bad input, since this
 * runs against whatever cookie value a client happens to send (a stale, tampered, or foreign one included). */
export async function verifySessionToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadPart, signaturePart] = parts;

  try {
    const key = await hmacKey();
    const signatureBytes = base64UrlDecode(signaturePart);
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes as BufferSource, new TextEncoder().encode(payloadPart));
    if (!valid) return null;

    const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))) as Session;
    if (typeof session.exp !== "number" || session.exp < Date.now()) return null;
    if (typeof session.uid !== "number" || !Array.isArray(session.installationIds)) return null;
    return session;
  } catch {
    return null; // malformed base64, malformed JSON, wrong-length signature, etc. — all just "not a valid session"
  }
}
