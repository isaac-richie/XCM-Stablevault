import { processNextQueuedTeleport } from "./lib/action-worker";

const pollMs = Number(process.env.WORKER_POLL_MS || "4000");

async function tick() {
  try {
    let processed = false;
    do {
      processed = await processNextQueuedTeleport();
    } while (processed);
  } catch (error) {
    console.error("[worker] queue processing error", error);
  }
}

async function main() {
  console.log(`[worker] starting StableVault worker, poll=${pollMs}ms`);
  await tick();
  setInterval(() => {
    void tick();
  }, pollMs);
}

main().catch((error) => {
  console.error("[worker] fatal error", error);
  process.exit(1);
});
