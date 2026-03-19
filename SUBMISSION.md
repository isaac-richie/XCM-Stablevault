# Submission Narrative

## Project
`XCM StableVault` is an AI-governed stable vault on Polkadot Hub EVM. Users deposit `WPAS` as collateral, the vault manages a demo stable position, and approved cross-chain treasury actions are executed over Polkadot native interoperability into `People Paseo`.

## Track Fit
- **Track 1: EVM Smart Contract Track**
- Solidity contracts deployed in the Polkadot Hub environment
- DeFi / stablecoin framing through collateralized vault behavior
- AI-powered orchestration through off-chain risk and action policy

## Core Story
Most vaults stop at collateral and minting. Our design adds a second layer: the vault can coordinate treasury movement across chains using Polkadot-native transport.

The architecture is:

`User -> EVM vault -> AI decision engine -> Substrate relayer -> XCM teleport -> destination beneficiary`

This keeps the business logic in Solidity while using the chain-native XCM route that actually settles funds today.

## What Is Working
- `WPAS` collateral wrapping and deposit flow
- `XCMStableVault` collateral custody and demo stable accounting
- allowlist-based admin controls for XCM-related operations
- live `limitedTeleportAssets` transfer from `Asset Hub Paseo` to `People Paseo`
- destination balance verification on `People Paseo`

## Why Polkadot
- The vault lives in an EVM environment, which lowers adoption friction
- Cross-chain actions use XCM, which is native to the ecosystem
- The project demonstrates a realistic hybrid architecture: Solidity control plane plus Substrate execution plane

## Demo Script
1. User wraps PAS into `WPAS`
2. User deposits `WPAS` into the vault
3. AI/risk engine authorizes a transfer
4. Relayer submits `limitedTeleportAssets`
5. Origin emits `polkadotXcm.Sent`
6. Destination beneficiary balance increases on `People Paseo`

## What Makes It Competitive
- It is not only a smart contract demo; it is a working cross-chain system
- It uses Polkadot-native capabilities instead of treating the chain as generic EVM
- The AI layer has a clear role: policy and timing, not hand-wavy automation
- The architecture is honest about chain constraints and uses the execution path that actually works
