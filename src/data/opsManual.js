// FICTIONAL Operations Manual for the demo company "Great Lakes Property Group" (GLPG).
// Every name, number, dollar amount and deadline here is invented for app testing.
// It is not a real company's procedures and is not legal advice.
//
// Structure: sections → items (one question + answer each). Optional `k` = extra search words
// (other ways people might ask). Lines starting with "• " show as bullet points.

export const MANUAL = {
  title: 'GLPG Operations Manual',
  short: 'Ops Manual',
  version: 'Demo Edition 1.0',
  effective: 'November 3, 2026',
  owner: 'Riley Carter, Property Operations Lead',
}

export const SECTIONS = [
  {
    n: 1, title: 'Using This Manual',
    items: [
      { q: 'What is this manual for?', a: 'It is the first place to look for how day-to-day property operations work at GLPG: emergencies, maintenance, vendors, keys, leasing, rent, residents, safety, and office procedures. It applies to all GLPG employees. Independent agents follow it whenever they work on GLPG-managed properties.', k: 'purpose scope applies' },
      { q: 'What if a procedure isn\'t in the manual or seems wrong?', a: 'Ask your property manager first. If it is still unclear, email operations@glpg-demo.example with the section number and what you are trying to do. Do not invent a workaround for anything involving money, access, safety, or Fair Housing.', k: 'unclear missing conflict question' },
      { q: 'Which version applies?', a: 'The current version in the employee portal controls. Printed copies may be outdated. The manual is reviewed every October and whenever a major process changes; changes are announced by company email.', k: 'update revision latest' },
      { q: 'Who can change a procedure?', a: 'Only the Property Operations Lead (Riley Carter) can change an operating procedure, with Managing Member approval for anything involving spending limits or legal risk. Property managers can suggest changes but cannot approve exceptions on their own.', k: 'exception approve change' },
    ],
  },
  {
    n: 2, title: 'Contacts and Escalation',
    items: [
      { q: 'Who do I contact for operations questions?', a: '• Property operations, keys, vendors, resident issues: Riley Carter, Property Operations Lead: operations@glpg-demo.example · (734) 555-0147\n• Maintenance and work orders: Sam Rivera, Maintenance Coordinator: maintenance@glpg-demo.example · (734) 555-0150\n• After-hours emergency maintenance line (24/7): (734) 555-0199\n• Rent, deposits, payments, vendor invoices: Taylor Nguyen, Accounting: accounting@glpg-demo.example · (734) 555-0148\n• Leasing compliance, Fair Housing, licensing: Avery Chen, Managing Broker: compliance@glpg-demo.example · (734) 555-0146\n• IT and security: helpdesk@glpg-demo.example · (734) 555-0145 · security@glpg-demo.example\n• Executive escalation: Jordan Patel, Managing Member: jordan.patel@glpg-demo.example · (734) 555-0144', k: 'contact phone email directory who call' },
      { q: 'How fast should I expect a response from Operations?', a: '• Emergencies: call, don\'t email. The on-call technician responds within 1 hour, 24/7.\n• Urgent issues: acknowledged the same business day.\n• Routine questions: acknowledged within 1 business day; answered within 3 business days.\nThese are internal targets, not guarantees.', k: 'response time how long wait' },
      { q: 'What if I don\'t get a response?', a: 'Reply once and copy operations@glpg-demo.example. If there is still no response after one more business day, contact Jordan Patel. For anything involving safety, active water damage, or a security breach, call. Don\'t wait on email.', k: 'escalate no answer ignored' },
      { q: 'Where do HR questions go?', a: 'This manual covers operations only. For pay, benefits, time off, or workplace concerns, contact People Operations: Morgan Ellis, people@glpg-demo.example, (734) 555-0142.', k: 'hr pay benefits pto vacation sick leave payroll human resources' },
    ],
  },
  {
    n: 3, title: 'Emergencies and After-Hours',
    items: [
      { q: 'What counts as an emergency?', a: 'Anything that threatens life, safety, or serious property damage right now:\n• Fire, smoke, gas smell, or carbon monoxide alarm\n• Active water leak, flooding, or sewage backup\n• No heat when the outdoor temperature is below 55°F\n• Electrical sparking, exposed live wires, or total power loss in a unit (not a utility outage)\n• A broken exterior door, window, or lock that leaves a unit unsecured\n• Elevator entrapment (call 911 first)\nLife-threatening situations: call 911 first, then the emergency line.', k: 'urgent emergency definition' },
      { q: 'What do I do if there is a fire, gas smell, or carbon monoxide alarm?', a: 'Evacuate. Don\'t investigate or re-enter. Call 911 or the gas utility\'s emergency number from a safe location. Then call the emergency maintenance line at (734) 555-0199 and notify Riley Carter. Do not operate light switches or electronics near a gas smell.', k: 'smoke alarm evacuate gas leak co' },
      { q: 'What do I do about a water leak or flooding?', a: '• If it is safe, shut off the water at the fixture or the unit\'s main shutoff valve.\n• Call the emergency maintenance line at (734) 555-0199. Don\'t just send an email.\n• Move belongings away from water if safe, and take photos.\n• Notify any units below that may be affected.\n• Create a work order marked "Emergency" and file an incident report within 24 hours.', k: 'leak water pipe burst flood ceiling dripping overflow' },
      { q: 'How does the after-hours emergency line work?', a: 'Call (734) 555-0199. It is answered 24/7 and routes to the on-call maintenance technician, who calls back within 15 minutes and aims to be on site within 1 hour. If you don\'t get a callback within 15 minutes, call again and then call Riley Carter.', k: 'after hours weekend night on call callback' },
      { q: 'A resident has no heat. Is that an emergency?', a: 'Yes, when the outdoor temperature is below 55°F. Call the emergency line at (734) 555-0199. If the repair will take longer than 4 hours in cold weather, Operations may provide space heaters or arrange temporary lodging. Riley Carter approves lodging.', k: 'heat furnace cold heater broken' },
      { q: 'What about a power outage?', a: 'First check whether the utility has a wider outage. If it does, post a notice for residents and monitor it; do not call the emergency line for a utility outage. If only one unit or building is affected, treat it as an emergency maintenance call.', k: 'electricity lights power out' },
      { q: 'What do I do in severe weather?', a: 'Follow alerts from local emergency officials. Don\'t travel to properties during a warning. After the event, Operations sends a check list of properties to inspect. Report damage through work orders with photos.', k: 'storm tornado snow ice weather' },
    ],
  },
  {
    n: 4, title: 'Maintenance Requests and Work Orders',
    items: [
      { q: 'How do I submit a work order?', a: 'Enter it in the property management system (PMS) under Work Orders. Include the property and unit, the problem, when it started, the priority, photos, and whether the resident gives permission to enter. Residents can submit their own requests through the resident portal; staff should enter any request received by phone, email, or in person the same day.', k: 'maintenance request repair fix broken submit create log' },
      { q: 'What are the maintenance priority levels and response times?', a: '• Emergency: on site within 1 hour, 24/7 (see Section 3).\n• Urgent: within 24 hours. Examples: no hot water, AC out when it is above 85°F, refrigerator not working, the only toilet in a unit not working, a broken smoke detector.\n• Routine: within 5 business days. Examples: dripping faucet, appliance noise, a sticking door.\n• Scheduled / cosmetic: within 30 days or at the next unit turn. Examples: paint touch-ups, carpet wear.', k: 'priority urgent routine how fast timeline sla response' },
      { q: 'Can I enter a unit to do a repair?', a: 'Only with authorization. For routine and urgent work, give the resident at least 24 hours\' written notice through the PMS, unless the resident\'s request gives permission to enter. Enter between 8:00 a.m. and 7:00 p.m., Monday–Saturday. In a genuine emergency you may enter without notice, but you must leave a written notice and log the entry the same day. Always knock, announce yourself, and wear your GLPG ID.', k: 'entry enter apartment notice permission access unit' },
      { q: 'When is a work order closed?', a: 'When the work is done and checked, photos are attached, parts and costs are recorded, and the resident has been told it is complete. If the resident reports the same problem within 30 days, reopen the original work order instead of creating a new one.', k: 'close complete finish' },
      { q: 'What do I do about pests or bed bugs?', a: 'Routine pests (ants, mice): create a routine work order; the approved pest vendor treats within 5 business days. Bed bugs or cockroach infestations: mark the work order urgent; the vendor inspects within 48 hours and adjoining units may need inspection. Don\'t move furniture or belongings between units.', k: 'pest bugs mice roaches exterminator' },
      { q: 'What about mold or water damage?', a: 'Mark the work order urgent. Find and stop the moisture source first. Areas larger than about 10 square feet, or any mold in a resident\'s health complaint, go to Operations for an approved remediation vendor. Don\'t give residents health advice; document and route.', k: 'mold mildew moisture damp water damage' },
      { q: 'How are smoke and CO detectors maintained?', a: 'They are tested at every move-in and every preventive maintenance visit, at least once a year. A resident report of a missing or broken detector is an urgent work order (within 24 hours). Never remove a detector without replacing it the same visit.', k: 'smoke detector carbon monoxide alarm battery beeping chirping' },
      { q: 'How does preventive maintenance work?', a: 'Each property has a seasonal schedule in the PMS: HVAC filters every 90 days, furnace and AC service each spring and fall, gutters each fall, and fire extinguisher checks monthly in common areas. The Maintenance Coordinator assigns these as scheduled work orders.', k: 'preventive pm schedule hvac filter seasonal' },
      { q: 'Who handles snow and ice removal?', a: 'Approved snow vendors clear drives and walkways after 2 inches of snow, with main walkways cleared by 7:00 a.m. on business days. Staff report missed areas or icy spots to Operations right away. Salt slippery entrances when it is safe to do so and note it in the PMS.', k: 'snow ice plow salt shovel winter' },
    ],
  },
  {
    n: 5, title: 'Vendors, Purchasing, and Spending Approvals',
    items: [
      { q: 'How much can I approve for a repair or purchase?', a: 'Spending limits per work order or purchase:\n• Up to $500: property manager\n• $500 to $2,500: Property Operations Lead (Riley Carter)\n• Over $2,500: Managing Member (Jordan Patel)\nSplitting a job into smaller orders to stay under a limit is not allowed.', k: 'approval limit spend authority cost budget sign off' },
      { q: 'How many quotes do I need?', a: '• Up to $1,000: one written quote\n• $1,000 to $5,000: two written quotes\n• Over $5,000: three written quotes, unless Riley Carter approves a single source in writing\nAttach all quotes to the work order.', k: 'bids quotes estimates compare' },
      { q: 'What about spending in an emergency?', a: 'In an emergency you may approve up to $2,500 to stop damage or make a unit safe, without waiting for normal approval. Notify Riley Carter within 24 hours and attach the invoice and photos. Anything over $2,500 needs a phone approval from Riley Carter or Jordan Patel first.', k: 'emergency spending urgent cost approve approval limit repair' },
      { q: 'How do I add a new vendor?', a: 'Only approved vendors may work at GLPG properties. To add one, send Operations the vendor\'s W-9, a certificate of insurance (at least $1,000,000 general liability, naming GLPG as additional insured), any required trade license, and a signed vendor agreement. Operations adds the vendor in the PMS, usually within 3 business days.', k: 'new vendor contractor onboard approve insurance w9 coi' },
      { q: 'How do I let a vendor into a property?', a: 'Verify the work order, the vendor\'s identity, the scope of work, and the approved access window before giving access. Log entry and completion in the PMS. Never give a vendor a master key or a permanent access code.', k: 'vendor access let in contractor key code' },
      { q: 'How are vendor invoices paid?', a: 'Vendors send invoices to accounting@glpg-demo.example with the work order number. The property manager confirms the work was completed. Accounting pays approved invoices within 30 days. Never pay a vendor directly or in cash.', k: 'invoice bill pay vendor payment' },
      { q: 'A vendor sent new bank or payment details. What do I do?', a: 'Treat it as possible fraud. Don\'t update anything or reply to the email. Forward it to security@glpg-demo.example and call Accounting at (734) 555-0148. Accounting verifies changes by calling the vendor at a phone number already on file, never the number in the email.', k: 'bank change payment details wire fraud scam' },
      { q: 'Can I accept a gift from a vendor?', a: 'Modest promotional items valued at $50 or less are fine if they create no expectation of preferential treatment. Cash, gift cards over $25, travel, or anything tied to a contract award needs written Managing Broker approval first.', k: 'gift lunch tickets' },
    ],
  },
  {
    n: 6, title: 'Keys, Access Codes, and Lockouts',
    items: [
      { q: 'How are keys stored and checked out?', a: 'Keys are kept in the locked key cabinet at each office and are coded. Never label a key with a full property address. Sign every key out and back in on the key log, and return it the same business day unless your manager approves otherwise.', k: 'key cabinet storage check out sign log' },
      { q: 'I lost a key, fob, or access card. What do I do?', a: 'Call Operations at (734) 555-0147 right away and email operations@glpg-demo.example. Don\'t wait until the end of your shift. If the key was labeled, identifiable, or a master key, the affected locks are rekeyed within 24 hours.', k: 'lost key missing fob card stolen' },
      { q: 'A resident is locked out. What do I do?', a: '• Verify identity: a photo ID that matches a leaseholder or an authorized occupant in the PMS.\n• Never let in someone who is not on the lease, even a family member, unless the leaseholder has given written authorization on file.\n• During business hours, office staff can unlock at no charge.\n• After hours, the on-call technician handles lockouts; the demo after-hours lockout fee is $75.\n• Log the lockout in the PMS.', k: 'lockout locked out let in resident door' },
      { q: 'Can I give out an access code or gate code?', a: 'Only through the approved secure system and only to an authorized person. Never send codes to an unverified phone number or post them in a group chat. Change vendor and showing codes after each use window.', k: 'code gate lockbox door code share text' },
      { q: 'Does a master key let me enter any unit?', a: 'No. A master key is not blanket permission. Follow the entry notice rules in Section 4 and the lease, and log every entry.', k: 'master key enter' },
      { q: 'When are locks changed?', a: 'At every move-out before the next move-in, when a key is lost and identifiable, and when a resident requests it for safety (for example a protective order). A resident\'s safety-related request is handled within 24 hours.', k: 'rekey lock change new locks' },
    ],
  },
  {
    n: 7, title: 'Showings, Leasing, and Applications',
    items: [
      { q: 'How do I prepare for a showing?', a: 'Confirm the appointment time, the prospect\'s name and phone, and that the unit is available to show. Record a copy of the prospect\'s photo ID in the PMS before the showing. For an occupied unit, give the resident at least 24 hours\' notice. Use the lone-worker check-in for vacant or after-hours showings (Section 12).', k: 'showing tour prospect view apartment' },
      { q: 'Can prospects tour a unit by themselves?', a: 'Only at properties approved for self-guided tours, using the approved smart-lock system, which verifies identity. Never leave a key or code for an unverified person.', k: 'self guided tour alone unaccompanied' },
      { q: 'How do rental applications work?', a: '• Applicants apply online through the resident portal.\n• The demo application fee is $40 per adult applicant.\n• Every applicant is screened with the same published criteria (income, rental history, and screening report).\n• Decisions are made within 3 business days of a complete application.\n• Denials and conditional approvals use the adverse action notice in the PMS. Never explain a denial in your own words.', k: 'application apply screening approve deny criteria credit background' },
      { q: 'What can\'t I say to a prospect?', a: 'Don\'t describe a neighborhood or building as "good for families", "safe", or suited to any group. Don\'t ask about family plans, religion, disability, national origin, or any other protected characteristic. Give the same information to everyone. See Section 11.', k: 'fair housing steering neighborhood questions' },
      { q: 'How is a lease signed?', a: 'Leases are generated and signed electronically in the PMS. All adult occupants must sign. Don\'t change lease terms by hand or promise concessions that are not in the system; concessions need property manager approval and must appear in the lease.', k: 'lease sign signing contract concession discount' },
      { q: 'How are lease renewals handled?', a: 'Renewal offers go out through the PMS 90 days before the lease ends. Residents respond within 30 days. Property managers set renewal rates within the ranges Operations publishes each quarter.', k: 'renewal renew extend lease end' },
    ],
  },
  {
    n: 8, title: 'Move-In and Move-Out',
    items: [
      { q: 'What has to happen before move-in?', a: '• The lease is fully signed by all adults.\n• First month\'s rent and the security deposit are received in cleared funds (online payment or certified funds).\n• Renter\'s insurance proof is uploaded, if required by the lease.\n• The unit passes the make-ready checklist, including smoke and CO detector tests.\nKeys are released only when all four are done.', k: 'move in requirements keys before checklist new resident give giving keys tenant' },
      { q: 'How is the move-in inspection done?', a: 'Walk the unit with the resident if possible, using the move-in condition form in the PMS, and take dated photos of every room. The resident has 7 days to note anything else on the form. Store the form and photos in the resident file.', k: 'move in inspection condition walk through photos' },
      { q: 'How much notice does a resident have to give to move out?', a: 'At least 30 days\' written notice before the lease end date, through the resident portal or in writing to the office. Record the notice in the PMS the day it is received.', k: 'notice to vacate move out leaving' },
      { q: 'How is the move-out inspection done?', a: 'Inspect within 2 business days after keys are returned, using the move-out form and dated photos, and compare against the move-in record. Note normal wear and tear separately from damage.', k: 'move out inspection walk through damage wear' },
      { q: 'How is the security deposit returned?', a: 'Accounting mails or deposits the refund with an itemized list of any deductions within 30 days after move-out to the forwarding address on file. Deductions must be supported by move-in and move-out photos and invoices. Disputes go to the property manager and Accounting.', k: 'security deposit refund return deductions' },
      { q: 'How long does a unit turn take?', a: 'The target is 7 calendar days from move-out inspection to "ready to rent": cleaning, repairs, paint as needed, rekey, and detector tests. Operations approves extensions for major work.', k: 'turn make ready turnover vacant' },
    ],
  },
  {
    n: 9, title: 'Rent, Payments, and Late Fees',
    items: [
      { q: 'When is rent due and when is it late?', a: 'Rent is due on the 1st of each month. There is a grace period through the 5th. A demo late fee of $50 is charged on the 6th, as stated in the lease.', k: 'rent due date late fee grace period' },
      { q: 'How can residents pay rent?', a: 'Through the resident portal (bank transfer or card), or by check or money order in the office drop box. GLPG does not accept cash. Staff must never accept payments in the field or into a personal account.', k: 'pay rent payment methods check money order online portal cash' },
      { q: 'Can a resident get a payment plan?', a: 'Possibly. A payment plan needs approval from the property manager and Accounting and must be written and signed in the PMS. Don\'t promise a plan or waive fees verbally.', k: 'payment plan behind rent cant pay waive fee' },
      { q: 'What happens with a bounced payment?', a: 'A demo returned-payment fee of $35 applies. After two returned payments in 12 months, the resident must pay with certified funds. Accounting notifies the resident through the PMS.', k: 'bounced nsf returned check insufficient funds' },
      { q: 'Can I discuss a resident\'s balance?', a: 'Only with people on the lease or someone the leaseholder authorized in writing in the PMS. Don\'t discuss balances in public spaces or by text to unverified numbers.', k: 'balance account ledger owe privacy' },
      { q: 'What about late rent and evictions?', a: 'Property staff send only the standard late notices generated by the PMS. Any legal notice or eviction filing is handled by Operations with the company\'s attorney. Don\'t threaten eviction or discuss legal outcomes with residents.', k: 'eviction legal notice nonpayment' },
    ],
  },
  {
    n: 10, title: 'Resident Communication and Complaints',
    items: [
      { q: 'How do I handle a resident complaint?', a: 'Listen and stay calm. Write down the facts: who, what, when, and where. Log it in the PMS within 1 business day and acknowledge it to the resident within 1 business day. Route it to the right person: maintenance, the property manager, or Operations. Don\'t make promises about legal outcomes or other residents.', k: 'complaint upset angry resident issue tenant' },
      { q: 'What about noise complaints between neighbors?', a: 'Log the complaint, remind the other resident of the lease\'s quiet-hours rule (demo: 10:00 p.m. to 7:00 a.m.) in writing through the PMS, and don\'t share who complained. Repeated documented issues go to the property manager. Threats or violence: 911.', k: 'noise loud neighbor party' },
      { q: 'How do I send notices to residents?', a: 'Use the PMS notice templates (email plus posted notice where required). Building-wide notices, such as water shutoffs, need at least 48 hours\' notice except in emergencies. Keep a copy of every notice in the PMS.', k: 'notice letter announcement communicate shutoff' },
      { q: 'A resident is aggressive or threatening. What do I do?', a: 'Don\'t argue or try to restrain anyone. Leave the area if you can. Call 911 if anyone is in danger. When you are safe, notify your manager and Operations and file an incident report within 24 hours.', k: 'threat aggressive yelling hostile violent' },
      { q: 'Can I share a resident\'s information?', a: 'No. Resident information is shared only with people who need it for an assigned business purpose, or with written consent. Requests from police, other agencies, or lawyers go to Operations. Don\'t confirm whether someone lives at a property.', k: 'privacy confidential share info police request' },
    ],
  },
  {
    n: 11, title: 'Fair Housing and Accommodation Requests',
    items: [
      { q: 'What are the basic Fair Housing rules?', a: 'Treat every applicant and resident the same way, using written, consistent criteria for inquiries, applications, showings, and service requests. Never steer people toward or away from a property, use coded language, or make assumptions based on a protected characteristic. Escalate any concern to compliance@glpg-demo.example right away.', k: 'fair housing discrimination equal treatment protected class' },
      { q: 'A resident asks for an accommodation or modification. What do I do?', a: 'Acknowledge the request respectfully. Don\'t ask about a diagnosis, and don\'t approve or deny it yourself. Forward it to operations@glpg-demo.example and compliance@glpg-demo.example the same business day, and keep it confidential.', k: 'accommodation disability reasonable request modification grab bar ramp parking space' },
      { q: 'What about assistance animals or service animals?', a: 'A request involving an assistance or service animal is an accommodation request. Don\'t deny it, charge pet fees, or ask for medical details. Forward it to Operations and Compliance the same business day.', k: 'service animal emotional support esa dog pet' },
      { q: 'What if an owner or client asks for a discriminatory preference?', a: 'Don\'t follow it. Explain that GLPG uses lawful, consistent criteria, and contact the Managing Broker (Avery Chen) right away.', k: 'owner request discriminatory preference' },
      { q: 'What about advertising listings?', a: 'Use only approved listing templates. Describe the property, not the people who might live there. Have photos, captions, and ad targeting reviewed for discriminatory wording or effect.', k: 'ad listing advertising marketing' },
    ],
  },
  {
    n: 12, title: 'Field Safety and Property Visits',
    items: [
      { q: 'What do I do before a property visit?', a: 'Check the address, appointment details, known hazards, and access instructions. Tell a colleague or your manager where you are going and when you expect to finish. Carry a charged phone, keep keys secure, and park in a well-lit place where possible.', k: 'property visit safety before going site' },
      { q: 'How does lone-worker check-in work?', a: '• Before a visit: send your location, appointment time, and expected end time to your manager or team channel.\n• On arrival send "arrived", and when leaving send "clear".\n• If you are 15 minutes overdue, a colleague calls you. After 10 more minutes with no response, your manager contacts emergency services if the risk warrants it.\n• After-hours visits need manager approval and a named check-in partner.', k: 'lone worker check in alone buddy' },
      { q: 'When should I not enter a property?', a: 'Don\'t enter if you see signs of forced entry, weapons, aggressive animals, hazardous materials, structural damage, or threatening behavior. Leave, move to a safe place, and call 911 if needed, then call Operations.', k: 'unsafe danger enter break in' },
      { q: 'I feel unsafe during a showing or visit. What do I do?', a: 'Leave right away if you can. Don\'t confront anyone. Go to a safe public place and call 911 if you are threatened. Notify your manager and Operations when you are safe.', k: 'unsafe scared showing threatened' },
      { q: 'What safety gear do maintenance staff need?', a: 'Wear the protective equipment listed on the work order: gloves, eye protection, and slip-resistant footwear at minimum, plus a respirator or ladder safety equipment when the task requires it. Use lockout/tagout before any electrical or equipment work. Never work on a gas line; call the utility.', k: 'ppe gear ladder electrical safety equipment' },
      { q: 'Can I use my phone while driving to a property?', a: 'Don\'t handle your phone while driving. Pull over safely before calling, texting, or entering directions.', k: 'driving phone car text' },
    ],
  },
  {
    n: 13, title: 'Incident Reporting',
    items: [
      { q: 'When do I need to file an incident report?', a: 'Within 24 hours of any injury (to staff, residents, or visitors), property damage, fire, flood, break-in or theft, vehicle accident on company business, threat or violent incident, or near miss that could have caused serious harm. Emergencies come first: call 911 if needed.', k: 'incident report when file accident injury' },
      { q: 'How do I file an incident report?', a: 'Use the Incident Report form in the employee portal. Include the date, time, and location; the people involved; what happened in order; witnesses; photos if it is safe to take them; and what was done right away. Stick to facts. Don\'t guess about cause or fault.', k: 'incident form submit how' },
      { q: 'A resident or visitor was injured at a property. What do I do?', a: 'Call 911 if needed. Don\'t move an injured person unless they are in danger. Secure the hazard if you can. Don\'t admit fault, discuss insurance, or promise to pay anything. Notify Operations right away and file an incident report within 24 hours.', k: 'resident injured fell slip trip hurt visitor guest' },
      { q: 'I was injured on the job. What do I do?', a: 'Get medical care first: call 911 for emergencies. As soon as you are safe, tell your manager, file an incident report within 24 hours, and contact People Operations (people@glpg-demo.example) about workers\' compensation.', k: 'injured hurt on the job workers comp employee' },
      { q: 'What if there was a break-in or theft?', a: 'Call 911 if anyone is in danger, or the police non-emergency line otherwise. Don\'t disturb the scene. Secure the unit or building (emergency board-up or rekey through the emergency line), notify Operations, and file an incident report.', k: 'break in burglary theft stolen vandalism' },
    ],
  },
  {
    n: 14, title: 'Office Procedures and Records',
    items: [
      { q: 'How do I open and close the office?', a: 'Offices open at 8:30 a.m. and close at 5:00 p.m. Eastern, Monday–Friday. When closing: lock the key cabinet, secure files, check the drop box, turn off equipment, set the alarm, and lock all doors. Never share alarm codes.', k: 'open close office hours alarm lock up' },
      { q: 'How are visitors handled at the office?', a: 'Visitors sign in at the front desk and are escorted beyond the reception area. Don\'t leave visitors alone with files, the key cabinet, or unlocked computers.', k: 'visitor guest sign in front desk' },
      { q: 'How are resident and property records stored?', a: 'Use the PMS and approved company storage only. No personal email, personal cloud drives, or USB drives. Lease files are kept 7 years after move-out (demo setting). Shred paper with personal or financial information in the locked shred bin.', k: 'records files storage retention shred documents' },
      { q: 'How is mail and package delivery handled?', a: 'Resident packages are logged in the PMS and residents are notified the same day. Packages not picked up after 14 days are returned to the carrier after one reminder. Office mail is opened by the office manager; checks go straight to the drop safe and are logged.', k: 'mail package delivery' },
      { q: 'Can I correct a record I got wrong?', a: 'Yes, but never overwrite or delete an official record to hide an error. Use the PMS correction function so the history is kept, and tell your manager.', k: 'correct mistake record error fix' },
    ],
  },
  {
    n: 15, title: 'Technology, Phishing, and Wire Fraud',
    items: [
      { q: 'I clicked a suspicious link. What now?', a: 'Don\'t enter any passwords or keep clicking. Call IT at (734) 555-0145 and email security@glpg-demo.example from a safe device with the time, device, sender, and what you clicked. Don\'t delete the message.', k: 'phishing suspicious link email clicked virus hacked' },
      { q: 'Someone sent new wire or payment instructions. What do I do?', a: 'Don\'t act on them. Verify by calling a phone number you already have on file, never the number in the email. Changes need two-person verification by the transaction lead and the Managing Broker. Report it to security@glpg-demo.example.', k: 'wire instructions transfer fraud scam' },
      { q: 'I lost a laptop, phone, or tablet. What do I do?', a: 'Report it right away to security@glpg-demo.example and call IT at (734) 555-0145. If it had property access apps or codes, also call Operations at (734) 555-0147.', k: 'lost laptop phone device stolen tablet' },
      { q: 'I forgot my password or can\'t log in to the PMS.', a: 'Use the "Forgot password" link. If multi-factor authentication or account recovery fails, call IT at (734) 555-0145. Never share passwords or approve an MFA prompt you didn\'t start.', k: 'password login locked account mfa pms access' },
      { q: 'Can I use AI tools for work?', a: 'Only company-approved AI tools. Never enter resident, applicant, employee, or financial information, access codes, or passwords into a public AI tool. A person must check anything AI-generated before it is sent or used for a decision.', k: 'ai chatgpt tool' },
    ],
  },
]

// Flatten for search: one entry per question.
export const ENTRIES = SECTIONS.flatMap((s) => s.items.map((it, i) => ({
  section: s.n,
  sectionTitle: s.title,
  ref: `${s.n}.${i + 1}`,
  q: it.q,
  text: it.a,
  k: it.k || '',
})))
