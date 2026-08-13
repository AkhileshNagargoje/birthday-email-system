"""Loads settings from .env (with sane defaults) so nothing is hardcoded."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

load_dotenv(ROOT / ".env")


def _get(key, default=""):
    value = os.getenv(key, default)
    return value.strip() if isinstance(value, str) else value


def _path(key, default):
    raw = _get(key, default)
    p = Path(raw)
    return p if p.is_absolute() else ROOT / p


# ---- Sender ----------------------------------------------------------------
EMAIL_USER = _get("EMAIL_USER")
EMAIL_PASS = _get("EMAIL_PASS")
EMAIL_FROM_NAME = _get("EMAIL_FROM_NAME", "Your College")
REPLY_TO = _get("REPLY_TO") or EMAIL_USER

SMTP_HOST = _get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(_get("SMTP_PORT", "587") or 587)

# ---- Safety ----------------------------------------------------------------
TEST_EMAIL = _get("TEST_EMAIL")
SEND_DELAY_SECONDS = float(_get("SEND_DELAY_SECONDS", "2") or 0)

# ---- Reporting -------------------------------------------------------------
REPORT_EMAIL = _get("REPORT_EMAIL")
REPORT_ALWAYS = _get("REPORT_ALWAYS", "yes").lower() in ("yes", "true", "1", "y")
BCC_EMAIL = _get("BCC_EMAIL")

# ---- Student data ----------------------------------------------------------
SOURCE_TYPE = _get("SOURCE_TYPE", "csv").lower()
SOURCE_PATH = _path("SOURCE_PATH", "data/students.csv")

GSHEET_ID = _get("GSHEET_ID")
GSHEET_WORKSHEET = _get("GSHEET_WORKSHEET", "Form Responses 1")
GOOGLE_CREDENTIALS_FILE = _path("GOOGLE_CREDENTIALS_FILE", "credentials.json")

# ---- Poster ----------------------------------------------------------------
# "html"  = draw the banner with HTML in the email itself. No image, no
#           template to design, and it still shows when a mail client blocks
#           images (which many do by default).
# "image" = generate a PNG poster from assets/template.png and embed it.
POSTER_MODE = _get("POSTER_MODE", "html").lower()
POSTER_TEMPLATE = _path("POSTER_TEMPLATE", "assets/template.png")
POSTER_FONT = _path("POSTER_FONT", "assets/font.ttf")

# ---- Paths -----------------------------------------------------------------
LOG_DIR = ROOT / "logs"
SENT_LOG = LOG_DIR / "sent_log.csv"
OUT_DIR = ROOT / "out"


def missing_mail_settings():
    """Returns a list of settings needed to actually send mail but not set."""
    missing = []
    if not EMAIL_USER or EMAIL_USER == "you@example.com":
        missing.append("EMAIL_USER")
    if not EMAIL_PASS or EMAIL_PASS.startswith("xxxx"):
        missing.append("EMAIL_PASS")
    return missing
