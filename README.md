# Birthday Email System — GCOERC

Emails every student a personalised birthday greeting, automatically, at
midnight on their birthday.

**Nothing needs to be switched on.** The sending runs on GitHub's servers.
Your PC, the dashboard, and everything else can be off.

---

## How it fits together

```
data/students.csv  ──►  GitHub Actions (cron)  ──►  Gmail SMTP  ──►  student
     the roster            the sender                              inbox
          ▲                      │
          │                      └──►  logs/sent_log.csv  (committed back:
          │                             stops anyone being wished twice)
          │
   edited via: the dashboard, github.com, or locally + push
```

Two places run the code, and they do different jobs:

| | Where | Job |
|---|---|---|
| **The sender** | GitHub Actions | The daily job. This is the only thing that sends. |
| **The dashboard** | Render (hosted) or your PC | Manage the roster, preview, trigger sends. Sends nothing itself when hosted — it asks GitHub to. |

That split is deliberate. Mail submitted from rented cloud IPs lands in spam;
mail from GitHub's runners reaches the inbox. Confirmed the hard way — see
*History* at the bottom.

---

## Everyday use

### Add or edit a student

**Easiest:** open the dashboard, edit the row, Save. Hosted, that commits
straight back to the repository.

**Or:** edit `data/students.csv` on github.com — works from a phone.

**Or:** locally, then push:

```bash
cd "D:\email auto" && git add data/students.csv && git commit -m "Update students" && git push
```

Whichever you use, the file in the repository is the single source of truth.

### Send something by hand

Dashboard → **Wish anyone** → address, name, optional message → **Send now**.

Or github.com → Actions → **Birthday wishes** → *Run workflow*, filling
`wish_email`. Same path, no dashboard needed.

### Check it worked

The dashboard's **Activity** panel shows recent runs (with how late each one
started) and every delivery. You also get a summary email after each run.

---

## The schedule

Wishes go out at **midnight IST**, the moment the birthday begins.

```
30 18 * * *   18:30 UTC = 00:00 IST   <- intended
31 19 * * *   19:31 UTC = 01:01 IST   <- retry
32 20 * * *   20:32 UTC = 02:02 IST   <- retry
 7  2 * * *   02:07 UTC = 07:37 IST   <- morning safety net
```

**Why four?** GitHub's free-tier cron is not punctual — measured delays of
1h16m and 2h14m on the same day. Runs queue behind paid customers. So rather
than one hopeful trigger, there are four: whichever fires first does the
sending, and the rest find today's entries already in the sent log and skip.
The duplicate guard turns unbounded lateness into a bounded window.

**Do not** assume a missing email at 00:05 means failure. Check Activity, or
the Actions tab, before concluding anything.

> Midnight IST is 18:30 UTC *the previous day*. The code resolves "today" in
> `Asia/Kolkata` (`config.today()`), never from the runner's clock — otherwise
> the midnight run would look up yesterday's birthdays and quietly wish nobody.

---

## Setup from scratch

### The sender (GitHub Actions)

Two repository secrets, under Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `EMAIL_USER` | the sending Gmail address |
| `EMAIL_PASS` | a Gmail **app password**, not the account password |

App password: the account needs 2-Step Verification on, then
Google Account → Security → App passwords.

Repository *variables* (visible, not secret) carry the rest: `EMAIL_FROM_NAME`,
`REPLY_TO`, `REPORT_EMAIL`, `REPORT_ALWAYS`, `SMTP_HOST`, `SMTP_PORT`,
`POSTER_MODE`, and `TEST_EMAIL`.

**`TEST_EMAIL` is the safety net.** While it holds an address, every greeting
goes there instead of to students. Set it, watch one run, then clear it.

### The dashboard, hosted (Render)

[render.yaml](render.yaml) describes the service. On render.com: **New →
Blueprint** → pick this repository → it prompts for:

| Variable | Value |
|---|---|
| `DASH_USER` | dashboard login name |
| `DASH_PASS` | a real password — this guards student personal data on a public URL |
| `GITHUB_TOKEN` | fine-grained PAT, this repo only, **Contents: RW** and **Actions: RW** |

`FLASK_SECRET` generates itself. Free tier sleeps after 15 idle minutes, so the
first visit of the day takes ~50 seconds to wake.

### The dashboard, locally

```bash
pip install -r requirements.txt
```

Double-click `Dashboard.bat`. No login (it is bound to localhost), reads the
local CSV, and sends via the local CLI.

---

## Command line

```bash
python -m src.main --validate            # check the roster, send nothing
python -m src.main --upcoming 30         # who is next
python -m src.main --dry-run             # full run, no mail leaves
python -m src.main --date 2026-08-14     # pretend it is that day
python -m src.main --check-login         # prove the mail credentials work
python -m src.main --preview "Asha K"    # render the greeting
python -m src.main --wish a@b.com        # one-off, any address, any date
python -m src.main                       # the real thing
```

---

## How it protects itself

- **Never double-sends.** Every success is recorded in `logs/sent_log.csv`,
  which is committed back after each run. A second run the same day skips.
- **29 February** birthdays are wished on the 28th in non-leap years.
- **Day-first dates.** `13/08/2004` is 13 August, not an error.
- **Bad rows are reported, never guessed at** — missing names, invalid
  addresses and unreadable dates are listed rather than silently dropped.
- **One failure does not stop the run**; it is logged and the rest go out.
- **The hosted dashboard is behind a login**, because the roster is student
  personal data. Sessions are signed cookies.
- **Timezone-correct**, as described above.

---

## Layout

```
data/students.csv          the roster - the source of truth
logs/sent_log.csv          delivery history + duplicate protection
.github/workflows/         birthday.yml is the sender
src/main.py                CLI entry point
src/students.py            reading, cleaning, birthday matching
src/message.py             the wording          <- edit for tone
src/mailer.py              SMTP
src/sent_log.py            duplicate protection + history
src/dashboard.py           the web UI (local and hosted)
src/store.py               roster editing
src/gitstore.py            GitHub as the store, workflow dispatch
templates/index.html       the dashboard page
render.yaml                hosted dashboard service
Dashboard.bat              open the dashboard locally
```

`cloudflare/` is **archived, not live** — a React + Workers rewrite that was
built, deployed, and rolled back. Kept for reference only; nothing in it runs.

---

## History, and why it is built this way

Worth reading before changing the architecture — these were expensive lessons.

**Sending moved to GitHub Actions, and should stay there.** The system was
rewritten for Cloudflare Workers (React dashboard, D1, cron). It worked, but
its mail landed in spam for fresh recipients even after the message bytes were
made byte-identical to the Python version's. The difference is the submission
IP: Cloudflare's shared egress carries a reputation Gmail distrusts. GitHub's
runners deliver to the inbox. The whole rewrite was rolled back.

**Spam is mostly about structure and reputation, not wording.** Three real
causes were found and fixed: base64-encoding the whole body (a scanner-evasion
pattern), an invented `Message-ID` on a domain that does not resolve, and a
subject encoded as one opaque base64 blob. Python's `email` library does none
of those, which is why the original never had the problem.

**GitHub cron is late, not broken.** A morning was lost to concluding the
system had failed when it had simply not run yet. Hence the four triggers and
the Activity panel showing the delay.
