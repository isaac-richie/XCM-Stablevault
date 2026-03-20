import { parseUnits } from "ethers";
import path from "path";
import { buildXcmBytes } from "../../../scripts/xcm-lib";

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
  // The Hub docs' execute() example is a VersionedXcm message that performs
  // WithdrawAsset + BuyExecution + DepositAsset. For direct wallet teleports we
  // stay on that path, but use the reserve parent so the asset location matches
  // PAS as seen from Hub when executing cross-consensus instructions.
  const versionOverride = process.env.XCM_VERSION ? Number(process.env.XCM_VERSION) : 5;
  const messageMode = "full" as const;
  const destinationMode = "para" as const;
  const assetParents = 1;

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
