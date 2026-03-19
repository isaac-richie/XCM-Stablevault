import { ApiPromise, WsProvider, HttpProvider, Keyring } from "@polkadot/api";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

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

  if (!rpcUrl) throw new Error("Missing ASSET_HUB_WS_URL or HUB_WS_URL");
  if (!seed) throw new Error("Missing SUBSTRATE_RELAYER_SEED (or RELAYER_SEED)");

  const provider = rpcUrl.startsWith("http") ? new HttpProvider(rpcUrl) : new WsProvider(rpcUrl);
  const api = await ApiPromise.create({ provider, noInitWarn: true });

  const keyring = new Keyring({ type: "sr25519" });
  const relayer = keyring.addFromUri(seed);
  const account = (await api.query.system.account(relayer.address)) as any;
  const existentialDeposit = api.consts.balances.existentialDeposit.toString();

  console.log(
    JSON.stringify(
      {
        address: relayer.address,
        free: account.data.free.toString(),
        reserved: account.data.reserved.toString(),
        frozen: account.data.frozen.toString(),
        nonce: account.nonce.toString(),
        existentialDeposit
      },
      null,
      2
    )
  );

  await api.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
