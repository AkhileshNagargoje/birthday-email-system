# Birthday Email System — Cloudflare

React dashboard + Worker API + D1, deployed as one Worker. Sends a birthday
greeting every morning at 08:00 IST, with the PC switched off.

This replaces the Python version in the parent folder. That version still runs;
nothing here touches it.

---

## Structure

```
cloudflare/
  worker/                the API and the scheduled job
    index.ts             entry point: fetch + scheduled handlers
    env.ts               bindings, vars, secrets
    routes/              HTTP layer only - parse, delegate, format
      auth.ts            login, logout, session check
      students.ts        roster CRUD + CSV import
      actions.ts         overview, preview, run, one-off wish
    services/            business logic, no HTTP awareness
      students.ts        every D1 query for the roster
      sendLog.ts         delivery history + duplicate protection
      birthdayRun.ts     the daily job, shared by cron and dashboard
    email/
      provider.ts        one interface, Brevo and Cloudflare behind it
    lib/
      auth.ts            signed session cookies
      greeting.ts        the email itself, and the run report
  web/                   React dashboard
    src/
      App.tsx            session state and layout
      api/client.ts      the only place that calls the Worker
      components/        one panel each
      styles.css
  shared/                imported by BOTH worker and web
    types.ts             the API contract
    dates.ts             birthday matching, date parsing
  migrations/            D1 schema
```

The rule that keeps this scalable: **routes never touch D1, services never
touch HTTP.** Adding a feature means one file in each layer, not a rewrite.
`shared/` is the contract — if the Worker and the React app ever disagree about
a shape, TypeScript says so at build time.

---

## First-time setup

```bash
cd cloudflare
npm install
npx wrangler login
```

### 1. Create the database

```bash
npx wrangler d1 create birthday-db
```

Copy the `database_id` it prints into `wrangler.jsonc`, replacing
`PLACEHOLDER_RUN_WRANGLER_D1_CREATE`. Then:

```bash
npx wrangler d1 migrations apply birthday-db --remote
```

### 2. Set the secrets

```bash
npx wrangler secret put DASH_USER        # the username you will log in with
npx wrangler secret put DASH_PASS        # the password
npx wrangler secret put SESSION_SECRET   # any long random string
npx wrangler secret put BREVO_API_KEY    # from brevo.com -> SMTP & API
```

`SESSION_SECRET` signs the login cookie. Generate one with:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

### 3. Deploy

```bash
npm run deploy
```

---

## Email

Workers cannot open SMTP connections, so Gmail-over-SMTP is not an option here.
Two providers are implemented:

| Provider | Needs a domain? | When to use |
|---|---|---|
| `brevo` (default) | No — verify one sender address | Now |
| `cloudflare` | Yes — an onboarded domain | Once GCOERC has a domain |

**Brevo:** sign up free (300 emails/day), verify `hymanper@gmail.com` as a
sender, copy the API key into the `BREVO_API_KEY` secret.

**Switching to Cloudflare later:** own a domain on Cloudflare, run
`npx wrangler email sending enable yourdomain.com`, add
`"send_email": [{ "name": "EMAIL" }]` to `wrangler.jsonc`, and set
`EMAIL_PROVIDER` to `cloudflare`. No other code changes — that is the whole
point of `email/provider.ts`.

---

## Day to day

Everything is in the dashboard at your Worker's URL. Sign in with `DASH_USER` /
`DASH_PASS`.

- **Check email setup** — confirms the provider is configured, sends nothing
- **Test run** — matches birthdays for any date, sends nothing
- **Preview greeting** — renders the exact email
- **Send today's wishes** — the real thing, behind a confirmation
- **Wish anyone** — a greeting to any address, on any date
- **Import from a CSV** — takes the file from the Python version as-is

### Moving the existing roster across

In the dashboard: **Students → Import from a CSV → choose
`../data/students.csv`**. Names are tidied, emails lowercased, `DD/MM/YYYY`
dates parsed, and re-importing updates rather than duplicates.

---

## Configuration

Non-secret settings live in `wrangler.jsonc` under `vars`, and take effect on
the next deploy:

| Var | Meaning |
|---|---|
| `APP_NAME` | The name recipients see |
| `SEND_FROM_EMAIL` | The sending address |
| `REPORT_EMAIL` | Where the daily summary goes |
| `TEST_EMAIL` | While set, every scheduled greeting goes here instead of to students |
| `EMAIL_PROVIDER` | `brevo` or `cloudflare` |

`TEST_EMAIL` is the safety net — set it, deploy, watch one run land in your own
inbox, then clear it.

---

## How it protects itself

- **Never double-sends.** Cron delivery is at-least-once, so the same schedule
  can fire twice. A unique index on `(email, occasion_date)` for successful rows
  means the second run skips instead of sending again.
- **29 February** birthdays are wished on the 28th in non-leap years.
- **Day-first dates.** `13/08/2004` is 13 August, not an error.
- **Bad rows are reported, never guessed at**, on import and on entry.
- **One failure does not stop the run** — it is logged and the rest go out.
- **Real sends need a confirmation header**, so no accidental blast from a
  stray request.
- **The dashboard is behind a login**, because the roster is student personal
  data. Sessions are signed cookies that expire after 12 hours.

---

## Local development

```bash
npx wrangler d1 migrations apply birthday-db --local
npm run dev          # Vite, with the Worker alongside
```

Local secrets go in `.dev.vars` (gitignored, never deployed).

Trigger the scheduled job by hand:

```bash
curl "http://localhost:8787/__scheduled?cron=30+2+*+*+*"
```

---

## Scheduling

`"crons": ["30 2 * * *"]` in `wrangler.jsonc` — 02:30 UTC is 08:00 IST, and
India has no daylight saving, so it stays correct all year. Cron is UTC only
and may run up to a few minutes late; irrelevant for a birthday wish.

Unlike the GitHub Actions version, **Cloudflare does not disable schedules for
inactivity**, so no keep-alive commit is needed.
