/**
 * The daily job.
 *
 * Shared by the cron trigger and the dashboard's manual buttons, so what you
 * test by hand is exactly what runs at 08:00 - there is no second code path
 * that can drift.
 */

import type { RunResult, SendStatus } from "../../shared/types";
import { toIsoDate, todayIn } from "../../shared/dates";
import { TIMEZONE, type Env } from "../env";
import {
  htmlBody,
  reportHtml,
  reportSubject,
  reportText,
  subject,
  textBody,
  type ReportRow,
} from "../lib/greeting";
import { makeProvider, NoopProvider, type EmailProvider } from "../email/provider";
import { celebrantsOn, countStudents } from "./students";
import { record, sentAlreadyAmong } from "./sendLog";

export interface RunOptions {
  /** Pretend it is this date (YYYY-MM-DD). Defaults to today in IST. */
  date?: string;
  /** Build everything, send nothing. */
  dryRun?: boolean;
  /** Send even to people already wished today. */
  force?: boolean;
  /** Where it came from, for the log. */
  source?: string;
}

function resolveDate(input?: string): Date {
  if (input) {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw new Error(`Date must look like 2026-08-14, got "${input}"`);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  return todayIn(TIMEZONE);
}

export async function runBirthdays(env: Env, options: RunOptions = {}): Promise<RunResult> {
  const date = resolveDate(options.date);
  const occasionDate = toIsoDate(date);
  const dryRun = options.dryRun ?? false;

  const celebrants = await celebrantsOn(env.DB, date);
  const entries: RunResult["entries"] = [];

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // No point building a provider - or failing on a missing API key - when
  // nobody has a birthday.
  let provider: EmailProvider = new NoopProvider();
  if (celebrants.length && !dryRun) provider = makeProvider(env);

  const alreadyDone = options.force
    ? new Set<string>()
    : await sentAlreadyAmong(
        env.DB,
        celebrants.map((s) => s.email),
        occasionDate,
      );

  for (const student of celebrants) {
    if (alreadyDone.has(student.email.toLowerCase())) {
      entries.push({
        name: student.name,
        email: student.email,
        status: "skipped",
        detail: "already wished today",
      });
      skipped++;
      continue;
    }

    // The test address is a safety net for the scheduled run: while it is set,
    // greetings go to the operator instead of to students.
    const recipient = env.TEST_EMAIL?.trim() || student.email;
    const greeting = { name: student.name, appName: env.APP_NAME };

    try {
      if (!dryRun) {
        await provider.send({
          to: recipient,
          subject: subject(greeting),
          html: htmlBody(greeting),
          text: textBody(greeting),
        });
        await record(env.DB, {
          email: student.email,
          name: student.name,
          occasionDate,
          status: "sent",
          detail: recipient,
          source: options.source ?? "daily",
        });
      }
      entries.push({
        name: student.name,
        email: student.email,
        status: "sent",
        detail: dryRun ? "would send" : recipient,
      });
      sent++;
    } catch (err) {
      const detail = (err as Error).message;
      if (!dryRun) {
        await record(env.DB, {
          email: student.email,
          name: student.name,
          occasionDate,
          status: "failed",
          detail,
          source: options.source ?? "daily",
        });
      }
      entries.push({ name: student.name, email: student.email, status: "failed", detail });
      failed++;
    }
  }

  const result: RunResult = { date: occasionDate, dryRun, sent, skipped, failed, entries };

  if (!dryRun) await sendReport(env, result);
  return result;
}

/** Mails the operator a summary. Never throws - a broken report must not make
 *  a successful run look like a failure. */
async function sendReport(env: Env, result: RunResult): Promise<void> {
  const to = env.REPORT_EMAIL?.trim();
  if (!to) return;

  try {
    const rosterSize = await countStudents(env.DB);
    const rows: ReportRow[] = result.entries.map((e) => ({
      name: e.name,
      email: e.email,
      status: e.status,
      detail: e.detail,
    }));

    const provider = makeProvider(env);
    await provider.send({
      to,
      subject: reportSubject(result.date, result.sent, result.failed),
      html: reportHtml(result.date, rows, rosterSize, Boolean(env.TEST_EMAIL?.trim())),
      text: reportText(result.date, rows, rosterSize),
    });
  } catch (err) {
    console.error("Could not send the run report:", (err as Error).message);
  }
}

/** A greeting to an address you name, outside the roster entirely. */
export async function sendOneOff(
  env: Env,
  recipients: Array<{ email: string; name: string }>,
  note: string | undefined,
  dryRun: boolean,
): Promise<RunResult> {
  const occasionDate = toIsoDate(todayIn(TIMEZONE));
  const provider: EmailProvider = dryRun ? new NoopProvider() : makeProvider(env);
  const entries: RunResult["entries"] = [];

  let sent = 0;
  let failed = 0;

  for (const person of recipients) {
    const greeting = { name: person.name, appName: env.APP_NAME, note };
    try {
      // No TEST_EMAIL redirect here: the operator typed this address, so
      // quietly delivering it somewhere else would be the wrong behaviour.
      if (!dryRun) {
        await provider.send({
          to: person.email,
          subject: subject(greeting),
          html: htmlBody(greeting),
          text: textBody(greeting),
        });
        await record(env.DB, {
          email: person.email,
          name: person.name,
          occasionDate,
          status: "sent",
          detail: "one-off wish",
          source: "one-off",
        });
      }
      entries.push({
        name: person.name,
        email: person.email,
        status: "sent" as SendStatus,
        detail: dryRun ? "would send" : person.email,
      });
      sent++;
    } catch (err) {
      const detail = (err as Error).message;
      entries.push({ name: person.name, email: person.email, status: "failed", detail });
      failed++;
    }
  }

  return { date: occasionDate, dryRun, sent, skipped: 0, failed, entries };
}
