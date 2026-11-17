# Beztakets demo video: itinerary and speaker notes (operations version)

**Target length: 2:55** (about 400 spoken words at a calm pace). Record the screen first, then record the voice-over over it, so a slow click never ruins a take.

**Record as Sam Brooks** (`sam.brooks@beztak.example`). Sam is the person who handles operations and general questions, so rent, work-order, purchasing and on-call chats all land on Sam's desk. Signed in as anyone else, the operations chats would not show up in your tabs.

## Before you record (10 minutes)

1. **Use the live site on a laptop,** signed in as Sam, light theme, browser zoomed to about 110%, bookmarks bar hidden, full screen. All data must be made up.
2. **Connect the helper.** Click your initials (top left), paste the helper password, and press **Check for new emails now**. The status line must say the helper answered. Without this, chats won't become tickets.
3. **Make the purchase-order ticket.** Click **+** and create a ticket: name `Jamie Rivera`, email `jamie.rivera@example.com`, subject `Purchase order for a vendor repair`, details `A vendor needs to fix the broken pool gate at Maple Court tomorrow. Do I need a purchase order first?` Its AI reply will cite manual section 4.2.
4. **Make the Fix list topic** (the example data has none). Click **+** three times, each with the subject `Parking permit question` and details `Do residents need a parking permit?` (made-up names). Open the first, click **Private note**, write `Residents register their vehicle at the office and receive a permit.`, click **Add note**, then set **Status** to **Closed**. Now **Gaps, Fix list** shows "Parking permit question".
5. **Make the lesson for the red circle.** Best: sign in once as Dana Whitfield, open **Learned**, click **Teach the agent**, and save the question `Do residents need a parking permit?` with the answer `Residents register their vehicle at the office and receive a permit. Guest parking is first come, first served.` Sign out and back in as Sam: Sam now has a red 1 on Learned. If you can't sign in as Dana, create the lesson as Sam and point at "assigned to Dana Whitfield" instead.
6. **Rehearse the chat once** with the exact lines in scene 3, then close the bubble. **Do not approve the lesson until scene 5.** If you re-record the chat after approving it, the assistant will answer the parking question from the lesson: turn the lesson off first.
7. **Check the AI is on:** a manual answer in the chat ends with a line saying it was written by AI, and **Suggest wording** shows a "Written by AI" tag. If it says "Starting template," the AI key isn't set in Cloudflare: still record, and use the alternate line in scene 6.

## Itinerary

| Time | Scene | What to do on screen | Length |
|---|---|---|---|
| 0:00 | **1. Intro** | Sign-in page for 3 seconds, then the signed-in desk. | 10 s |
| 0:10 | **2. Tickets** | Point at the urgent *Unsafe wiring in the break room* ticket and its tags. Open *Purchase order for a vendor repair*. Point at **Needs verification** and the source line "manual 4.2". Click **Edit**, then **Cancel**. Point at **Transfer ticket to** and **Ask for advice**. Click back. | 30 s |
| 0:40 | **3. Chat** | Click the round chat button. Type name `Alex Kim` and email `alex.kim@example.com`, **Start chat**. Ask `How fast must work orders be completed?` and point at the section tag under the answer. Then ask `Do we have a parking permit policy for residents?` and let the hand-off message appear. Type `yes it's urgent`. When it asks what makes it urgent, type `A resident's lease signing is at 9 tomorrow and I need to tell them today`. Wait for "marked your ticket as urgent". Close the chat. | 40 s |
| 1:20 | **4. Chat tickets** | Click **Tickets**, then **From AI chatbot**. If the new chat isn't there yet, click your initials, **Check for new emails now**, and go back (cut this in editing). Point at the urgent tag and the owner. | 15 s |
| 1:35 | **5. Learned** | Click **Learned**. Point at the red circle, the "assigned to you" line and **Approve**. Click **Approve**. | 15 s |
| 1:50 | **6. Gaps** | Click **Gaps**. Show the percent against the goal on **Overview**. Click **Fix list**, open *Parking permit question*, click **Suggest wording**, and point at the `[blank]` and the **Written by AI** tag. Quick glance at **Manual health**. | 25 s |
| 2:15 | **7. Reports** | Click **Reports**. Show the counts and the bar chart. | 10 s |
| 2:25 | **8. Manual and safety** | Click **Documents**: show **The assistant's manual** and scroll to **Never answered automatically**. Click **Setup**, **Open guardrails checks** and let the green results run. | 20 s |
| 2:45 | **9. Close** | Back to the ticket list, or hold on the guardrails page. | 10 s |

