"""SMTP sending, with the poster embedded inline and attached."""

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

from . import config, message


class Mailer:
    """Opens one SMTP connection and reuses it for the whole run."""

    def __init__(self, dry_run=False):
        self.dry_run = dry_run
        self.server = None

    def __enter__(self):
        # connect() may already have been called by the caller, to surface
        # login failures before any posters are rendered.
        if not self.dry_run and self.server is None:
            self.connect()
        return self

    def __exit__(self, *exc):
        self.close()
        return False

    def connect(self):
        missing = config.missing_mail_settings()
        if missing:
            raise RuntimeError(
                "Cannot send mail - these are not set in .env: "
                + ", ".join(missing)
                + "\n(Use --dry-run to test everything except the actual sending.)"
            )

        context = ssl.create_default_context()
        if config.SMTP_PORT == 465:
            self.server = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT,
                                           context=context, timeout=30)
        else:
            self.server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=30)
            self.server.starttls(context=context)
        self.server.login(config.EMAIL_USER, config.EMAIL_PASS)

    def close(self):
        if self.server is not None:
            try:
                self.server.quit()
            except Exception:
                pass
            self.server = None

    def build(self, student, poster_bytes, to_address, note=""):
        msg = EmailMessage()
        # Date and Message-ID are set explicitly. smtplib never adds them, and
        # whether Gmail's submission service stamps them when missing is
        # undocumented - a message arriving without Date violates RFC 5322 and
        # trips MISSING_DATE/MISSING_MID spam heuristics. Not worth the bet.
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid()
        msg["Subject"] = message.subject(student)
        msg["From"] = formataddr((config.EMAIL_FROM_NAME, config.EMAIL_USER))
        msg["To"] = to_address
        if config.REPLY_TO:
            msg["Reply-To"] = config.REPLY_TO
        # Only BCC real sends - no point copying yourself on your own test mail.
        if config.BCC_EMAIL and not config.TEST_EMAIL:
            msg["Bcc"] = config.BCC_EMAIL

        msg.set_content(message.plain_text(student, note))

        if poster_bytes is None:
            # HTML banner mode - the greeting is drawn in the markup itself,
            # so there is no image to embed.
            msg.add_alternative(message.html(student, None, note), subtype="html")
            return msg

        image_cid = make_msgid(domain="birthday.local")
        bare_cid = image_cid[1:-1]  # strip the <angle brackets> for the HTML src

        msg.add_alternative(message.html(student, bare_cid, note), subtype="html")

        # Attach to the HTML part so the image renders inline, not as a stray file.
        html_part = msg.get_payload()[1]
        html_part.add_related(
            poster_bytes,
            maintype="image",
            subtype="png",
            cid=image_cid,
            filename=f"happy-birthday-{student.first_name.lower()}.png",
        )
        return msg

    def send(self, student, poster_bytes):
        """Returns the address actually used (may be TEST_EMAIL)."""
        to_address = config.TEST_EMAIL or student.email
        msg = self.build(student, poster_bytes, to_address)

        if self.dry_run:
            return to_address

        if self.server is None:
            self.connect()
        self.server.send_message(msg)
        return to_address

    def send_report(self, run_date, results, roster_size, bad_rows):
        """Emails you a summary of the run. Never raises - a broken report
        must not make a successful send look like a failure."""
        if not config.REPORT_EMAIL:
            return False

        sent = sum(1 for r in results if r["status"] == "sent")
        failed = sum(1 for r in results if r["status"] == "failed")

        if not config.REPORT_ALWAYS and not sent and not failed and not bad_rows:
            return False

        try:
            msg = EmailMessage()
            msg["Subject"] = message.report_subject(run_date, sent, failed)
            msg["From"] = formataddr((config.EMAIL_FROM_NAME, config.EMAIL_USER))
            msg["To"] = config.REPORT_EMAIL
            msg.set_content(message.report_text(run_date, results, roster_size))
            msg.add_alternative(
                message.report_html(run_date, results, roster_size, bad_rows,
                                    bool(config.TEST_EMAIL)),
                subtype="html",
            )

            if self.dry_run:
                return True
            if self.server is None:
                self.connect()
            self.server.send_message(msg)
            return True
        except Exception as exc:
            print(f"  (could not send the report email: {exc})")
            return False
