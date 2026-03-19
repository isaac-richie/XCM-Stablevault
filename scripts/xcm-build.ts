import { buildXcmBytes, type BuildXcmArgs } from "./xcm-lib";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

type CliArgs = {
  amount: string;
  beneficiary: string;
  paraId: number;
  versionOverride?: number;
  writeEnv: boolean;
  messageMode?:
    | "full"
    | "clear-origin"
    | "withdraw-only"
    | "withdraw-buy"
    | "doc-example"
    | "clear-origin-raw"
    | "unpaid-exec"
    | "reserve-transfer";
  destinationMode?: "para" | "here" | "raw" | "parent";
  assetParents?: number;
};

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const idx = args.indexOf(key);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const amount = get("--amount") || process.env.XCM_AMOUNT || "";
  const beneficiary = get("--beneficiary") || process.env.BENEFICIARY_SS58 || "";
  const paraId = Number(get("--para-id") || process.env.ASSET_HUB_PARA_ID || "1000");
  const versionOverrideRaw = get("--xcm-version") || process.env.XCM_VERSION || "";
  const writeEnv = args.includes("--write-env") || (process.env.WRITE_ENV || "") !== "";
  const messageMode = ((get("--message-mode") || process.env.XCM_MESSAGE_MODE || "") as any) || "full";
  const destinationMode =
    ((get("--destination-mode") || process.env.XCM_DESTINATION_MODE || "") as any) || "para";
  const assetParentsRaw = get("--asset-parents") || process.env.XCM_ASSET_PARENTS || "";

  if (!amount) throw new Error("Missing --amount or XCM_AMOUNT");
  if (!beneficiary) throw new Error("Missing --beneficiary or BENEFICIARY_SS58");

  const versionOverride = versionOverrideRaw ? Number(versionOverrideRaw) : undefined;
  const assetParents = assetParentsRaw ? Number(assetParentsRaw) : undefined;

  return { amount, beneficiary, paraId, versionOverride, writeEnv, messageMode, destinationMode, assetParents };
}

async function main() {
  const { amount, beneficiary, paraId, versionOverride, writeEnv, messageMode, destinationMode, assetParents } =
    parseArgs();

  const { destinationHex, messageHex, xcmVersion, paraId: resolvedParaId } = await buildXcmBytes({
    amount,
    beneficiary,
    paraId,
    versionOverride,
    messageMode,
    destinationMode,
    assetParents
  });

  console.log(`DESTINATION_HEX=${destinationHex}`);
  console.log(`MESSAGE_HEX=${messageHex}`);
  console.log(`XCM_VERSION=${xcmVersion}`);
  console.log(`PARA_ID=${resolvedParaId}`);

  if (writeEnv) {
    const envPath = path.resolve(process.cwd(), ".env.local");
    const setEnvValue = (key: string, value: string) => {
      let content = "";
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, "utf8");
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
      fs.writeFileSync(envPath, nextLines.join("\n") + "\n");
    };

    setEnvValue("DESTINATION_HEX", destinationHex);
    setEnvValue("MESSAGE_HEX", messageHex);
    console.log("Updated .env.local with DESTINATION_HEX and MESSAGE_HEX");
  }

}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
