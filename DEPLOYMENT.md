# Deployment Notes

## Services
The application stack now has four runtime parts:

1. **Next.js web app**
   - public vault UI
   - admin UI
   - API routes for request creation and admin operations

2. **Worker**
   - polls the action queue
   - executes relayer-backed teleport flow
   - verifies settlement
   - records heartbeat and last action status

3. **Database**
   - local default: SQLite
   - production target: Supabase Postgres
   - schema auto-initializes on first app/worker start

4. **Root relayer environment**
   - root repo `.env.local`
   - XCM scripts and funded relayer account

## Required Processes

### Web
```bash
cd /Users/0xhardhat/xcm-stable-vault/frontend/nextjs
npm run dev
```

### Worker
```bash
cd /Users/0xhardhat/xcm-stable-vault/frontend/nextjs
npm run worker
```

## Database Modes

### Local default: SQLite
- file: `/Users/0xhardhat/xcm-stable-vault/frontend/nextjs/.data/stablevault.db`
- set `DB_CLIENT=sqlite` or omit both DB vars

### Production: Supabase Postgres
- set `DB_CLIENT=postgres`
- use the Supabase pooled connection string in `DATABASE_URL`
- set `DATABASE_SSLMODE=require`
- web and worker can share the same database safely

Stored state:
- teleport actions
- request nonces
- request-rate windows
- worker heartbeat

## Environment Split

### Root repo `.env.local`
Used by relayer scripts and chain verification:
- `ASSET_HUB_WS_URL`
- `RELAYER_MNEMONIC`
- `BENEFICIARY_SS58`
- `XCM_AMOUNT`

### Frontend `.env.local`
Used by web app and worker:
- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_HUB_RPC_URL`
- `NEXT_PUBLIC_VAULT_ADDRESS`
- `NEXT_PUBLIC_WPAS_ADDRESS`
- `NEXT_PUBLIC_MOCKUSD_ADDRESS`
- `DB_CLIENT`
- `DATABASE_URL`
- `ACTION_RATE_WINDOW_MS`
- `ACTION_RATE_MAX_REQUESTS`
- `ACTION_RATE_MAX_PENDING`

## Suggested Production Layout

### App server
- runs `npm run start`
- serves UI and API routes

### Worker server
- runs `npm run worker`
- no public traffic
- same env and database as app server

### Database
- managed Supabase Postgres
- daily backups
- credentials stored outside repo

### Process supervision
- run app and worker under systemd, PM2, Docker, or Kubernetes
- restart on failure
- separate logs for app and worker

## Hardening Notes
1. Keep the relayer mnemonic off the app host if possible.
2. Run the worker under a narrower service account than the web app.
3. Back up the Supabase database and root `.env.local` secret material separately.
4. Monitor worker heartbeat and relayer funding from `/admin`.
5. Rotate database and relayer credentials on a schedule.

## Operational Checks
Admins should verify:
- worker heartbeat is recent
- queued actions are draining
- failed actions are visible and retryable
- relayer account remains funded
- database connectivity is healthy
