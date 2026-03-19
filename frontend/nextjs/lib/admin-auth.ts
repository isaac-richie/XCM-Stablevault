import { Contract, JsonRpcProvider } from "ethers";
import { vaultAbi } from "./abis";
import { appConfig } from "./config";
import { verifyAdminTypedData } from "./eip712";
import { consumeNonce } from "./nonces-repo";

const provider = new JsonRpcProvider(appConfig.rpcUrl);
const vault = new Contract(appConfig.vaultAddress, vaultAbi, provider);

export type AdminPayload = {
  action?: string;
  requester: string;
  timestamp: number;
  nonce: string;
  signature: string;
};

export async function verifyAdminRequest(
  body: AdminPayload,
  action: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!body.requester || !body.timestamp || !body.nonce || !body.signature) {
    return { ok: false, error: "Missing admin auth fields", status: 400 };
  }

  const ageMs = Math.abs(Date.now() - Number(body.timestamp));
  if (ageMs > 5 * 60 * 1000) {
    return { ok: false, error: "Signed admin request expired", status: 400 };
  }

  const signer = verifyAdminTypedData({
    action,
    requester: body.requester,
    timestamp: body.timestamp,
    nonce: body.nonce,
    signature: body.signature
  });
  if (signer.toLowerCase() !== body.requester.toLowerCase()) {
    return { ok: false, error: "Admin signature does not match requester", status: 401 };
  }

  const nonceRecord = await consumeNonce(body.requester, body.nonce);
  if (!nonceRecord) {
    return { ok: false, error: "Admin nonce invalid, used, or expired", status: 409 };
  }

  const [owner, aiOperator] = await Promise.all([vault.owner(), vault.aiOperator()]);
  const isAdmin =
    signer.toLowerCase() === owner.toLowerCase() ||
    signer.toLowerCase() === aiOperator.toLowerCase();

  if (!isAdmin) {
    return { ok: false, error: "Requester is not an authorized admin", status: 403 };
  }

  return { ok: true };
}
