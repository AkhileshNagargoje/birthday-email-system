import { Hono } from "hono";
import type { Env } from "../env";
import type { Overview } from "../../shared/types";
import { isEmail, tidyName, toIsoDate, todayIn } from "../../shared/dates";
import { TIMEZONE } from "../env";
import { celebrantsOn, countStudents, upcoming } from "../services/students";
import { lastRun, recentHistory } from "../services/sendLog";
import { runBirthdays } from "../services/birthdayRun";
import { dispatchWorkflow, recentRuns } from "../lib/github";
import { htmlBody } from "../lib/greeting";
import { makeProvider } from "../email/provider";
import { verifySmtpLogin } from "../email/smtp";

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

/**
 * Every send goes through the GitHub Actions workflow - the one submission
 * path whose mail reaches inboxes. The Worker only queues the run.
 *
 * A dry run stays local: it reads D1 and sends nothing, so there is no need
 * to spend a workflow run on it.
 */
actions.post("/run", async (c) => {
  const body = await c.req.json<{ date?: string; dryRun?: boolean }>();

  if (body.dryRun) {
    try {
      return c.json(await runBirthdays(c.env, { date: body.date, dryRun: true }));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  }

  if (c.req.header("X-Confirm-Send") !== "yes") {
    return c.json({ error: "A real send must be confirmed." }, 400);
  }

  try {
    const inputs: Record<string, string> = {};
    if (body.date) inputs.pretend_date = body.date;
    const { actionsUrl } = await dispatchWorkflow(c.env, inputs);
    return c.json({
      queued: true,
      actionsUrl,
      message:
        "Queued on GitHub Actions. The run takes about a minute; " +
        "recipients are matched against the roster in the repository.",
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
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

  // A preview builds nothing on GitHub - the greeting itself is rendered by
  // the /preview endpoint, and nothing is sent.
  if (body.dryRun) {
    const names = (body.names ?? "").split(",").map((n) => n.trim());
    return c.json({
      date: toIsoDate(todayIn(TIMEZONE)),
      dryRun: true,
      sent: emails.length,
      skipped: 0,
      failed: 0,
      entries: emails.map((email, i) => ({
        name: tidyName(names[i] || email.split("@")[0].replace(/[._]/g, " ")),
        email,
        status: "sent",
        detail: "would send via GitHub Actions",
      })),
    });
  }

  if (c.req.header("X-Confirm-Send") !== "yes") {
    return c.json({ error: "A real send must be confirmed." }, 400);
  }

  try {
    const inputs: Record<string, string> = { wish_email: emails.join(",") };
    if (body.names?.trim()) inputs.wish_name = body.names.trim();
    if (body.note?.trim()) inputs.wish_note = body.note.trim();
    const { actionsUrl } = await dispatchWorkflow(c.env, inputs);
    return c.json({
      queued: true,
      actionsUrl,
      message: `Queued on GitHub Actions for ${emails.length} recipient(s). Delivery takes about a minute.`,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

/** The last few workflow runs, so the dashboard can show what happened. */
actions.get("/runs", async (c) => {
  try {
    return c.json(await recentRuns(c.env));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});

/**
 * Proves the email setup works. For SMTP this actually logs in to the mail
 * server and hangs up, so a wrong app password is caught here rather than at
 * 08:00 tomorrow.
 */
actions.post("/check-email", async (c) => {
  try {
    const provider = makeProvider(c.env);

    if (provider.name === "smtp") {
      await verifySmtpLogin({
        host: c.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(c.env.SMTP_PORT || 465),
        username: c.env.SMTP_USER!,
        password: c.env.SMTP_PASS!,
        domain: c.env.MAIL_DOMAIN || "akhileshnagargoje.in",
      });
      return c.json({
        ok: true,
        provider: provider.name,
        message:
          `Logged in to ${c.env.SMTP_HOST}:${c.env.SMTP_PORT} as ${c.env.SMTP_USER}. ` +
          `Sending as ${c.env.SEND_FROM_NAME} <${c.env.SEND_FROM_EMAIL}>. Nothing was sent.`,
      });
    }

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
