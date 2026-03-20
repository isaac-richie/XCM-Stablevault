# Next.js Frontend

## Purpose
This app is the user-facing XCM StableVault frontend:
- Privy-powered EVM wallet connection
- Polkadot Hub TestNet network switching
- `WPAS` wrap + approve + deposit actions
- direct wallet-funded `PAS` teleports
- destination verification against `People Paseo`
- admin operations route

## Setup
1. Install dependencies:
   - `npm install`
2. Copy envs:
   - `cp .env.example .env.local`
3. Start the app:
   - `npm run dev`

## Wallet layer
- production wallet stack uses `Privy` + `wagmi` + `viem`
- external wallet connect runs through Privy
- supported wallet options include detected browser wallets, MetaMask, Rainbow, Coinbase Wallet, and WalletConnect QR
- set `NEXT_PUBLIC_PRIVY_APP_ID` to enable the production wallet flow
- optional: set `NEXT_PUBLIC_PRIVY_CLIENT_ID` if your Privy setup uses it

## Database
The frontend supports two database modes.

### SQLite
- default for local development
- file location: `frontend/nextjs/.data/stablevault.db`
- set `DB_CLIENT=sqlite` or omit DB envs

### Supabase Postgres
- recommended for hosted deployments
- set:
  - `DB_CLIENT=postgres`
  - `DATABASE_URL=<your Supabase pooled connection string>`
  - `DATABASE_SSLMODE=require`
- schema auto-initializes on startup

## OpenAI Layer
- optional explanation UX
- set `OPENAI_API_KEY` to enable LLM-generated recommendation summaries
- default model: `gpt-5.4-mini`
- without OpenAI configured, the app falls back to deterministic explanation text

## Important
- direct teleport submission is wallet-first:
  - app prepares an XCM payload
  - connected wallet signs and executes the precompile call
  - action record is stored after confirmation
  - destination verification checks the People balance
- API routes still use root repo verification helpers:
  - `npm run xcm:verify-people`

## Abuse Controls
- default request window: `3` teleport requests per `5 minutes` per wallet
- default pending quota: `2` in-flight actions per wallet
- configurable envs:
  - `ACTION_RATE_WINDOW_MS`
  - `ACTION_RATE_MAX_REQUESTS`
  - `ACTION_RATE_MAX_PENDING`

## Admin Monitoring
Admin-only routes and APIs expose:
- bridge action counts
- action history
- AI snapshots
- AI decision deltas

## Default Public Config
- Chain ID: `420420422`
- RPC: `https://testnet-passet-hub-eth-rpc.polkadot.io`
- `WPAS`, vault, and MockUSD addresses are prefilled from the current project state
