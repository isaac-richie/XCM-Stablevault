# XCM StableVault

AI-guided stablecoin vault on Polkadot Hub.

Users can:
- supply `WPAS` as collateral
- borrow `mUSD`
- repay debt
- earn claimable `mUSD` yield
- withdraw and unwrap back to native `PAS`
- teleport native `PAS` from their own wallet to `People Paseo`

## What We Built

### Stablecoin Vault
- `WPAS` collateral vault on Polkadot Hub EVM
- borrowable `mUSD` against deposited collateral
- repay flow with debt-aware withdraw protection
- APY-style reward accrual paid in `mUSD`

### AI Layer
- deterministic recommendation engine
- risk-aware action scoring
- OpenAI-backed explanation layer with deterministic fallback
- AI recommendation history with action references
- advisory-only posture: AI suggests, wallet signs

### XCM / Bridge
- direct wallet-funded `PAS` teleport flow
- current route:
  - origin: `Asset Hub Paseo`
  - destination: `People Paseo`
  - asset: native `PAS`
- destination verification and action history
- original source transaction recorded in request detail

### Frontend + Admin
- polished Next.js vault interface
- Privy-based wallet flow
- admin dashboard for action history, AI snapshots, and vault monitoring
- SQLite or Supabase-backed persistence

## Product Flow

1. Connect wallet
2. Wrap `PAS -> WPAS`
3. Approve and supply collateral
4. Borrow `mUSD`
5. Claim yield or repay debt
6. Withdraw collateral and unwrap back to `PAS`
7. Teleport `PAS` from the connected wallet

## Repo Structure

- `/Users/0xhardhat/xcm-stable-vault/contracts`
  - vault, stablecoin, and wrapper contracts
- `/Users/0xhardhat/xcm-stable-vault/scripts`
  - deploy, XCM, and verification scripts
- `/Users/0xhardhat/xcm-stable-vault/test`
  - contract tests
- `/Users/0xhardhat/xcm-stable-vault/frontend/nextjs`
  - production app, APIs, AI engine, and admin UI

## Local Setup

### Root
```bash
npm install
cp .env.example .env
npm run build
npm test
```

### Frontend
```bash
cd frontend/nextjs
npm install
cp .env.example .env.local
npm run dev
```

Or from the repo root:
```bash
npm run frontend:dev
```

## Key Commands

### Contracts
```bash
npm run build
npm test
npm run deploy:hub
```

### Frontend
```bash
npm run frontend:dev
npm run frontend:build
```

### XCM / Verification
```bash
npm run xcm:execute-eoa
npm run xcm:verify-people
npm run xcm:demo-people
```

## Environment Notes

Important root env values:
- `HUB_RPC_URL`
- `HUB_PRIVATE_KEY`
- `ASSET_HUB_WS_URL`
- `BENEFICIARY_SS58`

Important frontend env values:
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `NEXT_PUBLIC_WPAS_ADDRESS`
- `NEXT_PUBLIC_MOCKUSD_ADDRESS`
- `NEXT_PUBLIC_VAULT_ADDRESS`
- `OPENAI_API_KEY` (optional explanation layer)

## Current Persistence

For hackathon/demo mode, the frontend backend uses local SQLite by default:
- `/Users/0xhardhat/xcm-stable-vault/frontend/nextjs/.data/stablevault.db`

It switches to Postgres when `DB_CLIENT=postgres` is set.

## Current Status

Working now:
- supply
- borrow
- repay
- withdraw
- unwrap
- yield claims
- AI recommendations
- AI history
- direct wallet teleport
- destination verification

Not yet final:
- cross-chain `mUSD` transfer
- full production-grade external audit
- multi-instance production database setup

## Supporting Docs

- `/Users/0xhardhat/xcm-stable-vault/ARCHITECTURE.md`
- `/Users/0xhardhat/xcm-stable-vault/DEPLOYMENT.md`
- `/Users/0xhardhat/xcm-stable-vault/SECURITY.md`
- `/Users/0xhardhat/xcm-stable-vault/SUBMISSION.md`
