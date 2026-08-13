# Birthday Email System

Runs once a day, finds every student whose birthday is today, generates a
personalised poster with their name on it, and emails it to them.

---

## Easiest way: double-click `Dashboard.bat`

Opens a dashboard in your browser. Everything is there:

- **Status** — how many students, whose birthday is today, how many rows have
  bad data, when it last sent
- **Coming up** — the next birthdays
- **Add a student** — name, email, a date picker
- **Students** — the whole list, editable in place, with a Save and Delete on
  each row. Bad rows are flagged in red.
- **Settings** — sending address, app password, test address, daily report
- **Actions** — check the list, test run, preview a poster, send today's wishes

The **Send today's wishes** button makes you type `SEND` first, and refuses
entirely until the sending account is configured.

Keep the black window open while you use it; closing it stops the dashboard.
Nothing is exposed to the internet — it runs on your machine only.

---

## Or the text menu: `Start.bat`

No commands to remember either. It opens a menu:

```
  SETUP
    1  Edit the student list
    2  Edit settings (email account)
    3  Check the student list for mistakes

  TRY IT OUT  (nothing is sent)
    4  Preview a poster
    5  Test run - today
    6  Test run - pick a date
    7  Show upcoming birthdays

  FOR REAL
    8  Send today's wishes now
    9  Turn ON automatic daily sending
   10  Turn OFF automatic daily sending
   11  See what was sent recently
```

Option 9 registers the daily task for you, so after that it runs by itself and
you never open this again.

The rest of this file documents the command-line equivalents.

---

## Setup

### 1. Install dependencies

```bash
python -m pip install -r requirements.txt
```

### 2. Create your config

Copy `.env.example` to `.env` and fill it in. **Never commit `.env`** — it holds
your mail password. It is already in `.gitignore`.

### 3. Add the students

Copy `data/students.example.csv` to `data/students.csv` and replace the rows,
or export your Google Form responses as CSV and point `SOURCE_PATH` at it.

Column headers are matched loosely, so all of these work:

| what it needs | headers it recognises |
|---|---|
| name | `Full Name`, `Student Name`, `Your Name`, `Name` |
| email | `Email Address`, `Email`, `E-mail`, `Mail ID` |
| birthday | `Date of Birth`, `DOB`, `Birthday`, `Birth Date` |

Dates are parsed from many formats (`13/08/2004`, `2004-08-13`,
`13 August 2004`, …), day-first by default. Anything unreadable is reported,
never guessed at.

### 4. Make the poster template

```bash
python tools/make_template.py
```

That writes a plain gradient template to `assets/template.png`. Replace it with
a real design (Canva, 1200×800 or larger) whenever you have one — just keep the
middle band clear, since that's where the name is drawn. To move the name, edit
`NAME_BOX` in [src/poster.py](src/poster.py). Drop a `.ttf` at `assets/font.ttf`
to control the typeface; otherwise a system font is used.

---

## Using it

```bash
python -m src.main --validate            # check the roster, send nothing
python -m src.main --preview "Asha K"    # render one poster to out/
python -m src.main --upcoming 30         # who has a birthday soon
python -m src.main --dry-run             # full run, no mail leaves
python -m src.main --date 2026-08-13     # pretend it is that day
python -m src.main                       # the real thing
```

Extra flags: `--save-posters` keeps a copy of each poster, `--force` re-sends
even if the log says it already went out.

**Recommended first real test:** set `TEST_EMAIL=` in `.env` to your own
address. Every wish then goes to you instead of to students, so you can see
exactly what they'd receive. Clear it when you're happy.

---

## Scheduling it

`run_daily.bat` is ready for **Windows Task Scheduler**:

1. Task Scheduler → *Create Basic Task* → name it, trigger **Daily**, e.g. 08:00
2. Action: *Start a program* → browse to `run_daily.bat`
3. Tick **Run whether user is logged on or not**, and under Conditions untick
   *Start only if on AC power*

Output goes to `logs/run.log`. The PC must be on at that time — if that's a
problem, run it on a small VPS or via a GitHub Actions cron instead.

---

## How it protects itself

- **Never double-sends.** Every success is written to `logs/sent_log.csv`, and a
  re-run on the same day skips anyone already wished.
- **Bad data can't send bad mail.** Missing names, invalid emails and unparseable
  dates are skipped and reported, not guessed.
- **Feb 29 birthdays** are wished on Feb 28 in non-leap years, so they aren't
  skipped for three years at a time.
- **Duplicate form submissions** are collapsed by email, keeping the latest one.
- **One failure doesn't stop the run** — it's logged and the rest still go out.
- **Rate limiting** via `SEND_DELAY_SECONDS` so the provider doesn't throttle you.

---

## Reading from the Google Sheet directly

Instead of exporting a CSV each time, the script can read the form responses
live:

1. `pip install gspread google-auth`
2. Google Cloud Console → new project → enable the **Google Sheets API**
3. Create a **Service Account**, make a JSON key, save it as `credentials.json`
4. **Share the responses Sheet with the service account's email address**
   (`...@....iam.gserviceaccount.com`) as Viewer — whoever owns the form can do
   this themselves
5. In `.env`: `SOURCE_TYPE=gsheet` and `GSHEET_ID=` (the long id in the sheet URL)

---

## Switching to the college address

Change `EMAIL_USER` and `EMAIL_PASS` in `.env`. Nothing else moves.

Before relying on it, check with college IT:

- **Are App Passwords enabled?** Many Google Workspace admins disable them
  org-wide, in which case SMTP-with-a-password won't authenticate and you'd need
  OAuth2 + the Gmail API instead.
- **Microsoft 365?** Basic SMTP auth is off by default on most tenants — either
  have them enable SMTP AUTH for that one mailbox, or use Microsoft Graph.
- Ask for a **dedicated mailbox** (`birthday@college.edu`) rather than a personal
  account, so it survives you graduating.

---

## A note on the data

`students.csv` holds names, emails and dates of birth of real students. Keep it
out of public repos (it's gitignored), don't forward it around, and get the
college's sign-off before loading real records or sending from a college domain.

---

## Layout

```
Dashboard.bat            opens the browser dashboard   <- start here
Start.bat                text menu alternative
.env                     your settings (gitignored)
data/students.csv        the roster (gitignored)
assets/template.png      poster background
assets/font.ttf          optional custom font
src/config.py            settings loader
src/students.py          reading, cleaning, birthday matching
src/poster.py            draws the name on the template
src/message.py           the email wording  <- edit this for tone
src/mailer.py            SMTP sending
src/sent_log.py          duplicate protection
src/main.py              CLI entry point
src/dashboard.py         the browser dashboard
src/store.py             reading/writing students and settings
templates/index.html     the dashboard page
tools/make_template.py   generates a starter template
run_daily.bat            for Windows Task Scheduler
logs/sent_log.csv        who was wished, when
out/                     rendered posters
```
