/**
 * A minimal SMTP client over Cloudflare's TCP sockets.
 *
 * Workers have no Node net/tls, so nodemailer cannot run here - but raw TCP is
 * available, and Cloudflare permits outbound 465 and 587 (only port 25 is
 * blocked). That is enough to speak SMTP to Gmail directly, which keeps the
 * same sending path the Python version used: your own account, an app
 * password, no third-party service in the middle.
 *
 * Port 465 is preferred: TLS from the first byte, so there is no STARTTLS
 * upgrade to get wrong. 587 is supported via startTls().
 */

import { connect } from "cloudflare:sockets";

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  /**
   * A real domain you control, used for the EHLO greeting and the Message-ID.
   * Both are checked by spam filters: a hostname that does not resolve reads
   * as a forgery, which is exactly how mail ends up in the spam folder.
   */
  domain: string;
}

export interface SmtpMessage {
  fromEmail: string;
  fromName: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export class SmtpError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "SmtpError";
  }
}

const CRLF = "\r\n";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Wraps the socket so the conversation reads as send/expect pairs. */
class SmtpSession {
  private buffer = "";

  constructor(
    private reader: ReadableStreamDefaultReader<Uint8Array>,
    private writer: WritableStreamDefaultWriter<Uint8Array>,
  ) {}

  async write(line: string): Promise<void> {
    await this.writer.write(encoder.encode(line + CRLF));
  }

  async writeRaw(data: string): Promise<void> {
    await this.writer.write(encoder.encode(data));
  }

  /**
   * Reads one complete reply. SMTP replies may span several lines, with
   * continuation lines marked `250-` and the last marked `250 `.
   */
  async read(timeoutMs = 15000): Promise<{ code: number; text: string }> {
    const deadline = Date.now() + timeoutMs;

    while (!this.isComplete()) {
      if (Date.now() > deadline) throw new SmtpError("The mail server stopped responding.");
      const { value, done } = await this.reader.read();
      if (done) throw new SmtpError("The mail server closed the connection unexpectedly.");
      this.buffer += decoder.decode(value, { stream: true });
    }

    const lines = this.buffer.split(CRLF).filter(Boolean);
    this.buffer = "";
    const last = lines[lines.length - 1];
    return { code: Number(last.slice(0, 3)), text: lines.join(" | ") };
  }

  private isComplete(): boolean {
    const lines = this.buffer.split(CRLF).filter(Boolean);
    if (!lines.length) return false;
    // A final line has a space after the code; continuations have a hyphen.
    return /^\d{3} /.test(lines[lines.length - 1]);
  }

  /** Sends a command and fails loudly unless the reply code is expected. */
  async expect(command: string | null, codes: number[], what: string) {
    if (command !== null) await this.write(command);
    const reply = await this.read();
    if (!codes.includes(reply.code)) {
      throw new SmtpError(`${what} failed: ${reply.text}`, reply.code);
    }
    return reply;
  }
}

function base64(input: string): string {
  const bytes = encoder.encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * RFC 2047, the way Python's email library does it: encode only the words
 * that need it, so "Happy Birthday, Asha! 🎉" stays readable except for the
 * emoji. Encoding the whole header into one opaque blob is a spam pattern -
 * filters distrust subjects they cannot read.
 */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(value)) return value;

  return value
    .split(" ")
    .map((word) => {
      // eslint-disable-next-line no-control-regex
      if (/^[\x21-\x7E]*$/.test(word)) return word;
      const q = Array.from(encoder.encode(word))
        .map((b) =>
          (b >= 0x21 && b <= 0x7e && b !== 0x3d && b !== 0x3f && b !== 0x5f)
            ? String.fromCharCode(b)
            : "=" + b.toString(16).toUpperCase().padStart(2, "0"),
        )
        .join("");
      return `=?utf-8?q?${q}?=`;
    })
    .join(" ");
}

/**
 * Quoted-printable, as Python's email library produces.
 *
 * This matters more than it looks. Base64-encoding an entire text body is
 * unusual for legitimate mail and common in spam, because it hides the content
 * from simple scanners. Quoted-printable leaves ordinary English readable in
 * the raw source, which is what filters expect to see.
 */
function quotedPrintable(input: string): string {
  const bytes = encoder.encode(input.replace(/\r\n/g, "\n"));
  const lines: string[] = [];
  let line = "";

  const flush = (soft: boolean) => {
    lines.push(soft ? line + "=" : line);
    line = "";
  };

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];

    if (byte === 0x0a) {
      // A hard line break. Trailing whitespace must be encoded or it is lost.
      if (line.endsWith(" ")) line = line.slice(0, -1) + "=20";
      else if (line.endsWith("\t")) line = line.slice(0, -1) + "=09";
      flush(false);
      continue;
    }

    const printable =
      (byte >= 0x21 && byte <= 0x7e && byte !== 0x3d) || byte === 0x20 || byte === 0x09;
    const chunk = printable
      ? String.fromCharCode(byte)
      : "=" + byte.toString(16).toUpperCase().padStart(2, "0");

    // 76 including the trailing soft-break "=".
    if (line.length + chunk.length > 75) flush(true);
    line += chunk;
  }
  if (line) flush(false);

  // SMTP eats a leading "." on any line, so double it (RFC 5321 dot-stuffing).
  return lines.map((l) => (l.startsWith(".") ? "." + l : l)).join(CRLF);
}

