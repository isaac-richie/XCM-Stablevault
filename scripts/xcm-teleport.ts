import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

const HUB_WS_URL = process.env.HUB_WS_URL || "";
const SUBSTRATE_MNEMONIC = process.env.SUBSTRATE_MNEMONIC || "";
const BENEFICIARY_SS58 = process.env.BENEFICIARY_SS58 || "";
const AMOUNT = process.env.XCM_AMOUNT || "";
const DEST_PARA_ID = Number(process.env.ASSET_HUB_PARA_ID || "1000");
const XCM_MODE = (process.env.XCM_MODE || "teleport").toLowerCase();
const XCM_LIMITED = (process.env.XCM_LIMITED || "false").toLowerCase() === "true";
const ASSET_PARENTS = Number(process.env.ASSET_PARENTS || "0");
const WEIGHT_REF_TIME = process.env.XCM_WEIGHT_REF_TIME;
const WEIGHT_PROOF_SIZE = process.env.XCM_WEIGHT_PROOF_SIZE;

async function main() {
  if (!HUB_WS_URL) throw new Error("Missing HUB_WS_URL");
  if (!SUBSTRATE_MNEMONIC) throw new Error("Missing SUBSTRATE_MNEMONIC");
  if (!BENEFICIARY_SS58) throw new Error("Missing BENEFICIARY_SS58");
  if (!AMOUNT) throw new Error("Missing XCM_AMOUNT");

  await cryptoWaitReady();
  const provider = new WsProvider(HUB_WS_URL);
  const api = await ApiPromise.create({ provider });

  const keyring = new Keyring({ type: "sr25519" });
  const signer = keyring.addFromMnemonic(SUBSTRATE_MNEMONIC);

  const safeVersionRaw = await api.query.xcmPallet.safeXcmVersion();
  const safeVersion = Number(safeVersionRaw.toString() || "3");
  const versionTag =
    safeVersion >= 5 ? "V5" : safeVersion >= 4 ? "V4" : "V3";

  const x1 = (junction: unknown) =>
    versionTag === "V3" ? { X1: junction } : { X1: [junction] };

  const dest = api.createType("XcmVersionedLocation", {
    [versionTag]: { parents: 1, interior: x1({ Parachain: DEST_PARA_ID }) }
  });

  const beneficiary = api.createType("XcmVersionedLocation", {
    [versionTag]: {
      parents: 0,
      interior: x1({
        AccountId32: {
          network: null,
          id: api.registry
            .createType("AccountId32", BENEFICIARY_SS58)
            .toU8a()
        }
      })
    }
  });

  const assets = api.createType("XcmVersionedAssets", {
    [versionTag]: [
      {
        id: { Concrete: { parents: ASSET_PARENTS, interior: "Here" } },
        fun: { Fungible: BigInt(AMOUNT) }
      }
    ]
  });

  const xcmPallet = api.tx.polkadotXcm || api.tx.xcmPallet;
  if (!xcmPallet) throw new Error("XCM pallet not found on this chain");

  const refTime = BigInt(WEIGHT_REF_TIME || "100000000");
  const proofSize = BigInt(WEIGHT_PROOF_SIZE || "100000");
  const weightLimit = {
    Limited: {
      refTime,
      proofSize
    }
  };

  const tx =
    XCM_MODE === "transfer"
      ? xcmPallet.transferAssets(dest, beneficiary, assets, 0, weightLimit)
      : XCM_MODE === "reserve"
        ? XCM_LIMITED
          ? xcmPallet.limitedReserveTransferAssets(
              dest,
              beneficiary,
              assets,
              0,
              weightLimit
            )
          : xcmPallet.reserveTransferAssets(dest, beneficiary, assets, 0)
        : XCM_LIMITED
          ? xcmPallet.limitedTeleportAssets(
              dest,
              beneficiary,
              assets,
              0,
              weightLimit
            )
          : xcmPallet.teleportAssets(dest, beneficiary, assets, 0);

  const unsub = await tx.signAndSend(signer, (result) => {
    if (result.dispatchError) {
      if (result.dispatchError.isModule) {
        const meta = api.registry.findMetaError(result.dispatchError.asModule);
        console.log(`DispatchError ${meta.section}.${meta.name}: ${meta.docs.join(" ")}`);
      } else {
        console.log(`DispatchError ${result.dispatchError.toString()}`);
      }
    }
    if (result.status.isInBlock) {
      console.log(`Included at block hash ${result.status.asInBlock.toString()}`);
    } else if (result.status.isFinalized) {
      console.log(`Finalized at block hash ${result.status.asFinalized.toString()}`);
      unsub();
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
