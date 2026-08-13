import { Hono } from "hono";
import type { Env } from "../env";
import type { Overview } from "../../shared/types";
import { isEmail, tidyName, toIsoDate, todayIn } from "../../shared/dates";
import { TIMEZONE } from "../env";
import { celebrantsOn, countStudents, upcoming } from "../services/students";
import { lastRun, recentHistory } from "../services/sendLog";
import { runBirthdays, sendOneOff } from "../services/birthdayRun";
import { htmlBody } from "../lib/greeting";
import { makeProvider } from "../email/provider";

const actions = new Hono<{ Bindings: Env }>();

actions.get("/overview", async (c) => {
  const today = todayIn(TIMEZONE);
  const [total, celebrants, next, last] = await Promise.all([
    countStudents(c.env.DB),
    celebrantsOn(c.env.DB, today),
    upcoming(c.env.DB, today),
    lastRun(c.env.DB),
  ]);

  const overview: Overview = {
    total,
    todayCount: celebrants.length,
    today: celebrants.map((s) => ({ id: s.id, name: s.name, email: s.email })),
    upcoming: next,
    lastRun: last,
    testMode: Boolean(c.env.TEST_EMAIL?.trim()),
    testEmail: c.env.TEST_EMAIL ?? "",
    provider: c.env.EMAIL_PROVIDER,
    appName: c.env.APP_NAME,
  };
  return c.json(overview);
});

actions.get("/history", async (c) => c.json(await recentHistory(c.env.DB)));

/** What the recipient would see. Rendered, not sent. */
actions.post("/preview", async (c) => {
  const { name } = await c.req.json<{ name?: string }>();
  return c.html(
    htmlBody({ name: tidyName(name || "Student Name"), appName: c.env.APP_NAME }),
  );
});

actions.post("/run", async (c) => {
  const body = await c.req.json<{ date?: string; dryRun?: boolean; force?: boolean }>();

  // A real send needs deliberate confirmation from the client.
  if (!body.dryRun && c.req.header("X-Confirm-Send") !== "yes") {
    return c.json({ error: "A real send must be confirmed." }, 400);
  }

  try {
    return c.json(
      await runBirthdays(c.env, {
        date: body.date,
        dryRun: body.dryRun ?? false,
        force: body.force ?? false,
        source: "manual",
      }),
    );
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

actions.post("/wish", async (c) => {
  const body = await c.req.json<{
    emails?: string;
    names?: string;
    note?: string;
    dryRun?: boolean;
  }>();

  const emails = (body.emails ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (!emails.length) return c.json({ error: "No address given." }, 400);

  const bad = emails.filter((e) => !isEmail(e));
  if (bad.length) {
    return c.json({ error: `Not valid email addresses: ${bad.join(", ")}` }, 400);
  }

  if (!body.dryRun && c.req.header("X-Confirm-Send") !== "yes") {
    return c.json({ error: "A real send must be confirmed." }, 400);
  }

  const names = (body.names ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  const recipients = emails.map((email, i) => ({
    email,
    name: tidyName(names[i] || email.split("@")[0].replace(/[._]/g, " ")),
  }));

  try {
    return c.json(await sendOneOff(c.env, recipients, body.note, body.dryRun ?? false));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

/** Proves the email credentials work without sending anything to anyone. */
actions.post("/check-email", async (c) => {
  try {
    const provider = makeProvider(c.env);
    return c.json({
      ok: true,
      provider: provider.name,
      message: `Provider "${provider.name}" is configured. Sending from ${c.env.SEND_FROM_EMAIL}.`,
    });
  } catch (err) {
    return c.json({ ok: false, message: (err as Error).message }, 400);
  }
});

actions.get("/today", (c) => c.json({ date: toIsoDate(todayIn(TIMEZONE)), timeZone: TIMEZONE }));

export default actions;
