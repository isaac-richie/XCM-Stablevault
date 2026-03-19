import { BrowserProvider } from "ethers";
import { adminRequestTypes, stableVaultDomain } from "./eip712";

export async function signAdminPayload(
  walletProvider: BrowserProvider,
  account: string,
  action: string
) {
  const nonceResponse = await fetch(`/api/actions/nonce?requester=${account}`);
  const noncePayload = await nonceResponse.json();
  if (!nonceResponse.ok || !noncePayload.ok) {
    throw new Error(noncePayload.error || "Unable to issue admin nonce");
  }

  const nonce = noncePayload.nonce as string;
  const timestamp = Date.now();
  const signer = await walletProvider.getSigner();
  const signature = await signer.signTypedData(stableVaultDomain, adminRequestTypes, {
    action,
    requester: account,
    timestamp,
    nonce
  });
  return { action, requester: account, timestamp, nonce, signature };
}
