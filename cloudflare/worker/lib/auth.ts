/**
 * A single admin login.
 *
 * Deliberately small: one username and password held as Worker secrets, traded
 * for an HMAC-signed cookie. No user table, no password reset, no sessions to
 * store - there is exactly one operator. If this ever needs real accounts,
 * this is the only file that has to change.
 *
 * The cookie carries an expiry and is signed, so it cannot be forged or
 * extended without SESSION_SECRET.
 */

import type { Context, Next } from "hono";
import type { Env } from "../env";

const COOKIE = "bes_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

const encoder = new TextEncoder();

/** Comparison that does not leak how much of the value matched. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function issueToken(env: Env): Promise<string> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${env.DASH_USER}.${expires}`;
  return `${payload}.${await sign(payload, env.SESSION_SECRET!)}`;
}

export async function verifyToken(token: string, env: Env): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [user, expiresRaw, mac] = parts;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  if (user !== env.DASH_USER) return false;

  return safeEqual(mac, await sign(`${user}.${expiresRaw}`, env.SESSION_SECRET!));
}

export function sessionCookie(token: string, secure: boolean): string {
  const flags = [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}

export function clearCookie(secure: boolean): string {
  const flags = [`${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export function checkCredentials(env: Env, user: string, pass: string): boolean {
  if (!env.DASH_USER || !env.DASH_PASS) return false;
  // Both compared so a wrong username costs the same time as a wrong password.
  const okUser = safeEqual(user, env.DASH_USER);
  const okPass = safeEqual(pass, env.DASH_PASS);
  return okUser && okPass;
}

/** Every /api route except /api/auth/* passes through this. */
export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const env = c.env;

  if (!env.DASH_USER || !env.DASH_PASS || !env.SESSION_SECRET) {
    return c.json(
      {
        error:
          "The dashboard has no login configured. Set DASH_USER, DASH_PASS and " +
          "SESSION_SECRET with `wrangler secret put`.",
      },
      503,
    );
  }

  const token = readCookie(c.req.header("Cookie"), COOKIE);
  if (!token || !(await verifyToken(token, env))) {
    return c.json({ error: "Not signed in." }, 401);
  }

  await next();
}
