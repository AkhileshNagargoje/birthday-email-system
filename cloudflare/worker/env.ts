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
  EMAIL_PROVIDER: "brevo" | "cloudflare";
  SEND_FROM_EMAIL: string;
  SEND_FROM_NAME: string;
  REPORT_EMAIL: string;
  TEST_EMAIL: string;

  // Secrets (wrangler secret put ...)
  DASH_USER?: string;
  DASH_PASS?: string;
  SESSION_SECRET?: string;
  BREVO_API_KEY?: string;
}

/** The timezone the schedule is reasoned about in. */
export const TIMEZONE = "Asia/Kolkata";
