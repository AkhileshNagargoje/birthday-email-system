/**
 * Worker entry point.
 *
 * Two jobs: serve the API behind a login (the React build is served straight
 * from static assets), and run the birthday job every morning on the cron
 * trigger.
 */

import { Hono } from "hono";
import type { Env } from "./env";
import { requireAuth } from "./lib/auth";
import authRoutes from "./routes/auth";
import studentRoutes from "./routes/students";
import actionRoutes from "./routes/actions";
import { runBirthdays } from "./services/birthdayRun";

const app = new Hono<{ Bindings: Env }>();

// Login endpoints are open; everything else under /api requires a session.
app.route("/api/auth", authRoutes);
app.use("/api/*", requireAuth);
app.route("/api/students", studentRoutes);
app.route("/api", actionRoutes);

app.notFound((c) =>
  c.req.path.startsWith("/api/")
    ? c.json({ error: "No such endpoint." }, 404)
    : c.env.ASSETS.fetch(c.req.raw),
);

app.onError((err, c) => {
  console.error("Unhandled:", err);
  return c.json({ error: "Something went wrong on the server." }, 500);
});

export default {
  fetch: app.fetch,

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Cron delivery is at-least-once, so this can fire twice for the same
    // schedule. The send log makes a repeat harmless: the second pass finds
    // today's entries and skips them rather than sending again.
    ctx.waitUntil(
      runBirthdays(env, { source: "daily" })
        .then((result) => {
          console.log(
            `Birthday run ${result.date}: sent=${result.sent} ` +
              `skipped=${result.skipped} failed=${result.failed}`,
          );
        })
        .catch((err) => {
          // Logged rather than thrown so it shows in Workers Logs with context.
          console.error("Birthday run failed:", err instanceof Error ? err.stack : err);
        }),
    );
  },
};
