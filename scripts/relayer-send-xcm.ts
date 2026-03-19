import { ApiPromise, WsProvider, HttpProvider, Keyring } from "@polkadot/api";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

function getEnv(key: string, fallback = ""): string {
  return process.env[key] || fallback;
}

function loadMetadataHex(metadataPath: string): `0x${string}` {
  const raw = fs.readFileSync(metadataPath, "utf8");
  const parsed = JSON.parse(raw);
  const value = typeof parsed === "string" ? parsed : parsed?.result;
  if (typeof value === "string" && value.startsWith("0x")) return value as `0x${string}`;
  throw new Error("Invalid metadata.json: expected { result: '0x...' }");
}

async function rpcCall(url: string, method: string, params: unknown[] = [], timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    signal: controller.signal
  });
  clearTimeout(timer);
  const json = await res.json();
  if (json.error) {
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  }
  return json.result;
}

async function main() {
  const wsUrl = getEnv("ASSET_HUB_WS_URL") || getEnv("HUB_WS_URL");
  const destinationHex = getEnv("DESTINATION_HEX");
  const messageHex = getEnv("MESSAGE_HEX");
  const seed =
    getEnv("SUBSTRATE_RELAYER_SEED") ||
    getEnv("RELAYER_SEED") ||
    getEnv("SUBSTRATE_RELAYER_MNEMONIC") ||
    getEnv("RELAYER_MNEMONIC");
  const metadataPath = path.resolve(process.cwd(), "scripts", "metadata.json");

  if (!wsUrl) throw new Error("Missing ASSET_HUB_WS_URL or HUB_WS_URL");
  if (!destinationHex) throw new Error("Missing DESTINATION_HEX");
  if (!messageHex) throw new Error("Missing MESSAGE_HEX");
  if (!seed) throw new Error("Missing SUBSTRATE_RELAYER_SEED (or RELAYER_SEED)");

  const timeoutMs = Number(getEnv("RELAYER_RPC_TIMEOUT", "180000"));
  const provider = wsUrl.startsWith("http")
    ? new HttpProvider(wsUrl, {}, timeoutMs)
    : new WsProvider(wsUrl, undefined, {}, timeoutMs);
  let metadata: Record<string, `0x${string}`> | undefined = undefined;

  if (wsUrl.startsWith("http")) {
    const metaHex = loadMetadataHex(metadataPath);
    const genesisHash = await rpcCall(wsUrl, "chain_getBlockHash", [0], 20000);
    const runtime = await rpcCall(wsUrl, "state_getRuntimeVersion", [], 20000);
    const specVersion = runtime?.specVersion?.toString?.() ?? `${runtime?.specVersion}`;
    const key = `${genesisHash}-${specVersion}`;
    metadata = { [key]: metaHex };
    console.log(`Using local metadata for key ${key}`);
  }

  const api = await ApiPromise.create({ provider, metadata });

  const keyring = new Keyring({ type: "sr25519" });
  const relayer = keyring.addFromUri(seed);

  const dest = api.createType("XcmVersionedLocation", destinationHex);
  const msg = api.createType("XcmVersionedXcm", messageHex);

  const tx = api.tx.polkadotXcm.send(dest, msg);
  console.log(`Submitting polkadotXcm.send from ${relayer.address}...`);

  const unsub = await tx.signAndSend(relayer, (result) => {
    if (result.status.isInBlock) {
      console.log(`Included in block ${result.status.asInBlock.toString()}`);
    }
    if (result.status.isFinalized) {
      console.log(`Finalized in block ${result.status.asFinalized.toString()}`);
      const events = result.events.map(({ event }) => `${event.section}.${event.method}`);
      console.log(`Events: ${events.join(", ")}`);
      unsub();
      api.disconnect().catch(() => undefined);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
