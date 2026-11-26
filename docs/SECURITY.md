# Security

This page describes how the code is set up. It is not a security audit, and it has not been tested by a
security professional.

## What the code does

- **Server-side permission checks.** Every server action checks the user's role and permission on the server.
  A page that hides a button does not protect anything by itself.
- **Own data only.** Resident, collector and notification queries use the user id from the server session, never
  from the URL or a form.
- **Passwords.** Hashed with bcrypt. Sensitive admin actions ask the admin to enter their own password again.
- **Sessions.** Changing a password, suspending an account or changing a role ends that person's sessions.
- **Rate limits.** Sign-in, registration, reports, complaints, contact messages and exports are limited.
- **Protected accounts.** The root Super Admin cannot be suspended or demoted from the website, and nobody can
  create another Super Admin there.
- **Money-like logic.** Points and rewards use database transactions, idempotency keys and filtered updates, so a
  double click or two requests at once do not create two awards, two orders or negative stock. Integration tests
  cover these cases.
- **Audit log.** Staff actions are written to an append-only collection. It stores ids, actions and reasons, not
  passwords. Contact details of members of the public are kept out of audit entries.
- **Public content.** Text is shown as plain text, not as HTML. Links from staff must be paths on this site or
  full https addresses, and are checked again when shown.
- **CSV export.** Cells that start with a formula character are made safe. Exports hold counts and totals only.
- **Secrets.** `.env.local` is ignored by git. `/admin/integrations` shows whether a variable is set, never its value.

## Known limits

- No multi-factor authentication yet. A tested one-time-code library exists but it is not connected to sign-in.
- No password reset by email yet.
- Failed sign-in attempts are rate limited but not listed anywhere.
- The audit log is append-only in the application only. Someone with direct database access can change it.
- Roles are fixed in code. Changing them needs a code change and a new deployment.
- Sign-in through Auth.js and the full browser flow are not covered by automated tests.

## If a secret was exposed

Treat it as leaked. Change the Atlas database password and `AUTH_SECRET`, update the server environment, and
restart. Changing `AUTH_SECRET` signs everyone out, which is expected.
