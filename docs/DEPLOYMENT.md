# Deployment

This guide describes the steps. Nothing here has been run on a live server, so test every step yourself.

## What you need

- A host that can run Node.js 20 or newer and `next start` (a VPS, or a platform for Node apps)
- A MongoDB Atlas cluster that is a replica set (Atlas clusters are)
- A domain name with HTTPS

## Environment variables

Set these on the host. Never put them in the code or in git.

| Name | Required | Meaning |
|---|---|---|
| `MONGODB_URI` | Yes | Connection string of the production database |
| `AUTH_SECRET` | Yes | At least 32 random characters. Use a different value from development |
| `APP_URL` | Yes | The public address of the site, with https |
| `GOOGLE_MAPS_API_KEY` or `MAPBOX_ACCESS_TOKEN` | No | Not used by any feature yet |
| `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET` | No | Not used yet |
| `EMAIL_PROVIDER_API_KEY`, `SMS_PROVIDER_API_KEY` | No | Not used yet |

`/admin/integrations` shows which of these are set, without showing their values.

## Steps

1. Copy the code to the host and run `npm ci`.
2. Set the environment variables.
3. In Atlas, open Network Access and allow the IP addresses of the host. Do not leave access open to everyone.
4. Run `npm run build`, then `npm start`.
5. Put a reverse proxy or the platform's HTTPS in front of it.
6. Create the first administrator on the server: `node scripts/create-super-admin.js`.
7. Open `/api/db-health` and `/admin/integrations` and confirm the database is connected and is a replica set.

## Things to review before going live

- `lib/db/connect.js` sets public DNS servers (8.8.8.8 and 1.1.1.1). This was added for a home network that could
  not resolve Atlas addresses. Decide whether the production host needs it. Remove it if it does not.
- Check the Auth.js settings for running behind a proxy on your host. This has not been tested here.
- Do not run `scripts/seed-dev-data.js` or any `create-*.js` generator script on production.

## Launch checklist

- [ ] Database password and `AUTH_SECRET` were created fresh, were never pasted into chat or git, and are kept in a password manager
- [ ] Atlas Network Access lists only the host
- [ ] Atlas backups are on, and a restore into an empty database was tested
- [ ] The root administrator uses a long unique password
- [ ] Privacy Policy and Terms were written and reviewed by someone qualified, then published at `/admin/pages`
- [ ] Contact details were entered at `/admin/settings` (only real, approved details)
- [ ] Zones, waste categories and points earning rules were created by an administrator
- [ ] `node scripts/verify-all.js` passes
- [ ] Someone walked through report, verify, assign, collect, points and redeem in a real browser

## Backups

The application does not make backups. Use Atlas backups, and test restoring one. `/admin/backup` holds a checklist
and cannot tell whether your backups work.
