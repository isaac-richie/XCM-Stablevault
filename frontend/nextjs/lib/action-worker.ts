import { claimNextQueuedAction, getAction, updateAction } from "./actions-repo";
import { recordWorkerHeartbeat } from "./admin-stats";
import { parseTeleportOutput, parseVerifyOutput, runRepoScript, sleep } from "./relayer-service";

const inFlight = new Set<string>();

export async function processTeleportAction(actionId: string) {
  if (inFlight.has(actionId)) return;
  inFlight.add(actionId);

  try {
    const action = await getAction(actionId);
    if (!action || action.status !== "processing") {
      return;
    }

    const teleportResult = await runRepoScript("xcm:teleport-assets", {
      BENEFICIARY_SS58: action.beneficiary,
      XCM_AMOUNT: action.amountPlanck
    });
    const parsed = parseTeleportOutput(teleportResult.stdout);

    await updateAction(actionId, {
      status: "dispatched",
      originTxHash: parsed.txHash,
      originBlockHash: parsed.blockHash,
      originEvents: parsed.events
    });

    await sleep(Number(process.env.DEMO_VERIFY_WAIT_MS || "15000"));

    const afterVerify = await runRepoScript("xcm:verify-people", {
      BENEFICIARY_SS58: action.beneficiary
    });
    const afterPayload = parseVerifyOutput(afterVerify.stdout);
    const afterBalance = afterPayload.account?.free || "0";
    const beforeBalance = action.beforeBalance || "0";
    const settled = BigInt(afterBalance) > BigInt(beforeBalance);

    await updateAction(actionId, {
      status: settled ? "settled" : "dispatched",
      afterBalance
    });
    await recordWorkerHeartbeat({
      workerName: "stablevault-worker",
      lastActionId: actionId,
      lastActionStatus: settled ? "settled" : "dispatched",
      lastError: null
    });
  } catch (error: any) {
    await updateAction(actionId, {
      status: "failed",
      error: error?.stderr || error?.stdout || error?.message || "Worker execution failed"
    });
    await recordWorkerHeartbeat({
      workerName: "stablevault-worker",
      lastActionId: actionId,
      lastActionStatus: "failed",
      lastError: error?.stderr || error?.stdout || error?.message || "Worker execution failed"
    });
  } finally {
    inFlight.delete(actionId);
  }
}

export async function processNextQueuedTeleport() {
  const action = await claimNextQueuedAction();
  if (!action) {
    await recordWorkerHeartbeat({
      workerName: "stablevault-worker",
      lastActionId: null,
      lastActionStatus: "idle",
      lastError: null
    });
    return false;
  }
  await processTeleportAction(action.id);
  return true;
}
