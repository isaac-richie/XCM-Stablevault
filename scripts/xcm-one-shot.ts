import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { buildXcmBytes } from "./xcm-lib";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

type Args = {
  amount: string;
  beneficiary: string;
  paraId: number;
  wsUrl?: string;
  versionOverride?: number;
  messageMode?: "full" | "clear-origin";
  waitSeconds: number;
  skipVerify: boolean;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const idx = args.indexOf(key);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const amount = get("--amount") || process.env.XCM_AMOUNT || "";
  const beneficiary = get("--beneficiary") || process.env.BENEFICIARY_SS58 || "";
  const paraId = Number(get("--para-id") || process.env.ASSET_HUB_PARA_ID || "1000");
  const wsUrl = get("--ws") || process.env.ASSET_HUB_WS_URL || "";
  const versionOverrideRaw = get("--xcm-version") || process.env.XCM_VERSION || "";
  const messageMode =
    ((get("--message-mode") || process.env.XCM_MESSAGE_MODE || "") as
      | "full"
      | "clear-origin"
      | "withdraw-only"
      | "withdraw-buy"
      | "doc-example") || "full";
  const destinationMode =
    ((get("--destination-mode") || process.env.XCM_DESTINATION_MODE || "") as "para" | "here") ||
    "para";
  const waitSeconds = Number(get("--wait-seconds") || process.env.XCM_WAIT_SECONDS || "15");
  const skipVerify = (get("--skip-verify") || process.env.XCM_SKIP_VERIFY || "") !== "";

  if (!amount) throw new Error("Missing --amount or XCM_AMOUNT");
  if (!beneficiary) throw new Error("Missing --beneficiary or BENEFICIARY_SS58");
  if (!skipVerify && !wsUrl) throw new Error("Missing --ws or ASSET_HUB_WS_URL for verification");

  const versionOverride = versionOverrideRaw ? Number(versionOverrideRaw) : undefined;

  return { amount, beneficiary, paraId, wsUrl, versionOverride, messageMode, waitSeconds, skipVerify, destinationMode };
}

function setEnvValue(filePath: string, key: string, value: string) {
  let content = "";
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf8");
  }
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const nextLines: string[] = [];
  let updated = false;
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      nextLines.push(`${key}=${value}`);
      updated = true;
    } else {
      nextLines.push(line);
    }
  }
  if (!updated) {
    nextLines.push(`${key}=${value}`);
  }
  fs.writeFileSync(filePath, nextLines.join("\n") + "\n");
}

async function fetchBalance(wsUrl: string, beneficiary: string) {
  const provider = new WsProvider(wsUrl);
  const api = await ApiPromise.create({ provider });
  const account = await api.query.system.account(beneficiary);
  const data = (account as any).data || {};
  const result = {
    free: data.free?.toString?.(),
    reserved: data.reserved?.toString?.(),
    miscFrozen: data.miscFrozen?.toString?.(),
    feeFrozen: data.feeFrozen?.toString?.()
  };
  await api.disconnect();
  return result;
}

async function main() {
  const { amount, beneficiary, paraId, wsUrl, versionOverride, messageMode, waitSeconds, skipVerify, destinationMode } = parseArgs();

  const { destinationHex, messageHex, xcmVersion } = await buildXcmBytes({
    amount,
    beneficiary,
    paraId,
    versionOverride,
    messageMode,
    destinationMode
  });

  const envPath = path.resolve(process.cwd(), ".env.local");
  setEnvValue(envPath, "DESTINATION_HEX", destinationHex);
  setEnvValue(envPath, "MESSAGE_HEX", messageHex);

  const [signer] = await ethers.getSigners();
  const vaultAddress = process.env.VAULT_ADDRESS || "";
  if (!vaultAddress) throw new Error("Missing VAULT_ADDRESS");

  const vault = new ethers.Contract(
    vaultAddress,
    [
      "function setAllowedMessageHash(bytes32,bool) external",
      "function sendXcm(bytes destination, bytes message) external returns (bool)",
      "function allowAllMessages() external view returns (bool)"
    ],
    signer
  );

  let before: any = null;
  if (!skipVerify) {
    before = await fetchBalance(wsUrl, beneficiary);
  }

  const messageHash = ethers.utils.keccak256(messageHex);
  const allowAll = await vault.allowAllMessages().catch(() => false);
  if (!allowAll) {
    const txAllow = await vault.setAllowedMessageHash(messageHash, true);
    console.log(`Allowlist tx: ${txAllow.hash}`);
    await txAllow.wait();
  }

  const tx = await vault.sendXcm(destinationHex, messageHex);
  console.log(`sendXcm tx: ${tx.hash}`);
  await tx.wait();

  if (!skipVerify) {
    if (waitSeconds > 0) {
      console.log(`Waiting ${waitSeconds}s before verifying...`);
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
    }
    const after = await fetchBalance(wsUrl, beneficiary);
    console.log(
      JSON.stringify(
        {
          xcmVersion,
          beneficiary,
          before,
          after
        },
        null,
        2
      )
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
