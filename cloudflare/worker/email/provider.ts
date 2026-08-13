/**
 * One interface, several backends.
 *
 * Cloudflare Email Sending is the natural choice on this platform, but it only
 * sends from a domain you own and have onboarded. Until GCOERC has one, Brevo
 * works from a plain verified Gmail address. Swapping is a single config var,
 * so nothing above this layer knows or cares which is in use.
 */

import type { Env } from "../env";

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

/** Used by dry runs - records what would have gone out. */
export class NoopProvider implements EmailProvider {
  readonly name = "dry-run";
  async send(): Promise<void> {}
}

export function makeProvider(env: Env): EmailProvider {
  const from = env.SEND_FROM_EMAIL;
  const name = env.SEND_FROM_NAME || env.APP_NAME;

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
  return new BrevoProvider(env.BREVO_API_KEY, from, name, env.REPORT_EMAIL || from);
}
