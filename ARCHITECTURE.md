# XCM-AI StableVault Architecture

This document captures the current working MVP architecture on Polkadot Hub / Paseo with:
- An EVM vault on Hub for collateral and stablecoin logic.
- A funded Substrate relayer for the working cross-chain settlement path.
- A verified XCM teleport path from `Asset Hub Paseo` to `People Paseo`.

The current end-to-end demonstrable flow is:
`User -> Vault contract -> AI/policy intent -> Substrate relayer -> XCM teleport -> People Paseo beneficiary balance update`.

## Scope (MVP)
- **Origin chain**: `Asset Hub Paseo` / Polkadot Hub testnet environment.
- **Destination chain**: `People Paseo` (parachain ID `1004`).
- **Collateral**: WETH9-style wrapped PAS (WPAS) deployed by us for determinism.
- **AI**: Off-chain service decides when to trigger a rebalance, not required for protocol correctness.

## Components
1. **WPAS (Wrapped PAS) contract**
   - Standard WETH9 pattern (deposit native, mint ERC-20; withdraw burns and sends native).
   - Deployed on Hub testnet, address stored in config.

2. **XCM StableVault contract**
   - Accepts WPAS deposits and mints `XAIS` (demo stable token).
   - Produces the policy and authorization layer for cross-chain actions.
   - Retains the EVM precompile integration, but this is not the currently proven settlement path.

3. **Substrate Relayer**
   - Holds a funded `sr25519` account on `Asset Hub Paseo`.
   - Executes `polkadotXcm.limitedTeleportAssets(...)`.
   - Is the current production-safe sender for cross-chain delivery.

4. **XCM Scripts**
   - `scripts/relayer-limited-teleport-assets.ts`: working cross-chain sender.
   - `scripts/verify-people.ts`: verifies destination balance and recent processing events.
   - `scripts/xcm-build.ts`: retained for offline encoding / precompile experiments.

5. **AI Orchestrator (off-chain)**
   - Reads risk metrics.
   - When rebalance is required, emits an approved action for the relayer.
   - Can be a simple Node/Express service for MVP.

6. **Frontend (Next.js)**
   - Wallet connect, WPAS wrap/unwrap, deposit, and trigger XCM.
   - Displays teleport submission, destination verification, and vault state.

## On-Chain Contracts

### 1) WPAS (WETH9-style)
Purpose: deterministic, verifiable ERC-20 collateral on Hub testnet.

Key functions:
- `deposit()` payable: mints 1:1 WPAS for native PAS.
- `withdraw(uint256)`: burns WPAS and sends native PAS.

Notes:
- Use a well-known WETH9 implementation (minimal and audited pattern).
- Record deployed address in a config file and in frontend env.

### 2) XCMStableVault
Purpose: accept collateral, mint demo stablecoin, and authorize cross-chain actions.

Core responsibilities:
- `depositCollateral(uint256 amount)`: transferFrom user WPAS into vault.
- `mint/redeem` style stablecoin operations.
- restricted admin / AI hooks for rebalance intent.

Hard requirements:
- Keep destination allowlists and template constraints.
- Treat relayer execution as the canonical settlement path for now.

## Working Cross-Chain Strategy
We do **not** rely on EVM-native XCM send for the demo path. The working transfer primitive is the runtime extrinsic `limitedTeleportAssets`.

### Destination
- `parents = 1`
- `interior = X1(Parachain(1004))`
- destination chain: `People Paseo`

### Transfer primitive
Use the runtime-native pattern:
- `polkadotXcm.limitedTeleportAssets`
- asset: native `PAS`
- beneficiary: `AccountId32` on `People Paseo`

This is the path that has already demonstrated:
- `system.ExtrinsicSuccess` on origin
- `polkadotXcm.Sent` on origin
- beneficiary balance increase on destination

## EVM Path Status
The EVM precompile path remains in the repo, but on current Paseo runtime conditions it is not the path that successfully settled the transfer. The accurate architecture is:
- EVM vault = intent / policy / treasury logic
- Substrate relayer = XCM executor
- destination parachain = settlement target

This should be presented honestly in the demo and submission.

## Execution Flow

### Flow A: User deposit
1. User wraps PAS into WPAS (deposit).
2. User approves WPAS to `XCMStableVault`.
3. User calls `depositCollateral` in the vault.
4. Vault mints `XAIS` (demo stable token).

### Flow B: AI-triggered cross-chain action
1. AI service decides rebalance is required.
2. AI service or backend checks allowed destination and template.
3. Relayer submits `limitedTeleportAssets` on `Asset Hub Paseo`.
4. Origin chain emits `polkadotXcm.Sent`.
5. Beneficiary balance increases on `People Paseo`.

## Observability
You must be able to show:
- origin `system.ExtrinsicSuccess`
- origin `polkadotXcm.Sent`
- destination beneficiary balance change on `People Paseo`

## Suggested Repo Layout
- `contracts/WPAS.sol`
- `contracts/XCMStableVault.sol`
- `scripts/relayer-limited-teleport-assets.ts`
- `scripts/verify-people.ts`
- `scripts/demo-people.ts`
- `scripts/xcm-build.ts`
- `scripts/deploy.ts`
- `frontend/` (Next.js app)
- `docs/ARCHITECTURE.md` (this document, or keep at repo root)

## Risks and Mitigations
- EVM-native XCM restrictions: use the relayer as the canonical sender.
- Destination verification gaps: always verify beneficiary balance on `People Paseo`.
- RPC instability: keep multiple endpoints and use deterministic scripts.

## Milestones (4-5 days)
1. Deploy WPAS and vault, run local tests.
2. Lock the working teleport path with relayer and destination verification.
3. Wire frontend flow and AI trigger around the relayer architecture.
4. Demo: deposit -> AI intent -> teleport -> verify `People Paseo` balance.

## Open Items (to confirm)
- Final RPC endpoints to use in frontend and demo script.
- Final beneficiary address on `People Paseo`.
- Relayer operational policy and allowlist rules.
