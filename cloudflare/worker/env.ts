/** Bindings, vars and secrets available to the Worker. */

export interface SendEmailBinding {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    html?: string;
    text?: string;
  }): Promise<unknown>;
}

export interface Env {
  // Bindings
  DB: D1Database;
  ASSETS: Fetcher;
  EMAIL?: SendEmailBinding; // only when a domain is onboarded

  // Vars (wrangler.jsonc)
  ENVIRONMENT: string;
  APP_NAME: string;
  EMAIL_PROVIDER: "smtp" | "brevo" | "cloudflare";
  SEND_FROM_EMAIL: string;
  SEND_FROM_NAME: string;
  REPLY_TO: string;
  REPORT_EMAIL: string;
  TEST_EMAIL: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  /** A domain you own, used for EHLO and Message-ID. */
  MAIL_DOMAIN: string;
  /** owner/name of the repo whose workflow does the sending. */
  GITHUB_REPO: string;
  /** Workflow file name inside .github/workflows. */
  GITHUB_WORKFLOW: string;

  // Secrets (wrangler secret put ...)
  DASH_USER?: string;
  DASH_PASS?: string;
  SESSION_SECRET?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  BREVO_API_KEY?: string;
  /** Fine-grained GitHub token, Actions read/write on GITHUB_REPO. */
  GH_PAT?: string;
}

/** The timezone the schedule is reasoned about in. */
export const TIMEZONE = "Asia/Kolkata";
