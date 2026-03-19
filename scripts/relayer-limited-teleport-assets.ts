import { ApiPromise, HttpProvider, Keyring, WsProvider } from "@polkadot/api";
import { decodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true, quiet: true });
dotenv.config({ quiet: true });

function getEnv(key: string, fallback = ""): string {
  return process.env[key] || fallback;
}

async function main() {
  const rpcUrl = getEnv("ASSET_HUB_WS_URL") || getEnv("HUB_WS_URL");
  const seed =
    getEnv("SUBSTRATE_RELAYER_SEED") ||
    getEnv("RELAYER_SEED") ||
    getEnv("SUBSTRATE_RELAYER_MNEMONIC") ||
    getEnv("RELAYER_MNEMONIC");
  const beneficiary = getEnv("BENEFICIARY_SS58");
  const amount = getEnv("XCM_AMOUNT", "100000000000");
  const paraId = Number(getEnv("ASSET_HUB_PARA_ID", "1004"));
  const assetParents = Number(getEnv("ASSET_PARENTS", "1"));

  if (!rpcUrl) throw new Error("Missing ASSET_HUB_WS_URL or HUB_WS_URL");
  if (!seed) throw new Error("Missing relayer mnemonic/seed");
  if (!beneficiary) throw new Error("Missing BENEFICIARY_SS58");

  const provider =
    rpcUrl.startsWith("http") ? new HttpProvider(rpcUrl) : new WsProvider(rpcUrl);
  const api = await ApiPromise.create({ provider, noInitWarn: true });

  const relayer = new Keyring({ type: "sr25519" }).addFromUri(seed);
  const beneficiaryId = decodeAddress(beneficiary);

  const dest = api.createType("XcmVersionedLocation", {
    V5: {
      parents: 1,
      interior: {
        X1: [{ Parachain: paraId }]
      }
    }
  });

  const beneficiaryLocation = api.createType("XcmVersionedLocation", {
    V5: {
      parents: 0,
      interior: {
        X1: [
          {
            AccountId32: {
              network: null,
              id: beneficiaryId
            }
          }
        ]
      }
    }
  });

  const assets = api.createType("XcmVersionedAssets", {
    V5: [
      {
        id: {
          parents: assetParents,
          interior: "Here"
        },
        fun: {
          Fungible: amount
        }
      }
    ]
  });

  const tx = api.tx.polkadotXcm.limitedTeleportAssets(
    dest,
    beneficiaryLocation,
    assets,
    0,
    "Unlimited"
  );
  const account = (await api.query.system.account(relayer.address)) as any;
  const nonce = account.nonce.toNumber();
  const signed = await tx.signAsync(relayer, { nonce });

  console.log(`Submitting limitedTeleportAssets from ${relayer.address}...`);
  console.log(`Nonce: ${nonce}`);
  console.log(`Extrinsic hash: ${signed.hash.toHex()}`);

  await new Promise<void>(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for limitedTeleportAssets finalization"));
    }, 120000);

    const unsub = await signed.send((result) => {
      if (result.status.isBroadcast) {
        console.log(`Broadcast peers: ${result.status.asBroadcast.join(", ")}`);
      }
      if (result.dispatchError) {
        if (result.dispatchError.isModule) {
          const meta = api.registry.findMetaError(result.dispatchError.asModule);
          console.log(`DispatchError: ${meta.section}.${meta.name}`);
        } else {
          console.log(`DispatchError: ${result.dispatchError.toString()}`);
        }
      }
      if (result.status.isInBlock) {
        console.log(`Included in block ${result.status.asInBlock.toString()}`);
      }
      if (result.status.isFinalized) {
        clearTimeout(timeout);
        console.log(`Finalized in block ${result.status.asFinalized.toString()}`);
        const events = result.events.map(({ event }) => `${event.section}.${event.method}`);
        console.log(`Events: ${events.join(", ")}`);
        unsub();
        resolve();
      }
      if (result.isError) {
        clearTimeout(timeout);
        unsub();
        reject(new Error("limitedTeleportAssets submission returned an error status"));
      }
    });
  });

  await api.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
