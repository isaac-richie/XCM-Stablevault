import { ApiPromise, WsProvider } from "@polkadot/api";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true, quiet: true });
dotenv.config({ quiet: true });

const PEOPLE_WS_URL =
  process.env.PEOPLE_WS_URL || "wss://people-paseo.dotters.network";
const BENEFICIARY = process.env.BENEFICIARY_SS58 || "";
const ORIGIN_PARA_ID = process.env.ORIGIN_PARA_ID || "1000";
const LOOKBACK_BLOCKS = Number(process.env.PEOPLE_LOOKBACK_BLOCKS || "40");

type ProcessedEvent = {
  blockNumber: number;
  blockHash: string;
  success: string;
  origin: string;
};

async function main() {
  if (!BENEFICIARY) throw new Error("Missing BENEFICIARY_SS58");

  const api = await ApiPromise.create({
    provider: new WsProvider(PEOPLE_WS_URL),
    noInitWarn: true
  });

  const account = await api.query.system.account(BENEFICIARY);
  const data = (account as any).data || {};

  const header = await api.rpc.chain.getHeader();
  const latestBlock = header.number.toNumber();
  const startBlock = Math.max(0, latestBlock - LOOKBACK_BLOCKS + 1);
  const processed: ProcessedEvent[] = [];

  for (let blockNumber = startBlock; blockNumber <= latestBlock; blockNumber += 1) {
    const hash = await api.rpc.chain.getBlockHash(blockNumber);
    const events = (await api.query.system.events.at(hash)) as any[];

    for (const record of events) {
      const { event } = record;
      if (event.section !== "messageQueue" || event.method !== "Processed") {
        continue;
      }

      const origin = event.data[0]?.toHuman?.() ?? event.data[0]?.toString?.();
      const success = event.data[1]?.toHuman?.() ?? event.data[1]?.toString?.();
      const originText =
        typeof origin === "string" ? origin : JSON.stringify(origin);

      if (!originText.includes(ORIGIN_PARA_ID)) {
        continue;
      }

      processed.push({
        blockNumber,
        blockHash: hash.toString(),
        success:
          typeof success === "string" ? success : JSON.stringify(success),
        origin: originText
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        peopleWsUrl: PEOPLE_WS_URL,
        beneficiary: BENEFICIARY,
        account: {
          free: data.free?.toString?.(),
          reserved: data.reserved?.toString?.(),
          miscFrozen: data.miscFrozen?.toString?.(),
          feeFrozen: data.feeFrozen?.toString?.()
        },
        scan: {
          latestBlock,
          lookbackBlocks: LOOKBACK_BLOCKS,
          originParaId: ORIGIN_PARA_ID
        },
        processedEvents: processed
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
