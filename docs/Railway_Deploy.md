# Railway deployment

## Start command

The app uses `next start -h 0.0.0.0 -p ${PORT:-3000}` so it listens on all interfaces and on the port Railway assigns. Railway sets `PORT` automatically; do not override it unless needed.

## Run migrations on deploy

The app expects these DB objects (from Drizzle migrations):

- Table `governance_control_responsibilities` (migration 0029)
- Column `boundary_id` on `governance_register_entries`, `governance_register_entry_files`, `governance_entry_events` (migration 0030)

If you see errors like **relation "governance_control_responsibilities" does not exist** or **column e.boundary_id does not exist**, the production database has not had migrations applied.

### Option A: Release command (recommended)

1. In Railway: open your project → **Settings** → **Deploy**.
2. Set **Release Command** to:
   ```bash
   npm run release
   ```
   (This runs `npm run db:migrate`, which applies all pending Drizzle migrations.)
3. Redeploy. Railway will run the release command with `DATABASE_URL` set before starting the app.

### Option B: Run migrations once manually

With production `DATABASE_URL` (e.g. from Railway Variables):

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
```

Then redeploy or restart the service so the app starts against the updated schema.
