import { TypeRegistry } from "@polkadot/types";
import { Metadata } from "@polkadot/types/metadata";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import fs from "fs";
import path from "path";

export type BuildXcmArgs = {
  amount: string;
  beneficiary: string;
  paraId: number;
  versionOverride?: number;
  metadataPath?: string;
  cachePath?: string;
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

type CacheEntry = {
  destinationHex: string;
  messageHex: string;
  xcmVersion: string;
  paraId: number;
};

function loadMetadataHex(metadataPath: string): `0x${string}` {
  const raw = fs.readFileSync(metadataPath, "utf8");
  const parsed = JSON.parse(raw);
  const value = typeof parsed === "string" ? parsed : parsed?.result;
  if (typeof value === "string" && value.startsWith("0x")) return value as `0x${string}`;
  throw new Error("Invalid metadata.json: expected { result: '0x...' }");
}

function getRegistry(metadataPath: string): TypeRegistry {
  const registry = new TypeRegistry();
  const metadataHex = loadMetadataHex(metadataPath);
  const metadata = new Metadata(registry, metadataHex);
  registry.setMetadata(metadata);
  return registry;
}

function loadCache(cachePath: string): Record<string, CacheEntry> {
  if (!fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cachePath: string, cache: Record<string, CacheEntry>) {
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n");
  } catch (error: any) {
    const code = String(error?.code || "");
    if (code === "EROFS" || code === "EACCES" || code === "ENOENT") {
      return;
    }
    throw error;
  }
}

export async function buildXcmBytes(args: BuildXcmArgs) {
  const {
    amount,
    beneficiary,
    paraId,
    versionOverride,
    metadataPath,
    cachePath,
    messageMode,
    destinationMode,
    assetParents
  } = args;

  const version = versionOverride ?? 3;
  const vKey = version === 5 ? "V5" : version === 4 ? "V4" : "V3";

  const resolvedMetadataPath =
    metadataPath || path.resolve(process.cwd(), "scripts", "metadata.json");
  const resolvedCachePath =
    cachePath || path.resolve(process.cwd(), ".cache", "xcm-messages.json");

  const cacheKey = JSON.stringify({
    amount,
    beneficiary,
    paraId,
    version: vKey,
    messageMode,
    destinationMode,
    assetParents
  });
  const cache = loadCache(resolvedCachePath);
  if (cache[cacheKey]) return cache[cacheKey];

  const registry = getRegistry(resolvedMetadataPath);
  const beneficiaryId = decodeAddress(beneficiary);

  const isV5 = version >= 5;
  const destIsHere = destinationMode === "here";
  const destIsParent = destinationMode === "parent";
  const destinationValue = destIsHere
    ? { parents: 0, interior: isV5 ? { Here: null } : "Here" }
    : destIsParent
      ? { parents: 1, interior: isV5 ? { Here: null } : "Here" }
      : {
          parents: 1,
          interior: isV5 ? { X1: [{ Parachain: paraId }] } : { X1: { Parachain: paraId } }
        };

  const destination =
    destinationMode === "raw"
      ? registry.createType("StagingXcmV5Location", destinationValue)
      : registry.createType("XcmVersionedLocation", {
          [vKey]: destinationValue
        });

  const beneficiaryLocation = {
    parents: 0,
    interior: {
      X1: isV5
        ? [
            {
              AccountId32: {
                network: null,
                id: beneficiaryId
              }
            }
          ]
        : {
            AccountId32: {
              network: null,
              id: beneficiaryId
            }
          }
    }
  };

  let instructions: any[];
  if (messageMode === "doc-example") {
    const messageHex =
      "0x050c000401000003008c86471301000003008c8647000d010101000000010100368e8759910dab756d344995f1d3c79374ca8f70066d3a709e48029f6bf0ee7e";
    const destinationHex = u8aToHex(destination.toU8a());
    const result = { destinationHex, messageHex, xcmVersion: vKey, paraId };
    cache[cacheKey] = result;
    saveCache(resolvedCachePath, cache);
    return result;
  }
  if (messageMode === "clear-origin") {
    instructions = [{ ClearOrigin: null }];
  } else if (messageMode === "clear-origin-raw") {
    const rawMsg = registry.createType("StagingXcmV5Xcm", [{ ClearOrigin: null }]);
    const destinationHex = u8aToHex(destination.toU8a());
    const messageHex = u8aToHex(rawMsg.toU8a());
    const result = { destinationHex, messageHex, xcmVersion: vKey, paraId };
    cache[cacheKey] = result;
    saveCache(resolvedCachePath, cache);
    return result;
  } else if (messageMode === "unpaid-exec") {
    instructions = [
      { UnpaidExecution: { weightLimit: "Unlimited", checkOrigin: null } },
      { ClearOrigin: null }
    ];
  } else if (messageMode === "reserve-transfer") {
    if (!isV5) throw new Error("reserve-transfer requires XCM v5");
    const parentsForAsset = assetParents ?? 1;
    const assetId = { parents: parentsForAsset, interior: "Here" };
    const asset = { id: assetId, fun: { Fungible: amount } };
    const reserveLocation = { parents: 1, interior: { Here: null } };
    const destLocation = { parents: 1, interior: { X1: [{ Parachain: paraId }] } };

    const destXcm = [
      { BuyExecution: { fees: asset, weightLimit: "Unlimited" } },
      { DepositAsset: { assets: { Wild: "All" }, beneficiary: beneficiaryLocation } }
    ];

    const reserveXcm = [
      { BuyExecution: { fees: asset, weightLimit: "Unlimited" } },
      { DepositReserveAsset: { assets: { Wild: "All" }, dest: destLocation, xcm: destXcm } }
    ];

    instructions = [
      {
        InitiateReserveWithdraw: {
          assets: { Definite: [asset] },
          reserve: reserveLocation,
          xcm: reserveXcm
        }
      }
    ];
  } else {
    const parentsForAsset = assetParents ?? 0;
    const assetId = isV5
      ? { parents: parentsForAsset, interior: "Here" }
      : { Concrete: { parents: parentsForAsset, interior: "Here" } };

    const asset = {
      id: assetId,
      fun: { Fungible: amount }
    };

    if (messageMode === "withdraw-only") {
      instructions = [{ WithdrawAsset: [asset] }];
    } else if (messageMode === "withdraw-buy") {
      instructions = [{ WithdrawAsset: [asset] }, { BuyExecution: { fees: asset, weightLimit: "Unlimited" } }];
    } else {
      instructions = isV5
        ? [
            { WithdrawAsset: [asset] },
            { BuyExecution: { fees: asset, weightLimit: "Unlimited" } },
            {
              DepositAsset: {
                assets: {
                  Wild: {
                    AllOf: {
                      id: assetId,
                      fun: "Fungible"
                    }
                  }
                },
                beneficiary: beneficiaryLocation
              }
            }
          ]
        : [
            { WithdrawAsset: [asset] },
            { BuyExecution: { fees: asset, weightLimit: "Unlimited" } },
            { DepositAsset: { assets: { Wild: "All" }, beneficiary: beneficiaryLocation } }
          ];
    }
  }

  const message = registry.createType("XcmVersionedXcm", {
    [vKey]: instructions
  });

  const destinationHex = u8aToHex(destination.toU8a());
  const messageHex = u8aToHex(message.toU8a());

  const result = { destinationHex, messageHex, xcmVersion: vKey, paraId };
  cache[cacheKey] = result;
  saveCache(resolvedCachePath, cache);

  return result;
}
