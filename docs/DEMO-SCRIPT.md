# Beztakets demo video: itinerary and speaker notes

**Target length: 2:55** (about 400 spoken words at a calm pace). Record the screen first, then record the voice-over over it. That way a slow click never ruins a take.

## Before you record (10 minutes)

1. **Use the live site on a laptop,** signed in as Dana Whitfield, light theme, browser zoomed to about 110%, bookmarks bar hidden, full screen. All data must be made up.
2. **Connect the helper.** Click your initials (top left), paste the helper password, and press **Check for new emails now**. The status line must say the helper answered. Without this, chats won't become tickets.
3. **Set up one Fix list topic** (the example data has none). Click **+** and create 3 tickets with the *same subject*, "Parental leave question", with made-up names and the question "How does parental leave work?". Open one, add a **Private note**: `Up to 12 weeks of paid leave, starting any time in the first year.` Set its status to **Closed**. Now **Gaps, Fix list** shows "Parental leave question".
4. **Set up a lesson for the red circle.** Best: sign in once as a teammate (for example Omar), click **Teach the agent** on **Learned**, save a benefits question (for example "How do I add a new baby to my health coverage?", answer "Add the baby in the benefits portal within 30 days of the birth."), sign out, and sign back in as Dana. Dana now has a red 1 on Learned. If you can't, create the lesson as Dana and point at "assigned to Omar Haddad" instead.
5. **Rehearse the chat once** with the exact lines in scene 3, then close the chat bubble. Chats from the rehearsal will show up as tickets; that's fine, or delete them.
6. **Check the AI is on:** a manual answer in the chat ends with a line saying it was written by AI, and **Suggest wording** shows a "Written by AI" tag. If it says "Starting template," the AI key isn't set in Cloudflare: still record, and change the narration for scene 6 to "drafts a starting template" (see the note there).

## Itinerary

| Time | Scene | What to do on screen | Length |
|---|---|---|---|
| 0:00 | **1. Intro** | Sign-in page for 3 seconds, then the signed-in ticket list. | 10 s |
| 0:10 | **2. Tickets** | Point at the tabs and the **Needs your check** section. Open *Dental coverage for my kids*. Hover the AI reply (**Needs verification**, the `[blank]`). Click **Edit**, then **Cancel**. Point at **Transfer ticket to** and **Ask for advice**. Click back. | 30 s |
| 0:40 | **3. Chat** | Click the round chat button. Type name `Alex Kim` and email `alex.kim@example.com`, **Start chat**. Ask `When is rent due?` and point at the section tag under the answer. Then ask `Does our dental plan cover braces for my kids?` and let the hand-off message appear. Type `yes it's urgent`. When it asks what makes it urgent, type `My son's orthodontist appointment is tomorrow and I need to know today`. Wait for "marked your ticket as urgent". Close the chat. | 40 s |
| 1:20 | **4. Chat tickets** | Click **Tickets**, then **From AI chatbot**. If the new chat isn't there yet, click your initials, **Check for new emails now**, and go back (cut this in editing). Point at the urgent tag and the assigned owner. | 15 s |
| 1:35 | **5. Learned** | Click **Learned**. Point at the red circle, the "assigned to you" line and **Approve**. Click **Approve**. | 15 s |
| 1:50 | **6. Gaps** | Click **Gaps**. Show the percent against the goal on **Overview**. Click **Fix list**, open *Parental leave question*, click **Suggest wording**, and point at the `[blank]` and the **Written by AI** tag. Quick glance at **Manual health**. | 25 s |
| 2:15 | **7. Reports** | Click **Reports**. Show the counts and the bar chart. | 10 s |
| 2:25 | **8. Manual and safety** | Click **Documents**: show **The assistant's manual** and scroll to **Never answered automatically**. Click **Setup**, **Open guardrails checks** and let the green results run. | 20 s |
| 2:45 | **9. Close** | Back to the ticket list, or hold on the guardrails page. | 10 s |

## Speaker notes (read these over the recording)

**1. Intro (10 s)**
"Meet Beztakets: the help desk for Beztak's HR and Operations team, with an AI assistant built in. Employees ask questions, the AI answers what it safely can, and people handle the rest."

**2. Tickets (30 s)**
"This is my desk. Tickets assigned to me are sorted by urgency. In 'Needs your check', the AI has already written a reply. I open one and read the draft. Anything the AI couldn't know is left as a blank, and nothing is sent until I approve it. I can edit the reply, transfer the ticket, or ask a teammate for advice."

**3. Chat (40 s)**
"Employees reach the same assistant through this chat bubble, which can sit right on Beztak's intranet. It asks for a name and email first, because every chat becomes a ticket. Ask about rent, and it answers straight from the Operations Manual and shows the section it used. Ask something the manual doesn't cover, and it won't guess. It passes the question to a person, creates a ticket, and promises a reply within 24 hours. If it's urgent, the employee can say so, but the assistant checks: it asks why, and only marks the ticket urgent when the situation really is."

**4. Chat tickets (15 s)**
"Back on the desk, that chat is now a ticket under 'From AI chatbot', flagged urgent and assigned to the right person."

**5. Learned (15 s)**
"When someone teaches the AI a new answer, a teammate is assigned to approve it. A red circle on Learned shows what's waiting for me. The AI never changes on its own."

**6. Gaps (25 s)**
"Gaps turns all of this into insight: how many questions the AI answered against our goal, and which topics the manual is missing. In the Fix list, 'Suggest wording' has the AI draft a manual entry from what staff already said. It can't invent facts: anything unknown stays a blank for us to fill in."

*If the AI isn't connected, say instead:* "…'Suggest wording' gives us a starting draft from what staff already said, and with the AI connected it writes the entry for us."

**7. Reports (10 s)**
"Reports shows each person's workload at a glance."

**8. Manual and safety (20 s)**
"The AI only answers from the Operations Manual, and the team can swap in their own PDF. Questions about pay, personal records or approvals always go to a person, and 117 automated safety checks prove it."

**9. Close (10 s)**
"Beztakets: faster answers for employees, less repetitive work for HR, and a person always in charge. Thank you."

## If something goes wrong

- **The chat says it couldn't reach the help desk:** the helper isn't reachable. Check the Cloudflare worker is deployed, then record the chat scene again.
- **The chat ticket never shows under From AI chatbot:** tickets go to the person who handles the topic, and that tab only shows yours. Benefits questions go to Dana, so use the dental question (a general question like the dog one goes to Sam).
- **The chat ticket is slow to appear:** the desk checks every 30 seconds. Click **Check for new emails now** in your profile and cut the wait.
- **The AI answers with word matching, not AI:** the AI key isn't set. Use the alternate line in scene 6 and skip claiming "written by AI".
- **Fix list is empty:** redo step 3 above: three tickets with exactly the same subject, one closed with a note.
- **Keep it under 3 minutes:** if you're long, shorten scene 8 (skip scrolling the manual) and scene 7.
