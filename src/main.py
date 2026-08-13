"""Entry point. Run daily; it wishes everyone whose birthday is today.

    python -m src.main --validate          check the roster, send nothing
    python -m src.main --dry-run           full run, but no mail leaves
    python -m src.main --date 2026-08-13   pretend it is that day
    python -m src.main --preview "Asha K"  write one poster to out/
    python -m src.main --upcoming 14       who is next
    python -m src.main                     the real thing
"""

import argparse
import smtplib
import sys
import time
import traceback
from datetime import date, datetime, timedelta

from . import config, message, poster, sent_log, students as roster
from .mailer import Mailer

# The Windows console defaults to cp1252, which blows up on a name containing
# any non-Latin-1 character. Never let printing a name kill the run.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="birthday-mailer",
                                description="Send birthday wishes with a personalised poster.")
    p.add_argument("--date", help="Run as if today were this date (YYYY-MM-DD).")
    p.add_argument("--dry-run", action="store_true",
                   help="Do everything except actually send. Posters go to out/.")
    p.add_argument("--validate", action="store_true",
                   help="Check the roster and exit.")
    p.add_argument("--preview", metavar="NAME",
                   help="Render one poster for NAME into out/ and exit.")
    p.add_argument("--upcoming", type=int, metavar="DAYS",
                   help="List birthdays in the next DAYS days and exit.")
    p.add_argument("--wish", metavar="EMAIL",
                   help="Send a birthday wish to this address right now, "
                        "regardless of the student list or today's date. "
                        "Separate several addresses with commas.")
    p.add_argument("--wish-name", metavar="NAME",
                   help="Name to put on that poster (default: from the address). "
                        "With several addresses, give one name each, comma separated.")
    p.add_argument("--wish-note", metavar="TEXT",
                   help="Your own message instead of the standard wording.")
    p.add_argument("--check-login", action="store_true",
                   help="Log in to the mail server and disconnect. Proves the "
                        "address and password work, without sending anything.")
    p.add_argument("--force", action="store_true",
                   help="Send even if the sent log says it already went out.")
    p.add_argument("--save-posters", action="store_true",
                   help="Also keep a copy of each poster in out/.")
    return p.parse_args(argv)


def resolve_today(value):
    if not value:
        return date.today()
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        sys.exit(f"--date must look like 2026-08-13, got {value!r}")


def report_roster(students, bad):
    print(f"Roster: {len(students)} students loaded from {config.SOURCE_PATH.name}")
    if bad:
        print(f"\n{len(bad)} row(s) skipped:")
        for row in bad:
            print(f"  row {row.row_number}: {row.reason}")
        print("\nFix these in the source sheet - those students will never be wished.")
    else:
        print("No problems found.")


def show_upcoming(students, today, days):
    print(f"Birthdays in the next {days} day(s), from {today}:\n")
    found = False
    for offset in range(days + 1):
        day = today + timedelta(days=offset)
        for student in roster.birthdays_on(students, day):
            label = "today" if offset == 0 else f"in {offset} day(s)"
            print(f"  {day}  {label:<12} {student.name} <{student.email}>")
            found = True
    if not found:
        print("  (nobody)")


def check_login():
    """Connects, authenticates, hangs up. Sends nothing, logs nothing."""
    print(f"Connecting to {config.SMTP_HOST}:{config.SMTP_PORT} as "
          f"{config.EMAIL_USER or '(not set)'} ...")
    mailer = Mailer(dry_run=False)
    try:
        mailer.connect()
    except RuntimeError as exc:
        print(f"\n{exc}", file=sys.stderr)
        return 1
    except smtplib.SMTPAuthenticationError as exc:
        print(f"\nLogin REJECTED by the server: {exc}\n"
              f"The address or the app password is wrong. Generate a fresh app "
              f"password and set it again.", file=sys.stderr)
        return 1
    except (smtplib.SMTPException, OSError) as exc:
        print(f"\nCould not reach the server: {exc}", file=sys.stderr)
        return 1
    mailer.close()
    print("Login OK - the account can send mail.")
    return 0


def preview_greeting(name, stem="preview"):
    """Writes what the recipient would see: a PNG in image mode, or the
    whole email as an .html file in banner mode."""
    config.OUT_DIR.mkdir(parents=True, exist_ok=True)

    if config.POSTER_MODE == "image":
        return poster.save_poster(name, config.OUT_DIR / f"{stem}.png")

    student = roster.Student(name=name, email="preview@example.com",
                             dob=date.today())
    path = config.OUT_DIR / f"{stem}.html"
    path.write_text(message.html(student, None), encoding="utf-8")
    return path


def _name_from_address(address):
    return address.split("@")[0].replace(".", " ").replace("_", " ").title()


