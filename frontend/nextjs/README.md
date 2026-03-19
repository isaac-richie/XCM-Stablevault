# Next.js Frontend

## Purpose
This app is the user-facing XCM StableVault frontend:
- Privy-powered EVM wallet connection
- Polkadot Hub TestNet network switching
- `WPAS` wrap + approve + deposit actions
- queue-backed relayer teleport requests
- destination verification against `People Paseo`
- separate admin operations route

## Setup
1. Install dependencies:
   - `npm install`
2. Copy envs:
   - `cp .env.example .env.local`
3. Start the app:
   - `npm run dev`
4. Start the worker in a separate terminal:
   - `npm run worker`

## Wallet layer
- production wallet stack uses `Privy` + `wagmi` + `viem`
- external wallet connect runs through Privy
- supported wallet options include detected browser wallets, MetaMask, Rainbow, Coinbase Wallet, and WalletConnect QR
- set `NEXT_PUBLIC_PRIVY_APP_ID` to enable the production wallet flow
- optional: set `NEXT_PUBLIC_PRIVY_CLIENT_ID` if your Privy setup uses it

## Database
The frontend supports two database modes:

### SQLite
- default for local development
- file location: `frontend/nextjs/.data/stablevault.db`
- set `DB_CLIENT=sqlite` or omit DB envs

### Supabase Postgres
- recommended for production
- set:
  - `DB_CLIENT=postgres`
  - `DATABASE_URL=<your Supabase pooled connection string>`
  - `DATABASE_SSLMODE=require`
- schema auto-initializes on startup

## OpenAI Layer
- optional for Phase 1 explanation UX
- set `OPENAI_API_KEY` to enable LLM-generated recommendation summaries
- default model: `gpt-5.4-mini`
- without OpenAI configured, the app falls back to deterministic explanation text

## Important
- API routes run root-level commands:
  - `npm run xcm:teleport-assets`
  - `npm run xcm:verify-people`
- those commands depend on the root repo `.env.local`
- the frontend `.env.local` is for public config, request guards, and DB config
- teleport submission is queue-first:
  - request is signed with EIP-712 typed data
  - server issues and consumes a one-time nonce
  - server enforces pending-action quotas and rate limits
  - action is stored in the configured database
  - dedicated worker claims queued actions and runs relayer send plus settlement verification

## Abuse Controls
- default request window: `3` teleport requests per `5 minutes` per wallet
- default pending quota: `2` in-flight actions per wallet
- configurable envs:
  - `ACTION_RATE_WINDOW_MS`
  - `ACTION_RATE_MAX_REQUESTS`
  - `ACTION_RATE_MAX_PENDING`

## Admin Monitoring
Admin-only routes and APIs expose:
- queue counts
- worker heartbeat
- last processed action
- worker error diagnostics
- relayer connection state
- relayer balance health

## Default Public Config
- Chain ID: `420420422`
- RPC: `https://testnet-passet-hub-eth-rpc.polkadot.io`
- `WPAS`, vault, and MockUSD addresses are prefilled from the current project state
