import type { TypedDataDomain, TypedDataField } from "ethers";
import { verifyTypedData } from "ethers";
import { appConfig } from "./config";

export const stableVaultDomain: TypedDataDomain = {
  name: "XCM StableVault",
  version: "1",
  chainId: appConfig.chainId,
  verifyingContract: appConfig.vaultAddress
};

export const teleportRequestTypes: Record<string, TypedDataField[]> = {
  TeleportRequest: [
    { name: "requester", type: "address" },
    { name: "beneficiary", type: "string" },
    { name: "amount", type: "string" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "string" }
  ]
};

export const adminRequestTypes: Record<string, TypedDataField[]> = {
  AdminRequest: [
    { name: "action", type: "string" },
    { name: "requester", type: "address" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "string" }
  ]
};

export function verifyTeleportTypedData(body: {
  requester: string;
  beneficiary: string;
  amount: string;
  timestamp: number;
  nonce: string;
  signature: string;
}) {
  return verifyTypedData(
    stableVaultDomain,
    teleportRequestTypes,
    {
      requester: body.requester,
      beneficiary: body.beneficiary,
      amount: body.amount,
      timestamp: body.timestamp,
      nonce: body.nonce
    },
    body.signature
  );
}

export function verifyAdminTypedData(body: {
  action: string;
  requester: string;
  timestamp: number;
  nonce: string;
  signature: string;
}) {
  return verifyTypedData(
    stableVaultDomain,
    adminRequestTypes,
    {
      action: body.action,
      requester: body.requester,
      timestamp: body.timestamp,
      nonce: body.nonce
    },
    body.signature
  );
}
