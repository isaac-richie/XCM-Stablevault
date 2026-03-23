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
  // Hub currently behaves best with XCM v5 for this path; allow env override.
  const versionOverride = process.env.XCM_VERSION ? Number(process.env.XCM_VERSION) : 5;
  const messageMode = ((process.env.XCM_MESSAGE_MODE || "") as Parameters<typeof buildXcmBytes>[0]["messageMode"]) || "full";
  const destinationMode = ((process.env.XCM_DESTINATION_MODE || "") as Parameters<typeof buildXcmBytes>[0]["destinationMode"]) || "para";
  const assetParents = process.env.XCM_ASSET_PARENTS ? Number(process.env.XCM_ASSET_PARENTS) : 1;

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
