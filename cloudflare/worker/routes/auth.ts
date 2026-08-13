import { Hono } from "hono";
import type { Env } from "../env";
import {
  checkCredentials,
  clearCookie,
  issueToken,
  sessionCookie,
  verifyToken,
} from "../lib/auth";

const auth = new Hono<{ Bindings: Env }>();

const isSecure = (url: string) => new URL(url).protocol === "https:";

auth.post("/login", async (c) => {
  const { username, password } = await c.req.json<{
    username?: string;
    password?: string;
  }>();

  if (!c.env.DASH_USER || !c.env.DASH_PASS || !c.env.SESSION_SECRET) {
    return c.json(
      {
        error:
          "No login is configured on the server. Set DASH_USER, DASH_PASS and " +
          "SESSION_SECRET with `wrangler secret put`.",
      },
      503,
    );
  }

  if (!checkCredentials(c.env, username ?? "", password ?? "")) {
    // Same message either way - never reveal which half was wrong.
    return c.json({ error: "Wrong username or password." }, 401);
  }

  const token = await issueToken(c.env);
  c.header("Set-Cookie", sessionCookie(token, isSecure(c.req.url)));
  return c.json({ ok: true });
});

auth.post("/logout", (c) => {
  c.header("Set-Cookie", clearCookie(isSecure(c.req.url)));
  return c.json({ ok: true });
});

/** Lets the React app decide between the login screen and the dashboard. */
auth.get("/me", async (c) => {
  const cookie = c.req.header("Cookie") ?? "";
  const token = cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("bes_session="))
    ?.slice("bes_session=".length);

  const configured = Boolean(c.env.DASH_USER && c.env.DASH_PASS && c.env.SESSION_SECRET);
  const signedIn = Boolean(token && configured && (await verifyToken(token, c.env)));

  return c.json({ signedIn, configured });
});

export default auth;
