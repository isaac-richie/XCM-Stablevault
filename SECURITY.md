# Security And Admin Controls

## Current Security Model

### Contracts
- `/Users/0xhardhat/xcm-stable-vault/contracts/WPAS.sol`
- `/Users/0xhardhat/xcm-stable-vault/contracts/XCMStableVault.sol`
- `/Users/0xhardhat/xcm-stable-vault/contracts/MockUSD.sol`

### Trust Boundaries
- Users trust the vault to custody collateral correctly
- The owner controls administrative settings
- The AI operator is authorized for restricted automation entry points
- The relayer executes approved chain-native transport on the Substrate side

## Admin Privileges

### Vault Owner
The owner can:
- set the AI operator
- transfer ownership
- pause and unpause the vault
- toggle `allowAllMessages`
- maintain destination, message, and template allowlists
- set the minimum native balance guard for send paths

### AI Operator
The AI operator can:
- call `aiRebalance(...)`
- call `aiSend(...)`

In practice, production use should keep these constrained by:
- strict destination allowlists
- strict template allowlists
- off-chain policy review

## Risk Controls Already In Place
- owner-only admin mutation
- explicit pause / unpause
- non-reentrancy guard on collateral withdrawal and XCM entry points
- allowlist checks for message, destination, and template hashes
- minimum native balance guard before send paths

## Recommended Production Hardening
1. Replace single-owner control with multisig
2. Remove `allowAllMessages` outside local testing
3. Restrict AI actions to pre-approved templates only
4. Require relayer execution to validate signed action intents
5. Add time delays for high-risk admin changes
6. Add monitoring for relayer drift, failed teleports, and beneficiary mismatches
7. Keep API-side quotas and rate limits enabled for user teleport submission

## What We Should Say Publicly
- The current working cross-chain settlement path is relayer-driven
- EVM-native XCM send was explored but is not the canonical production path on this runtime
- Cross-chain actions are intentionally constrained and should remain allowlist-driven
