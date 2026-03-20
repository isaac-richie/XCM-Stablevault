# Deployment Notes

## Services
The application stack now has three runtime parts:

1. **Next.js web app**
   - public vault UI
   - admin UI
   - API routes for AI, verification, and action recording

2. **Database**
   - local default: SQLite
   - production target: Supabase Postgres
   - schema auto-initializes on first app start

3. **Root verification environment**
   - root repo `.env.local`
   - XCM verification scripts and chain access

## Required Process

### Web
```bash
cd /Users/0xhardhat/xcm-stable-vault/frontend/nextjs
npm run dev
```

## Database Modes

### Local default: SQLite
- file: `/Users/0xhardhat/xcm-stable-vault/frontend/nextjs/.data/stablevault.db`
- set `DB_CLIENT=sqlite` or omit both DB vars

### Production: Supabase Postgres
- set `DB_CLIENT=postgres`
- use the Supabase pooled connection string in `DATABASE_URL`
- set `DATABASE_SSLMODE=require`

Stored state:
- teleport actions
- request nonces
- request-rate windows
- AI decision history

## Environment Split

### Root repo `.env.local`
Used by chain verification scripts:
- `ASSET_HUB_WS_URL`
- `BENEFICIARY_SS58`
- `XCM_AMOUNT`

### Frontend `.env.local`
Used by the web app:
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

### Database
- managed Supabase Postgres
- daily backups
- credentials stored outside repo

## Hardening Notes
1. Keep private keys and database credentials outside the repo.
2. Back up the Supabase database and root `.env.local` separately.
3. Monitor failed actions and API/database errors from `/admin`.
4. Rotate database and signing credentials on a schedule.

## Operational Checks
Admins should verify:
- database connectivity is healthy
- failed actions are visible
- settled actions are recorded with origin transactions
- AI snapshots continue to refresh
