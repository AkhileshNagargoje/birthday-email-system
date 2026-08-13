/**
 * The birthday email itself.
 *
 * Drawn entirely in HTML rather than as an attached image: many mail clients
 * block images by default, and a blocked image means the recipient sees an
 * empty grey box instead of a greeting. Table-based with inline styles and a
 * solid background colour under the gradient, because Outlook ignores CSS
 * gradients and most modern layout properties.
 */

import { firstName } from "../../shared/dates";

export interface GreetingInput {
  name: string;
  appName: string;
  note?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function subject(input: GreetingInput): string {
  return `Happy Birthday, ${firstName(input.name)}! \u{1F389}`;
}

export function textBody({ name, appName, note }: GreetingInput): string {
  const body =
    note?.trim() ||
    "Wishing you a wonderful year ahead filled with good health, great friends " +
      "and plenty of success.\n\nHave a fantastic day!";
  return `Happy Birthday, ${firstName(name)}!\n\n${body}\n\n— ${appName}\n`;
}

export function htmlBody({ name, appName, note }: GreetingInput): string {
  const safeName = escapeHtml(name);
  const safeFirst = escapeHtml(firstName(name));
  const safeApp = escapeHtml(appName);

  const paragraphs = note?.trim()
    ? note
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map(
          (line) =>
            `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">${escapeHtml(line)}</p>`,
        )
        .join("")
    : `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">
         Wishing you a wonderful year ahead filled with good health, great
         friends and plenty of success.</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">
         Have a fantastic day!</p>`;

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;
               font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;
                overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             border="0" style="background-color:#3b2a72;">
        <tr>
          <td align="center" style="padding:44px 24px;background-color:#3b2a72;
              background-image:linear-gradient(135deg,#232860 0%,#92347a 100%);">
            <div style="font-size:30px;line-height:1;margin-bottom:16px;">
              &#127881; &#127874; &#127880;
            </div>
            <div style="font-size:17px;letter-spacing:.22em;font-weight:600;
                        color:#ffd166;text-transform:uppercase;">Happy Birthday</div>
            <div style="font-size:38px;line-height:1.2;font-weight:700;
                        color:#ffffff;padding-top:10px;">${safeName}</div>
          </td>
        </tr>
      </table>

      <div style="padding:28px 32px;">
        <h1 style="margin:0 0 12px;font-size:24px;">Happy Birthday, ${safeFirst}! 🎉</h1>
        ${paragraphs}
        <p style="margin:0;font-size:14px;color:#666;">— ${safeApp}</p>
      </div>
    </div>

    <p style="max-width:640px;margin:16px auto 0;font-size:12px;color:#8a8a8a;
              text-align:center;">
      You are receiving this because your birthday is recorded with ${safeApp}.
    </p>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// The run report that goes to the administrator, not to students
// ---------------------------------------------------------------------------

export interface ReportRow {
  name: string;
  email: string;
  status: string;
  detail: string;
}

export function reportSubject(date: string, sent: number, failed: number): string {
  if (failed) return `[Birthday bot] ${date}: ${failed} FAILED, ${sent} sent`;
  if (sent) return `[Birthday bot] ${date}: ${sent} wish(es) sent`;
  return `[Birthday bot] ${date}: no birthdays today`;
}

export function reportHtml(
  date: string,
  rows: ReportRow[],
  rosterSize: number,
  testMode: boolean,
): string {
  const sent = rows.filter((r) => r.status === "sent");
  const failed = rows.filter((r) => r.status === "failed");
  const skipped = rows.filter((r) => r.status === "skipped");

  const banner = failed.length
    ? [`${failed.length} message(s) failed`, "#c0392b"]
    : sent.length
      ? [`${sent.length} birthday wish(es) sent`, "#1e8449"]
      : ["No birthdays today - all good", "#555555"];

  const table = (items: ReportRow[], label: string) =>
    items.length
      ? `<h3 style="margin:22px 0 8px;font-size:15px;">${label}</h3>
         <table style="border-collapse:collapse;width:100%;font-size:14px;">
           ${items
             .map(
               (r) =>
                 `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.name)}</td>
                      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;">${escapeHtml(r.detail || r.email)}</td></tr>`,
             )
             .join("")}
         </table>`
      : "";

  const warning = testMode
    ? `<p style="margin:0 0 12px;padding:10px 14px;background:#fff4e5;
         border-left:4px solid #f0932b;font-size:14px;">
         Test mode is on - these went to the test address, not to students.</p>`
    : "";

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;
               font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:10px;
                padding:24px 28px;box-shadow:0 1px 6px rgba(0,0,0,.08);">
      <p style="margin:0;font-size:13px;color:#888;">${date}</p>
      <h2 style="margin:4px 0 18px;font-size:20px;color:${banner[1]};">${banner[0]}</h2>
      ${warning}
      <p style="margin:0;font-size:14px;color:#666;">${rosterSize} students on the list.</p>
      ${table(sent, "Sent")}
      ${table(failed, "Failed")}
      ${table(skipped, "Skipped (already wished)")}
    </div>
  </body>
</html>`;
}

export function reportText(date: string, rows: ReportRow[], rosterSize: number): string {
  const lines = [`Birthday bot - ${date}`, `${rosterSize} students on the list`, ""];
  for (const r of rows) {
    lines.push(`  ${r.status.toUpperCase().padEnd(8)} ${r.name}  ${r.detail || r.email}`);
  }
  if (!rows.length) lines.push("  No birthdays today.");
  return lines.join("\n") + "\n";
}
