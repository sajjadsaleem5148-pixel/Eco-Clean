# ECO-CLEAN

Clean Your Community. Grow a Greener Future.

ECO-CLEAN is a waste-management web platform. Residents report garbage and follow three-bag waste
segregation. Staff verify reports and assign collectors. Collectors update their jobs. Residents earn
Green Points only after staff verify a collection, and can spend them in a reward store.

The project is written in JavaScript (no TypeScript). It contains no AI features. Every number shown on a
page comes from the database, and pages say plainly when something is not configured.

## Status

This is a work in progress, not a finished product. See `docs/FEATURES.md` for what exists and what does not.
The main gaps are photo upload, email (password reset), multi-factor authentication, maps and the business portal.

## Tech stack

- Next.js 16 (App Router), React, Tailwind CSS
- MongoDB Atlas with Mongoose (a replica set is required, because points and rewards use transactions)
- Auth.js (next-auth beta) with email and password, bcrypt hashing
- zod for input validation
- Vitest for unit and integration tests (integration tests use an in-memory MongoDB replica set)
- Playwright browser tests are written in `tests/e2e`, but have not been run successfully yet. They start MongoDB, the site and Chrome together, which is heavy for a computer with little memory

## Requirements

- Node.js 20 or newer
- A MongoDB Atlas cluster (or another MongoDB replica set) that your computer is allowed to reach

## Setup

1. Install packages:

```
npm install
```

2. Create `.env.local` in the project root (it is ignored by git). Use `.env.example` as a guide:

```
MONGODB_URI=your Atlas connection string for the database named eco-clean
AUTH_SECRET=a long random string
APP_URL=http://localhost:3000
```

Make a new AUTH_SECRET without printing it to the screen or pasting it anywhere:

```
node -e "const fs=require('fs');const s=require('crypto').randomBytes(32).toString('base64');fs.appendFileSync('.env.local','\nAUTH_SECRET='+s+'\n')"
```

3. In Atlas, open Network Access and add your current IP address. If your IP changes, the site cannot reach
the database until you add the new one.

4. Create the first administrator:

```
node scripts/create-super-admin.js
```

5. Start the site:

```
npm run dev
```

Open http://localhost:3000. The administrator signs in at `/admin/login`. Residents sign in at `/login`.
Check the database connection at `/api/db-health`.

Optional, for development only: `node scripts/seed-dev-data.js` adds three waste categories and a demo zone.
Do not run it on a live database.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Runs the production build |
| `npm test` | Unit tests (rules, validation, helpers). No database needed |
| `npm run test:integration` | Database tests against a local in-memory replica set. Never touches Atlas |
| `npm run test:e2e` | Browser tests on a temporary local database (heavy: MongoDB, the site and Chrome run together) |
| `node scripts/verify-all.js` | Checks files, wiring, tests and build, and prints a summary |
| `node scripts/verify-all.js quick` | Same, without tests and build |
| `node scripts/reset-user-password.js` | Lists accounts and resets one password |

The first run of the integration tests downloads a MongoDB binary, which needs internet and may ask the
Windows firewall for permission.

## Folders

| Folder | Contents |
|---|---|
| `app/` | Pages and routes (public site, `/dashboard`, `/collector`, `/admin`, `/api`) |
| `components/` | Shared interface pieces (forms, layout, tables, status badges) |
| `actions/` | Server actions. Every one checks permission on the server |
| `services/` | Database logic used by pages and actions (points, rewards, analytics and more) |
| `models/` | Mongoose models |
| `lib/` | Rules, status tables, permissions, helpers |
| `tests/` | `unit/` and `integration/` tests |
| `scripts/` | Setup, check and generator scripts |

Many files were created by generator scripts named `scripts/create-*.js`. They overwrite the files they make,
so do not run an old one again unless you want to replace those files. Backups of files that scripts changed
are in folders named `scripts/backup-*`.

## Roles

SUPER_ADMIN, OPERATIONS_MANAGER, COMPLAINTS_MANAGER, COLLECTOR_SUPERVISOR, REWARDS_MANAGER, CONTENT_MANAGER,
SUPPORT_AGENT, READ_ONLY_ANALYST, COLLECTOR and RESIDENT. Permissions are defined in `lib/permissions/roles.js`
and shown read-only at `/admin/roles`. A Super Admin cannot be created, suspended or demoted from the website.

## Tests

At the last full run of `node scripts/verify-all.js`: the unit and integration tests passed (see `docs/TEST-REPORT.md` for the numbers once it exists), and the
production build compiled. The numbers change as the project grows, so run the command yourself.

What the tests do not cover: sign-in through Auth.js, how pages look in a browser, and any browser-level flow.
Those have only been checked by hand, if at all.

## Documents

- `docs/FEATURES.md` what is built, partly built and not built
- `docs/DEPLOYMENT.md` how to put the site online and a launch checklist
- `docs/SECURITY.md` how security works and its limits