def send_one_off(args, today):
    """Wishes to addresses you name, outside the roster entirely.

    TEST_EMAIL is deliberately NOT applied here: you typed the recipients, so
    quietly redirecting them somewhere else would be the wrong kind of helpful.
    """
    addresses = [a.strip() for a in args.wish.split(",") if a.strip()]
    if not addresses:
        print("No address given.", file=sys.stderr)
        return 1

    bad = [a for a in addresses if not roster.EMAIL_RE.match(a.lower())]
    if bad:
        print("These do not look like email addresses: " + ", ".join(bad),
              file=sys.stderr)
        return 1

    given_names = [n.strip() for n in (args.wish_name or "").split(",") if n.strip()]
    note = args.wish_note or ""

    people = []
    for i, address in enumerate(addresses):
        if len(given_names) == 1 and len(addresses) == 1:
            name = given_names[0]
        elif i < len(given_names):
            name = given_names[i]
        else:
            name = _name_from_address(address)
        people.append(roster.Student(name=name, email=address, dob=today))

    print(f"One-off wish to {len(people)} recipient(s).")

    mailer = None
    if not args.dry_run:
        try:
            mailer = Mailer(dry_run=False)
            mailer.connect()
        except RuntimeError as exc:
            print(f"\n{exc}", file=sys.stderr)
            return 1
        except (smtplib.SMTPException, OSError) as exc:
            print(f"\nCould not connect to {config.SMTP_HOST}:{config.SMTP_PORT} - {exc}",
                  file=sys.stderr)
            return 1

    failed = 0
    try:
        for person in people:
            try:
                image = poster.make_poster(person.name)
                if image:
                    out = config.OUT_DIR / f"wish-{person.email.split('@')[0]}.png"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(image)

                if args.dry_run:
                    print(f"  would send  {person.name} -> {person.email}")
                    continue

                mailer.server.send_message(
                    mailer.build(person, image, person.email, note))
                print(f"  sent   {person.name} -> {person.email}")
                sent_log.record(person.email, person.name, today, "sent", "one-off wish")

                if config.SEND_DELAY_SECONDS and person is not people[-1]:
                    time.sleep(config.SEND_DELAY_SECONDS)

            except Exception as exc:
                print(f"  FAILED {person.email}: {exc}", file=sys.stderr)
                if not args.dry_run:
                    sent_log.record(person.email, person.name, today, "failed", str(exc))
                failed += 1
    finally:
        if mailer:
            mailer.close()

    if args.dry_run:
        print("  DRY RUN - nothing was sent.")
    return 1 if failed else 0


def run(argv=None):
    args = parse_args(argv)
    today = resolve_today(args.date)

    if args.check_login:
        return check_login()

    if args.wish:
        return send_one_off(args, today)

    if args.preview:
        path = preview_greeting(args.preview)
        print(f"Preview written to {path}")
        return 0

    try:
        students, bad = roster.load_students()
    except Exception as exc:
        print(f"Could not read the roster:\n  {exc}", file=sys.stderr)
        return 1

    if args.validate:
        report_roster(students, bad)
        return 1 if bad else 0

    if args.upcoming is not None:
        show_upcoming(students, today, args.upcoming)
        return 0

    if bad:
        print(f"Warning: {len(bad)} row(s) skipped - run --validate for details.\n")

    celebrants = roster.birthdays_on(students, today)
    print(f"{today}: {len(celebrants)} birthday(s) among {len(students)} students.")

    # Even on a quiet day we may still want to mail you "nothing today" -
    # that is how you know the automation is alive.
    will_report = bool(config.REPORT_EMAIL) and (
        config.REPORT_ALWAYS or celebrants or bad
    )
    if not celebrants and not will_report:
        return 0

    if config.TEST_EMAIL and not args.dry_run:
        print(f"TEST_EMAIL is set - everything goes to {config.TEST_EMAIL}, "
              f"not to students.")
    if args.dry_run:
        print("DRY RUN - nothing will be sent.")

    sent = skipped = failed = 0
    results = []

    try:
        mailer_context = Mailer(dry_run=args.dry_run)
        if not args.dry_run:
            mailer_context.connect()
    except RuntimeError as exc:
        print(f"\n{exc}", file=sys.stderr)
        return 1
    except (smtplib.SMTPException, OSError) as exc:
        print(f"\nCould not connect to {config.SMTP_HOST}:{config.SMTP_PORT} - {exc}\n"
              f"Check EMAIL_USER / EMAIL_PASS, and that the account allows "
              f"App Passwords.", file=sys.stderr)
        return 1

    with mailer_context as mailer:
        for student in celebrants:
            if not args.force and not args.dry_run \
                    and sent_log.already_sent(student.email, today):
                print(f"  skip   {student.name} - already wished today")
                results.append({"status": "skipped", "name": student.name,
                                "detail": "already wished today"})
                skipped += 1
                continue

            try:
                image = poster.make_poster(student.name)
                if image and (args.save_posters or args.dry_run):
                    out = config.OUT_DIR / f"{today}-{student.first_name.lower()}.png"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(image)

                to_address = mailer.send(student, image)

                if args.dry_run:
                    print(f"  would send  {student.name} -> {to_address}")
                else:
                    print(f"  sent   {student.name} -> {to_address}")
                    sent_log.record(student.email, student.name, today, "sent", to_address)
                results.append({"status": "sent", "name": student.name,
                                "detail": to_address})
                sent += 1

            except Exception as exc:
                print(f"  FAILED {student.name}: {exc}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                if not args.dry_run:
                    sent_log.record(student.email, student.name, today, "failed", str(exc))
                results.append({"status": "failed", "name": student.name,
                                "detail": str(exc)})
                failed += 1

            if config.SEND_DELAY_SECONDS and not args.dry_run:
                time.sleep(config.SEND_DELAY_SECONDS)

        if mailer.send_report(today, results, len(students), len(bad)):
            where = "would go" if args.dry_run else "sent"
            print(f"  report {where} to {config.REPORT_EMAIL}")

    print(f"\nDone. sent={sent} skipped={skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())
