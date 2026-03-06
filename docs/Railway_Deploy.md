# Railway deployment

## Start command vs release command

- **Start Command** = what keeps the service running (must be the web server). Set to **`npm start`** or leave empty so Railway uses `package.json`’s `"start"` script. The app then runs `node scripts/start-server.mjs`, which starts Next.js on `0.0.0.0:PORT`.
- **Release Command** = runs once per deploy before the new instance serves traffic (e.g. migrations). Set to **`npm run release`** if you want migrations to run on each deploy.

**Do not set Start Command to `npm run release`.** That only runs migrations and exits, so no HTTP server runs and you get 502s.

## Config as code (recommended)

The repo includes `railway.toml` so you don’t need to set commands in the dashboard:

- **Start:** `npm start` (runs the Next.js server)
- **Pre-deploy:** `npm run release` (runs migrations before each deploy)

Railway applies this file on deploy; it overrides any **Custom Start Command** (or release) set in the UI. Just commit and push; no CLI or dashboard changes required.

## Start command (dashboard override)

If you override in Railway (**Settings** → **Deploy** → **Custom Start Command**), use `npm start`. The app listens on all interfaces and on the port Railway assigns via `PORT`.

## Run migrations on deploy

The app expects these DB objects (from Drizzle migrations):

- Table `governance_control_responsibilities` (migration 0029)
- Column `boundary_id` on `governance_register_entries`, `governance_register_entry_files`, `governance_entry_events` (migration 0030)

If you see errors like **relation "governance_control_responsibilities" does not exist** or **column e.boundary_id does not exist**, the production database has not had migrations applied.

### Option A: Release command (recommended)

1. In Railway: **Settings** → **Deploy**.
2. Set **Release Command** (or “Pre-deploy” / “Deploy command”) to:
   ```bash
   npm run release
   ```
   (This runs `npm run db:migrate` once per deploy.)
3. **Keep Start Command as `npm start`** (or empty). Do not use `npm run release` as the start command.
4. Redeploy. Railway runs the release command, then starts the app with `npm start`.

### Option B: Run migrations once manually

With production `DATABASE_URL` (e.g. from Railway Variables):

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
```

Then redeploy or restart the service so the app starts against the updated schema.
