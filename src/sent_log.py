"""Remembers who has already been wished, so a re-run never double-sends."""

import csv
from datetime import datetime

from . import config

FIELDS = ["sent_at", "birthday_date", "email", "name", "status", "detail"]


def _ensure_file():
    config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    if not config.SENT_LOG.exists():
        with open(config.SENT_LOG, "w", newline="", encoding="utf-8") as fh:
            csv.DictWriter(fh, fieldnames=FIELDS).writeheader()


def history(limit=40):
    """Recent deliveries, newest first, for the dashboard."""
    if not config.SENT_LOG.exists():
        return []

    with open(config.SENT_LOG, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))

    out = []
    for row in reversed(rows[-limit:]):
        stamp = (row.get("sent_at") or "").replace("T", " ")
        out.append({
            "when": stamp[:16],          # to the minute; seconds are noise here
            "day": stamp[:10],
            "name": row.get("name", ""),
            "email": row.get("email", ""),
            "status": row.get("status", ""),
            "detail": row.get("detail", ""),
            "source": row.get("source", "daily"),
        })
    return out


def summary():
    """Counts for the dashboard's headline numbers."""
    rows = history(limit=100000)
    sent = [r for r in rows if r["status"] == "sent"]
    return {
        "total_sent": len(sent),
        "failed": sum(1 for r in rows if r["status"] == "failed"),
        "last_day": sent[0]["day"] if sent else None,
        "last_day_count": sum(1 for r in sent if sent and r["day"] == sent[0]["day"]),
    }


def already_sent(email, birthday_date):
    """True if this address was successfully wished for this exact date."""
    if not config.SENT_LOG.exists():
        return False
    key = (email.lower(), birthday_date.isoformat())
    with open(config.SENT_LOG, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row.get("status") != "sent":
                continue
            if (row.get("email", "").lower(), row.get("birthday_date")) == key:
                return True
    return False


def record(email, name, birthday_date, status, detail=""):
    _ensure_file()
    with open(config.SENT_LOG, "a", newline="", encoding="utf-8") as fh:
        csv.DictWriter(fh, fieldnames=FIELDS).writerow({
            "sent_at": datetime.now().isoformat(timespec="seconds"),
            "birthday_date": birthday_date.isoformat(),
            "email": email,
            "name": name,
            "status": status,
            "detail": detail,
        })
