/**
 * One interface, several backends.
 *
 * Cloudflare Email Sending is the natural choice on this platform, but it only
 * sends from a domain you own and have onboarded. Until GCOERC has one, Brevo
 * works from a plain verified Gmail address. Swapping is a single config var,
 * so nothing above this layer knows or cares which is in use.
 */

import type { Env } from "../env";
import { sendMail, SmtpError, type SmtpConfig } from "./smtp";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: OutgoingEmail): Promise<void>;
}

export class EmailError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

/** Brevo transactional API. No domain required - verify a sender address. */
class BrevoProvider implements EmailProvider {
  readonly name = "brevo";

  constructor(
    private apiKey: string,
    private fromEmail: string,
    private fromName: string,
    private replyTo: string,
  ) {}

  async send(message: OutgoingEmail): Promise<void> {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: this.fromEmail, name: this.fromName },
        replyTo: { email: this.replyTo },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 429 and 5xx are worth retrying; a bad address or key is not.
      throw new EmailError(
        `Brevo ${res.status}: ${body.slice(0, 300)}`,
        res.status === 429 || res.status >= 500,
      );
    }
  }
}

/** Cloudflare Email Sending. Requires an onboarded domain. */
class CloudflareProvider implements EmailProvider {
  readonly name = "cloudflare";

  constructor(
    private binding: NonNullable<Env["EMAIL"]>,
    private fromEmail: string,
    private fromName: string,
  ) {}

  async send(message: OutgoingEmail): Promise<void> {
    try {
      await this.binding.send({
        to: message.to,
        from: { email: this.fromEmail, name: this.fromName },
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (err) {
      throw new EmailError(`Cloudflare Email: ${(err as Error).message}`);
    }
  }
}

/**
 * Gmail (or any SMTP server) over raw TCP. The same path the Python version
 * used: your own account, an app password, nothing in between.
 */
class SmtpProvider implements EmailProvider {
  readonly name = "smtp";

  constructor(
    private config: SmtpConfig,
    private fromEmail: string,
    private fromName: string,
    private replyTo: string,
  ) {}

  async send(message: OutgoingEmail): Promise<void> {
    try {
      await sendMail(this.config, {
        fromEmail: this.fromEmail,
        fromName: this.fromName,
        replyTo: this.replyTo,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (err) {
      const smtp = err as SmtpError;
      // 4xx is a temporary server condition; 5xx means do not bother retrying.
      throw new EmailError(smtp.message, smtp.code ? smtp.code < 500 : false);
    }
  }
}

/** Used by dry runs - records what would have gone out. */
export class NoopProvider implements EmailProvider {
  readonly name = "dry-run";
  async send(): Promise<void> {}
}

export function makeProvider(env: Env): EmailProvider {
  const from = env.SEND_FROM_EMAIL;
  const name = env.SEND_FROM_NAME || env.APP_NAME;
  const replyTo = env.REPLY_TO || env.REPORT_EMAIL || from;

  if (env.EMAIL_PROVIDER === "smtp") {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
      throw new EmailError(
        "SMTP_USER and SMTP_PASS are not set. Add them with: " +
          "wrangler secret put SMTP_USER   (and SMTP_PASS)",
      );
    }
    const port = Number(env.SMTP_PORT || 465);
    if (port === 25) {
      throw new EmailError(
        "Cloudflare blocks outbound port 25. Use 465 (recommended) or 587.",
      );
    }
    const config: SmtpConfig = {
      host: env.SMTP_HOST || "smtp.gmail.com",
      port,
      username: env.SMTP_USER,
      password: env.SMTP_PASS,
      // Must be a domain that actually resolves - it goes in the EHLO
      // greeting and the Message-ID, both of which filters check.
      domain: env.MAIL_DOMAIN || "akhileshnagargoje.in",
    };
    return new SmtpProvider(config, from, name, replyTo);
  }

  if (env.EMAIL_PROVIDER === "cloudflare") {
    if (!env.EMAIL) {
      throw new EmailError(
        "EMAIL_PROVIDER is 'cloudflare' but no send_email binding is configured. " +
          "Add \"send_email\": [{ \"name\": \"EMAIL\" }] to wrangler.jsonc and onboard " +
          "the domain with: wrangler email sending enable <domain>",
      );
    }
    return new CloudflareProvider(env.EMAIL, from, name);
  }

  if (!env.BREVO_API_KEY) {
    throw new EmailError(
      "BREVO_API_KEY is not set. Add it with: wrangler secret put BREVO_API_KEY",
    );
  }
  return new BrevoProvider(env.BREVO_API_KEY, from, name, replyTo);
}
