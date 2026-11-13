# Team sign-in accounts (demo)

Beztakets signs people in with Supabase (email and password). **Who you are in the desk comes from the email you sign in with**:
the start of the email must match an HR team member.

| Team member | Role | Sign-in email |
|---|---|---|
| Dana Whitfield | Benefits | `dana.whitfield@beztak.example` |
| Omar Haddad | Payroll | `omar.haddad@beztak.example` |
| Priya Nair | Time off | `priya.nair@beztak.example` |
| Luca Romano | Onboarding | `luca.romano@beztak.example` |
| Sam Brooks | Employee relations | `sam.brooks@beztak.example` |

The part after the `@` can be anything (`@beztak.example` is just a made-up address that cannot receive email). A login whose email
does not match anyone (for example the old shared team login) can still sign in, but sees the desk as Dana Whitfield and is told so.

**Passwords are never stored in this repository** (it is public). Whoever creates the accounts shares them with the team privately.

## Creating or resetting an account (once per person)
1. Open the Supabase project, then **Authentication** > **Users**.
2. Click **Add user** > **Create new user**.
3. Type the email from the table and a password. **Tick "Auto Confirm User"** so no email is sent.
4. Click **Create user**. To change a password later, open the user and choose **Send password recovery** or set a new one.
5. If Supabase says an email address is invalid, use another domain for all five (any domain works, for example `@beztak.test`).

Use made-up demo accounts only. Never use real employees' emails.
