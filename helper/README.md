# Beztakets email helper

Runs on Cloudflare Workers. Every minute it reads new emails sent to the burner Gmail, makes them tickets,
lets the AI agent answer what it safely can (sent by email), and sends replies written in Beztakets.

## Updating the helper in Cloudflare
1. In the project folder run `npm run build:helper`. It writes one file: `helper/bundle/worker.js`
   (this file is also saved in GitHub, so you can copy it from there).
2. In Cloudflare: Workers & Pages, your worker, **Edit code**. Select everything, delete it, paste the file, **Deploy**.

## Secrets (set in Cloudflare, never in this repo)
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `BURNER_EMAIL`, `HELPER_TOKEN`
and, to turn the AI on, `ANTHROPIC_API_KEY`. Without that last one the helper still works and uses the
simple keyword answers.

## How an email is handled
1. Safety rules first: emergencies, personal records, pay disputes, approvals, confidential matters,
   legal or medical questions, and anything containing passwords or ID numbers always go to a person.
2. With an AI key: the AI answers only from the HR answers plus the Operations Manual and must cite sections.
   If unsure, a person takes over.
3. Everything else gets a short "we passed this to ..." email.