function buildMime(message: SmtpMessage, boundary: string): string {
  // Deliberately NO Message-ID and NO Date header. Python's email library set
  // neither, which let Gmail stamp its own on the way out - and Gmail-issued
  // values are trusted in a way ones we invent never will be. Header order
  // matches Python's flattening too, to keep the diff at zero.
  const headers = [
    `Subject: ${encodeHeader(message.subject)}`,
    `From: ${encodeHeader(message.fromName)} <${message.fromEmail}>`,
    `To: ${message.to}`,
    message.replyTo ? `Reply-To: ${message.replyTo}` : null,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  const part = (contentType: string, body: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${contentType}; charset="utf-8"`,
      "Content-Transfer-Encoding: quoted-printable",
      "",
      quotedPrintable(body),
      "",
    ].join(CRLF);

  return [
    headers.join(CRLF),
    "",
    part("text/plain", message.text),
    part("text/html", message.html),
    `--${boundary}--`,
    "",
  ].join(CRLF);
}

/**
 * Connects, authenticates, hangs up. Sends nothing.
 *
 * Worth having as its own operation: a wrong app password should be findable
 * on demand, not discovered by an empty inbox the next morning.
 */
export async function verifySmtpLogin(config: SmtpConfig): Promise<void> {
  await withSession(config, async (session) => {
    await session.expect("AUTH LOGIN", [334], "AUTH LOGIN");
    await session.expect(base64(config.username), [334], "Username");
    try {
      await session.expect(base64(config.password), [235], "Password");
    } catch (err) {
      throw new SmtpError(
        `The mail server rejected the login. Gmail needs an app password, not ` +
          `the account password. (${(err as Error).message})`,
      );
    }
    try {
      await session.expect("QUIT", [221], "QUIT");
    } catch {
      /* ignore */
    }
  });
}

/**
 * Opens the connection, greets, upgrades to TLS if needed, and guarantees the
 * socket is closed afterwards. Both sendMail and verifySmtpLogin start here so
 * the handshake exists in exactly one place.
 */
async function withSession<T>(
  config: SmtpConfig,
  work: (session: SmtpSession) => Promise<T>,
): Promise<T> {
  const implicitTls = config.port === 465;

  let socket = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: implicitTls ? "on" : "starttls", allowHalfOpen: false },
  );

  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  let session = new SmtpSession(reader, writer);

  try {
    await session.expect(null, [220], "Connecting");
    await session.expect(`EHLO ${config.domain}`, [250], "EHLO");

    if (!implicitTls) {
      await session.expect("STARTTLS", [220], "STARTTLS");
      reader.releaseLock();
      writer.releaseLock();
      socket = socket.startTls();
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
      session = new SmtpSession(reader, writer);
      // The server forgets everything after the upgrade, so greet again.
      await session.expect(`EHLO ${config.domain}`, [250], "EHLO after STARTTLS");
    }

    return await work(session);
  } finally {
    try {
      await socket.close();
    } catch {
      /* the server may have hung up first */
    }
  }
}

export async function sendMail(config: SmtpConfig, message: SmtpMessage): Promise<void> {
  await withSession(config, async (session) => {
    await session.expect("AUTH LOGIN", [334], "AUTH LOGIN");
    await session.expect(base64(config.username), [334], "Username");
    try {
      await session.expect(base64(config.password), [235], "Password");
    } catch (err) {
      // The most common real-world failure, and the least obvious message.
      throw new SmtpError(
        `The mail server rejected the login. Check SMTP_USER and SMTP_PASS - ` +
          `Gmail needs an app password, not the account password. (${(err as Error).message})`,
      );
    }

    await session.expect(`MAIL FROM:<${message.fromEmail}>`, [250], "MAIL FROM");
    await session.expect(`RCPT TO:<${message.to}>`, [250, 251], "RCPT TO");
    await session.expect("DATA", [354], "DATA");

    const boundary = `===============${crypto.randomUUID().replace(/-/g, "")}==`;
    await session.writeRaw(buildMime(message, boundary) + CRLF + "." + CRLF);
    await session.expect(null, [250], "Message body");

    // Best effort - the message is already accepted by this point.
    try {
      await session.expect("QUIT", [221], "QUIT");
    } catch {
      /* ignore */
    }
  });
}
