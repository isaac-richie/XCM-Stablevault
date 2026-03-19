import { ApiPromise, WsProvider } from "@polkadot/api";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

const WS_URL = process.env.ASSET_HUB_WS_URL || "";
const BENEFICIARY = process.env.BENEFICIARY_SS58 || "";

async function main() {
  if (!WS_URL) throw new Error("Missing ASSET_HUB_WS_URL");
  if (!BENEFICIARY) throw new Error("Missing BENEFICIARY_SS58");

  const provider = new WsProvider(WS_URL);
  const api = await ApiPromise.create({ provider });

  const account = await api.query.system.account(BENEFICIARY);
  const data = (account as any).data || {};

  console.log(
    JSON.stringify(
      {
        beneficiary: BENEFICIARY,
        free: data.free?.toString?.(),
        reserved: data.reserved?.toString?.(),
        miscFrozen: data.miscFrozen?.toString?.(),
        feeFrozen: data.feeFrozen?.toString?.()
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