## Speaker notes (read these over the recording)

**1. Intro (10 s)**
"Meet Beztakets: the help desk that keeps Beztak's properties running. Site teams ask about rent, work orders, purchasing and on-call. The AI answers from the Operations Manual, and people handle the rest."

**2. Tickets (30 s)**
"This is the operations desk. A safety report about exposed wiring is flagged urgent at the top, and the AI never answers safety issues itself: a person handles them. Here, a property manager asks whether a vendor repair needs a purchase order. The AI has drafted a reply straight from section 4.2 of the manual, marked 'Needs verification'. I read it, edit if needed, and send. I can also transfer the ticket or ask a teammate for advice."

**3. Chat (40 s)**
"Site teams reach the same assistant through this chat bubble, which can sit right on Beztak's intranet. It asks for a name and email first, because every chat becomes a ticket. Ask how fast work orders must be completed, and it answers from the manual and shows the section it used. Ask something the manual doesn't cover, like parking permits, and it won't guess. It creates a ticket, passes it to a person, and promises a reply within 24 hours. If it's urgent, the person can say so, but the assistant checks first: it asks why, and only marks the ticket urgent when the situation really is."

**4. Chat tickets (15 s)**
"Back on the desk, that chat is now a ticket under 'From AI chatbot', flagged urgent and assigned to the person who handles operations questions."

**5. Learned (15 s)**
"Here a teammate has taught the AI the parking permit answer the manual was missing. It's assigned to me to approve, which is the red circle. The AI never changes on its own, and once I approve, it can answer that question next time."

**6. Gaps (25 s)**
"Gaps shows where the manual falls short. Residents keep asking about parking permits, so it tops the Fix list. 'Suggest wording' has the AI draft a manual entry from what staff already told residents. It can't invent facts: anything unknown stays a blank for us to fill in."

*If the AI isn't connected, say instead:* "…'Suggest wording' gives us a starting draft from what staff already said, and with the AI connected it writes the entry for us."

**7. Reports (10 s)**
"Reports shows each person's workload: open, urgent, overdue and AI-answered tickets."

**8. Manual and safety (20 s)**
"The AI only answers from the Beztak Operations Manual: rent, work orders, purchasing, on-call. Anything personal, about pay, or needing an approval always goes to a person, and 117 automated safety checks prove it."

**9. Close (10 s)**
"Beztakets: faster answers for site teams, fewer repeat questions for the office, and a person always in charge. Thank you."

## Other operations questions that work well in the chat

These are answered straight from the manual (so they make good extra takes): *When is rent due?* (section 2.1), *When do I need a purchase order?* (4.2), *How fast must on-call respond to an emergency?* (11.3, within 30 minutes), *How do I order new uniforms?* (5.5). These are not covered, so the assistant hands them to a person: *What is the petty cash limit?*, *Can residents keep a pet snake?*, *Can I approve a vendor invoice over $5,000 myself?*

## If something goes wrong

- **The chat says it couldn't reach the help desk:** the helper isn't reachable. Check the Cloudflare worker is deployed, then record the chat scene again.
- **The chat ticket never shows under From AI chatbot:** that tab only shows your own tickets. Operations and general questions go to Sam, so you must be signed in as Sam.
- **The chat ticket is slow to appear:** the desk checks every 30 seconds. Click **Check for new emails now** in your profile and cut the wait.
- **The AI answers with word matching, not AI:** the AI key isn't set. Use the alternate line in scene 6 and skip claiming "written by AI".
- **Fix list is empty:** redo step 4 above: three tickets with exactly the same subject, one closed with a private note.
- **Keep it under 3 minutes:** if you're long, shorten scene 8 (skip scrolling the manual) and scene 7.
