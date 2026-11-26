# Features and status

Status words: **Built** means code exists and has automated tests. **Partly** means it works but a known piece is
missing. **Not built** means the page is only a placeholder or does not exist.

Built does not mean tested in a browser. Pages have not been checked in a real browser by an automated test.

## Residents

| Feature | Status | Notes |
|---|---|---|
| Register, sign in, change password | Built | Rate limited |
| Report garbage | Partly | No photo, no map or location pin |
| My reports and status history | Built | |
| Complaints with tickets, replies, one reopen within 7 days | Built | |
| Green Points balance and ledger | Built | Points come only from staff-verified collections |
| Reward store, redeem, orders, cancel while pending | Built | Stock is reserved in one transaction |
| Choose a service zone, see confirmed schedules | Built | Weekly windows only |
| Profile (name) | Partly | Only the name can be changed |
| Notifications and bell | Built | In-app only |
| Forgot or reset password | Not built | The pages say so plainly. Needs an email provider |

## Collectors

| Feature | Status | Notes |
|---|---|---|
| My jobs, accept, on the way, arrived, collected, unable to collect | Built | One step at a time, note required for the last two |
| Job history | Built | Own finished jobs only |
| My schedule | Built | Confirmed windows only |
| Notifications | Built | |

## Staff (admin)

| Area | Status |
|---|---|
| Dashboard with live counts | Built |
| Garbage reports: review, verify, reject, assign | Built |
| Assignments overview, missed pickups (estimate) | Built |
| Collectors, zones, neighborhoods, routes, vehicles, schedules | Built (records only, not linked to each other) |
| Households by zone (counts) | Built |
| Complaints and contact messages | Built |
| Support overview | Built |
| Green Points rules, adjustments, reversals | Built |
| Rewards, inventory, orders, vendors | Built (vendors not linked to products) |
| Waste categories | Built |
| Pages, announcements, banners, campaigns, services, FAQs, testimonials, content library | Built |
| Settings (public contact details) | Partly (no logo, colours or maintenance mode) |
| Analytics and CSV export | Built (counts only, no recycling figures) |
| Users, admin staff, roles (read-only), audit log | Built |
| Integrations, security center, backup checklist | Built (status and guidance only) |

## Not built

| Item | Why |
|---|---|
| Photo upload and media library (`/admin/media`) | Needs private storage such as S3 or R2 |
| Forgot and reset password, email verification | Needs an email provider |
| Email and SMS notifications | Needs a provider |
| Operations map, location pin, GPS | Needs a map provider |
| Multi-factor authentication for administrators | A one-time-code library exists (`lib/totp.js`, tested with the RFC values) but it is not connected to sign-in |
| Business portal (`/business/*`, 6 pages) | The business role and workflow are not decided. The pages show a plain notice |
| Recycling and composting outcome figures | No verified downstream records exist |
| Browser end-to-end tests (Playwright) | Written in `tests/e2e`, not run successfully yet |

## Known limits

- Several modules are records only. For example vehicles, routes and vendors are not linked to jobs, schedules
  or reward products yet.
- A resident's name in the header can show the old value until the next sign-in after a name change.
- Some limits are checked and then applied in two steps, so two staff acting in the same moment could both pass
  a check that is not backed by a database index. Where an index or a filtered update protects a rule, the
  tests cover it.
- The missed-pickup list is an estimate from each zone's collection target, not a confirmed miss.

## Added later

| Feature | Status | Notes |
|---|---|---|
| Public Our Impact page (`/impact`) | Built | Live counts only. No recycling or composting figures |
| Public Learn articles (`/learn`) and the content library | Built | Plain text, drafts are never public |
| Honest status pages: forgot password, media, operations map | Built | They state that the feature is not available. No fake forms |
| Accessibility code check (`node scripts/check-a11y.js`) | Built | Reads source files only. It cannot judge colour contrast or screen readers |
| Test report and zip scripts (`scripts/make-release.js`) | Built | The report is made only from a passing full check |
