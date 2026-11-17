# Exit email (send after the presentation)

**Before sending:** add the recipients, and delete this note. The GitHub links below work once pull request 8 is merged into `development`.

---

**To:** [recipients]
**Subject:** Beztakets: final deliverables and how to keep it running

Hello,

Thank you for the opportunity to build Beztakets for Beztak. Below is everything we are handing over.

**The deliverables**

| What | Link |
|---|---|
| The working app (sign in with the account we gave you) | https://beztak-project-1.onrender.com |
| User guide: step by step, with screenshots | https://github.com/Ross-Business-Tech/Beztak-Project-1/blob/development/docs/USER-GUIDE.md |
| User guide as a PDF (easy to attach or print) | https://github.com/Ross-Business-Tech/Beztak-Project-1/blob/development/docs/USER-GUIDE.pdf |
| README: how it works and how to keep it running | https://github.com/Ross-Business-Tech/Beztak-Project-1/blob/development/README.md |
| All the code | https://github.com/Ross-Business-Tech/Beztak-Project-1 |
| The AI's safety checks: what it may answer and what always goes to a person | https://github.com/Ross-Business-Tech/Beztak-Project-1/blob/development/EVALS.md |

**What it does**

- Turns employee emails and chats into tickets and routes each one to the right person, most urgent first.
- Answers common operations questions straight from the Beztak Operations Manual, with the section cited, and never guesses.
- Sends everything personal, pay-related, sensitive or unclear to a person, with a suggested reply for them to check before anything is sent.
- Includes the Ask Beztak chat bubble, ready to add to Beztak's intranet with one line of code. When it cannot answer, it opens a ticket with the person's name and email and promises a reply within 24 hours.
- Shows where the manual is missing answers (Gaps), lets the team teach the assistant new answers with a second person approving them (Learned), and reports each person's workload.

**To keep it running** (details in the README)

1. The website updates by itself when changes are merged into the `development` branch on GitHub.
2. The email and chat engine runs separately on Cloudflare. After any change to it, rebuild with `npm run build:helper` and paste the new file into the Cloudflare worker.
3. The AI only works while its key (`UMGPT_API_KEY`) is set in Cloudflare. Without it the chat falls back to simple word matching.
4. Staff accounts are created in Supabase. Free Supabase projects pause after about a week unused, so restore the project there if sign-in stops working.

**Please know**

- Everything in the app is made-up sample data. No real employee information was used.
- Tickets created on the desk are saved in each person's own browser. Email and chat tickets, lessons and shared files are shared across the team. Moving tickets to a shared database would be the first next step.
- Egnyte (Beztak's document store) is not connected yet.

Thank you again. Please reply with any questions.

Best regards,
Sangheethaa Gnanaprakash
Beztak team 1
