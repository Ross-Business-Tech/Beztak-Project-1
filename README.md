# Beztakets

**An HR and Operations help desk with an AI assistant, built for Beztak.** Employee questions arrive by email or chat and become tickets. The assistant answers what it safely can from the Beztak Operations Manual. Everything else goes to the right person, with a suggested reply to check. Live site: https://beztak-project-1.onrender.com. How to *use* it: [docs/USER-GUIDE.md](docs/USER-GUIDE.md).

## How it works

```
Employee ── email ───▶ Gmail inbox ──┐
Employee ── chat bubble (Ask Beztak) ┤        ┌──────────────────────┐
                                     ├──────▶ │ Email helper         │ ◀── AI (U-M GPT)
HR person ◀── website (this repo) ◀──┘        │ Cloudflare Worker    │
   │  sign-in + shared files: Supabase        └──────────────────────┘
   └─ hosted on Render (static site)
```

| Part | What it does | Where it lives |
|---|---|---|
| **Website** | The desk (tickets, reports, gaps, lessons, documents) and the chat bubble. Plain static files built with Vite and React. | Render, built from this repo (`render.yaml`) |
| **Email helper** | Reads the HR Gmail every minute, makes tickets, runs the safety rules, asks the AI, sends replies, saves every chat as a ticket. | Cloudflare Worker (`helper/`) |
| **Sign-in and shared files** | Email and password login, and a private shared-files bucket. | Supabase (`supabase/`) |
| **AI** | Writes answers only from the Operations Manual and approved lessons, and must cite sections. | Key stored in the helper |

**Safety rules run before the AI.** Emergencies, personal records, pay disputes, approvals, legal or medical questions always go to a person. An AI answer without a correct citation is never sent. The checks are in `src/evals.js`; `npm run eval` must show every check passing before a release.

## Keeping it running

**Changing the site.** Work on a branch, open a pull request into `development`, get it approved and merged. Render rebuilds `development` automatically in a few minutes (`npm ci && npm run build`, publishing `dist/`). Never commit directly to `main`.

**AI suggestions for the manual.** On Gaps, Fix list, **Suggest wording** asks the helper (`POST /manual/suggest`) to draft a manual entry from what staff already said. Facts the AI was not given must be `[blanks]`; invented ones are thrown away (see the *AI suggestions for the manual* checks).

**Updating the email helper.** The helper does not update with the site. After any change to `src/aiAgent.js`, `src/data.js` or `helper/`:
1. `npm run build:helper` writes `helper/bundle/worker.js`.
2. In Cloudflare open the worker, **Edit code**, replace everything with that file, **Deploy**.

**Cloudflare settings (never in this repo).** Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `BURNER_EMAIL`, `HELPER_TOKEN` (the password staff paste into their profile) and `UMGPT_API_KEY` (turns the AI on; without it the chat uses simple word matching). The worker needs the schedule `* * * * *` (Settings, Triggers) and a KV binding named `TICKETS`. More in [helper/README.md](helper/README.md).

**Accounts.** Add or reset staff in Supabase, Authentication, Users (tick *Auto Confirm User*). The start of the email must match a team member, for example `dana.whitfield@…` ([supabase/ACCOUNTS.md](supabase/ACCOUNTS.md)). Run `supabase/setup.sql` once in a new Supabase project.

**Putting the chat bubble on the intranet.** The site serves one script. Its IT team adds one line to their pages:
`<script src="https://YOUR-SITE/ask-widget.js" defer></script>`
Visitors then type their name and email, and each chat becomes a ticket.

**Run it locally.** `npm ci`, then `npm run dev`. Other commands: `npm run build`, `npm run eval`, `npm run build:helper`.

## If something breaks

| Symptom | Likely cause and fix |
|---|---|
| No new tickets from email | Helper not connected (profile page) or its schedule is missing in Cloudflare. Use *Check for new emails now* and read the status line. |
| Chat says it couldn't reach the help desk | The worker is down or not deployed. Redeploy `worker.js`. |
| Chat answers are plain word matching | `UMGPT_API_KEY` is not set in Cloudflare. |
| Chat wording is out of date | `worker.js` was not redeployed after the last change. |
| Sign-in says it cannot reach the service | Free Supabase projects pause after about a week unused. Restore the project in Supabase. |
| Site did not update after a merge | Check the Deploys tab in Render, and that Render watches `development`. |

## Know the limits

- Tickets, replies and documents on the desk are saved in each person's **browser** and are not shared between people. Email and chat tickets come back from the helper, and lessons and shared files are shared.
- Egnyte is not connected. The assistant cannot read uploaded documents unless one is set as its manual.
- A chat can mark a ticket urgent when the person says so *and* the situation fits the team's urgency rules.

## Rules

This repository is public. Use made-up data only. Never commit keys, passwords or `.env` files.
