# Birthday emails from inside Google — setup

This runs the sender **on Google's own servers**, as your Gmail account, using
Google's official automation tool. No app password, no SMTP, no GitHub, no
server. Your PC can be off.

**Why it exists:** the previous setup submitted mail through `smtp.gmail.com`
from GitHub's datacenter machines using an app password. That combination —
a new account, automated sending, rotating cloud IPs — is the fingerprint of a
compromised account, and Gmail treated it accordingly. This path removes the
whole submission problem: there is nothing to submit, because the code runs
inside Google.

It is also the version you hand to the college later. Paste the same file into
a `@gcoerc` account and it becomes the production system — no migration.

---

## What you need

- The Google account that will send (for now `hymanper@gmail.com`; later the
  college address)
- A Google Sheet with the roster — **your friend's Form responses sheet works
  directly**

---

## 1. Open the roster sheet

If your friend's Form already writes to a sheet, open that. Otherwise make a
sheet with these headings in row 1:

| Full Name | Email Address | Date of Birth |
|---|---|---|
| Asha Kulkarni | asha@example.com | 13/08/2004 |

Headings are matched loosely — `Name`, `Student Name`, `Email`, `Mail ID`,
`DOB`, `Birthday` and similar all work, in any order, alongside columns the
script ignores (like `Timestamp`).

> The script adds one column of its own, **Last Wished**, and writes the date
> it last wished each person there. That is what stops a second run of the
> same day sending twice. Leave it alone.

## 2. Open the script editor

In the sheet: **Extensions → Apps Script**.

A tab opens with an empty `Code.gs`.

## 3. Paste the code

1. Select everything in the editor and delete it.
2. Paste the whole contents of `apps_script/Code.gs`.
3. Click the **save** icon (or Ctrl+S).

## 4. Set your details

At the top of the file, edit `CONFIG`:

```js
FROM_NAME:    'GCOERC',                  // the name recipients see
REPORT_EMAIL: 'you@gmail.com',           // where the daily summary goes
REPLY_TO:     'you@gmail.com',           // where replies land
TEST_EMAIL:   'you@gmail.com',           // SAFETY NET — see below
```

**`TEST_EMAIL` is the safety net.** While it holds an address, every greeting
goes *there* instead of to students. Leave it set until you have watched a
real run, then clear it (`TEST_EMAIL: ''`) to go live.

Save again.

## 5. Check the roster — sends nothing

In the toolbar, choose **`validateRoster`** from the function dropdown and
click **Run**.

**The first run asks for permission.** This is normal and it is your own
script:

1. *Review permissions* → choose your account
2. You will see **“Google hasn’t verified this app”** — this appears for every
   personal script; it means *nobody has submitted it for review*, not that
   anything is wrong. Click **Advanced** → **Go to (project name) (unsafe)**.
3. **Allow**

Then open **Execution log** (bottom of the editor). You should see how many
students were read, any rows with bad data, and who has a birthday today.

Fix anything it reports — those people would otherwise never be wished.

## 6. Send yourself a test

Choose **`sendTestToMyself`** → **Run**. Check your inbox.

To test any other address, choose `sendTestTo`, then in the editor's console
run: `sendTestTo('someone@example.com', 'Their Name')`.

## 7. Turn on the daily schedule

Choose **`installTrigger`** → **Run**.

It creates one daily trigger for `dailySend` around **00:15 IST** and removes
any it made before. Confirm it exists via the **clock icon** (Triggers) in the
left sidebar.

That is it. It now runs every night whether or not anything of yours is on.

To stop it later: run **`removeTrigger`**.

## 8. Go live

Once a run has landed correctly, set `TEST_EMAIL: ''` and save. Real students
now receive their own greetings.

---

## Checking it afterwards

- **The report email** — a summary after every run, including days with no
  birthdays, so silence means something is wrong rather than nothing happened.
- **Executions** (left sidebar) — every run, with its log.
- **The sheet** — the `Last Wished` column shows who has been wished and when.

---

## Things worth knowing

**Sending limits.** A personal `@gmail.com` account can send to roughly
**100 recipients a day** through Apps Script. A Google Workspace account
(the college one) gets **1,500**. For a few birthdays a day this is irrelevant
— it only matters if you ever mass-send.

**Timing.** Apps Script schedules within the chosen hour rather than to the
minute, so expect the mail somewhere in the midnight hour. Far more punctual
than the free GitHub cron this replaces, which drifted 1–2 hours.

**Timezone.** The script decides "today" in `Asia/Kolkata`, not in whatever
zone the server is in. This matters: midnight IST is the previous day in UTC,
and a naive version would look up yesterday's birthdays and wish nobody.

**Deliverability.** This removes the datacenter-SMTP problem, but it does not
erase the sending account's existing history. The account that has been
spam-foldering will still carry that reputation. The real fix remains the
college address — at which point this same script, in that account, sends
college mail to college students, which is a completely different proposition.

---

## Moving it to the college account later

1. Open the roster sheet in the college account (or share it there)
2. **Extensions → Apps Script**, paste the same `Code.gs`
3. Update `CONFIG` (`REPORT_EMAIL`, `REPLY_TO`)
4. Run `validateRoster`, authorise, then `installTrigger`
5. Turn off the old trigger in the personal account with `removeTrigger`

No servers to move, no secrets to copy, nothing to redeploy.

---

## If something goes wrong

| Symptom | Cause |
|---|---|
| “Could not find a column for…” | headings don’t match — rename, or add the wording to `NAME_KEYS`/`EMAIL_KEYS`/`DOB_KEYS` |
| “This script must be bound to a spreadsheet” | you opened Apps Script standalone — open it from **the sheet** via Extensions |
| Nobody wished, but there are birthdays | check `Last Wished` — they may already have been wished today |
| Wished the wrong day | a date was misread; run `validateRoster` and check that row |
| Nothing runs at night | the trigger isn’t installed — clock icon in the sidebar |

Run **`selfTest`** any time to confirm the date logic is intact — it checks
day-first parsing, leap-day handling and name tidying, and sends nothing.
