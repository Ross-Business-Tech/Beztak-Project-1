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

## Only new email is handled
- The helper remembers when it was first switched on and ignores every email from before that, so the old inbox is never read or answered.
- It never answers a conversation that already has a reply from the inbox address (a person already answered it), or out-of-office and bulk mail.
- Only one inbox check runs at a time, so the same email is never answered twice.
- The website only turns emails into tickets if they arrived after that browser was connected (reconnecting starts the clock again), and the website never sends automatic emails itself.

## How an email is handled
1. Safety rules first: emergencies, personal records, pay disputes, approvals, confidential matters,
   legal or medical questions, and anything containing passwords or ID numbers always go to a person.
2. With an AI key: the AI answers only from the HR answers plus the Operations Manual and must cite sections.
   Every number, phone number and email in the answer must appear in the cited sections, and a second AI
   check must agree it is a general question (not about one person, an approval, or anything sensitive).
   If not, a person takes over and gets a suggested reply to check, edit and send.
3. Everything else gets a short "we passed this to ..." email.
