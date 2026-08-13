/**
 * Delivery history, and the duplicate protection built on it.
 *
 * Cron triggers are at-least-once: Cloudflare may run the same schedule twice.
 * A unique index on (email, occasion_date) for successful rows means a second
 * run finds the entry and skips, rather than sending a second greeting.
 */

import type { SendLogEntry, SendStatus } from "../../shared/types";

export async function alreadySent(
  db: D1Database,
  email: string,
  occasionDate: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM send_log
        WHERE email = ? AND occasion_date = ? AND status = 'sent' LIMIT 1`,
    )
    .bind(email.toLowerCase(), occasionDate)
    .first();
  return row !== null;
}

/** Which of these addresses were already wished today. One query, not N. */
export async function sentAlreadyAmong(
  db: D1Database,
  emails: string[],
  occasionDate: string,
): Promise<Set<string>> {
  if (!emails.length) return new Set();
  const placeholders = emails.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT email FROM send_log
        WHERE occasion_date = ? AND status = 'sent'
          AND email IN (${placeholders})`,
    )
    .bind(occasionDate, ...emails.map((e) => e.toLowerCase()))
    .all<{ email: string }>();
  return new Set((results ?? []).map((r) => r.email));
}

export async function record(
  db: D1Database,
  entry: {
    email: string;
    name: string;
    occasionDate: string;
    status: SendStatus;
    detail?: string;
    source?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO send_log (email, name, occasion_date, status, detail, source)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .bind(
      entry.email.toLowerCase(),
      entry.name,
      entry.occasionDate,
      entry.status,
      entry.detail ?? null,
      entry.source ?? "daily",
    )
    .run();
}

export async function recentHistory(db: D1Database, limit = 100): Promise<SendLogEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT id, email, name, occasion_date, status, detail, source, sent_at
         FROM send_log ORDER BY sent_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: number;
      email: string;
      name: string;
      occasion_date: string;
      status: SendStatus;
      detail: string | null;
      source: string;
      sent_at: string;
    }>();

  return (results ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    occasionDate: r.occasion_date,
    status: r.status,
    detail: r.detail,
    source: r.source,
    sentAt: r.sent_at,
  }));
}

export async function lastRun(
  db: D1Database,
): Promise<{ when: string; count: number } | null> {
  const row = await db
    .prepare(
      `SELECT sent_at, occasion_date FROM send_log
        WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 1`,
    )
    .first<{ sent_at: string; occasion_date: string }>();
  if (!row) return null;

  const tally = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM send_log
        WHERE status = 'sent' AND occasion_date = ?`,
    )
    .bind(row.occasion_date)
    .first<{ n: number }>();

  return { when: row.sent_at, count: tally?.n ?? 0 };
}
