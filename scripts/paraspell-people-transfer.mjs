import { Builder, hasDryRunSupport } from "@paraspell/sdk";
import {
  entropyToMiniSecret,
  mnemonicToEntropy,
  ss58Address
} from "@polkadot-labs/hdkd-helpers";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { getPolkadotSigner } from "polkadot-api/signer";
import { inspect } from "node:util";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

function getEnv(key, fallback = "") {
  return process.env[key] || fallback;
}

function getSigner() {
  const mnemonic =
    getEnv("SUBSTRATE_RELAYER_SEED") ||
    getEnv("RELAYER_SEED") ||
    getEnv("SUBSTRATE_RELAYER_MNEMONIC") ||
    getEnv("RELAYER_MNEMONIC");

  if (!mnemonic) {
    throw new Error("Missing relayer mnemonic/seed");
  }

  const entropy = mnemonicToEntropy(mnemonic);
  const miniSecret = entropyToMiniSecret(entropy);
  const derive = sr25519CreateDerive(miniSecret);
  const keyPair = derive("");

  return getPolkadotSigner(keyPair.publicKey, "Sr25519", keyPair.sign);
}

async function main() {
  const amount = BigInt(getEnv("XCM_AMOUNT", "100000000000"));
  const recipient = getEnv("BENEFICIARY_SS58");
  const runMode = getEnv("PARASPELL_MODE", "dry-run");
  const apiUrl =
    getEnv("ASSET_HUB_WS_URL") ||
    getEnv("HUB_WS_URL") ||
    "wss://asset-hub-paseo-rpc.n.dwellir.com";

  if (!recipient) {
    throw new Error("Missing BENEFICIARY_SS58");
  }

  const signer = getSigner();
  const senderAddress = ss58Address(signer.publicKey);

  if (runMode === "dry-run") {
    if (!hasDryRunSupport("AssetHubPaseo")) {
      throw new Error("Dry run is not supported on AssetHubPaseo");
    }

    const result = await Builder(apiUrl)
      .from("AssetHubPaseo")
      .to("PeoplePaseo")
      .currency({
        symbol: "PAS",
        amount
      })
      .address(recipient)
      .senderAddress(senderAddress)
      .dryRun();

    console.log(inspect(result, { colors: true, depth: null }));
    return;
  }

  if (runMode === "verify-ed") {
    const ok = await Builder(apiUrl)
      .from("AssetHubPaseo")
      .to("PeoplePaseo")
      .currency({
        symbol: "PAS",
        amount
      })
      .address(recipient)
      .senderAddress(senderAddress)
      .verifyEdOnDestination();

    console.log(`ED verification ${ok ? "successful" : "failed"}.`);
    return;
  }

  if (runMode === "info") {
    const info = await Builder(apiUrl)
      .from("AssetHubPaseo")
      .to("PeoplePaseo")
      .currency({
        symbol: "PAS",
        amount
      })
      .address(recipient)
      .senderAddress(senderAddress)
      .getTransferInfo();

    console.log(inspect(info, { colors: true, depth: null }));
    return;
  }

  const tx = await Builder(apiUrl)
    .from("AssetHubPaseo")
    .to("PeoplePaseo")
    .currency({
      symbol: "PAS",
      amount
    })
    .address(recipient)
    .senderAddress(signer)
    .build();

  console.log("Built transaction:");
  console.log(inspect(tx, { colors: true, depth: null }));

  const result = await tx.signAndSubmit(signer);
  console.log("Submission result:");
  console.log(inspect(result, { colors: true, depth: null }));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
