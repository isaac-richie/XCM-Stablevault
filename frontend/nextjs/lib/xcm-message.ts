import { parseUnits } from "ethers";
import path from "path";
import { buildXcmBytes } from "./xcm-build";

export function isLikelySs58(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{20,}$/.test(value.trim());
}

export async function buildTeleportMessage(input: {
  amount: string;
  beneficiary: string;
}) {
  const repoRoot = path.resolve(process.cwd(), "..", "..");
  const amountPlanck = parseUnits(input.amount, 10).toString();
  const paraId = Number(process.env.ASSET_HUB_PARA_ID || "1004");
  // Keep the frontend builder aligned with the repo's known working sendXcm()
  // script path instead of hard-coding a different asset location/version.
  const versionOverride = process.env.XCM_VERSION ? Number(process.env.XCM_VERSION) : undefined;
  const messageMode = ((process.env.XCM_MESSAGE_MODE || "") as Parameters<typeof buildXcmBytes>[0]["messageMode"]) || "full";
  const destinationMode = ((process.env.XCM_DESTINATION_MODE || "") as Parameters<typeof buildXcmBytes>[0]["destinationMode"]) || "para";
  const assetParents = process.env.XCM_ASSET_PARENTS ? Number(process.env.XCM_ASSET_PARENTS) : undefined;

  const { destinationHex, messageHex, xcmVersion } = await buildXcmBytes({
    amount: amountPlanck,
    beneficiary: input.beneficiary,
    paraId,
    versionOverride,
    messageMode,
    destinationMode,
    assetParents,
    metadataPath: path.join(repoRoot, "scripts", "metadata.json"),
    cachePath: path.join(repoRoot, ".cache", "xcm-messages.json")
  });

  return {
    amountPlanck,
    paraId,
    destinationHex,
    messageHex,
    xcmVersion
  };
}
