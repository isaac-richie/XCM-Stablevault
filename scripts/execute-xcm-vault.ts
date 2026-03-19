import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

async function main() {
  const [signer] = await ethers.getSigners();
  const vaultAddress = process.env.VAULT_ADDRESS || "";
  const messageHex = process.env.MESSAGE_HEX || "";
  if (!vaultAddress) throw new Error("Missing VAULT_ADDRESS");
  if (!messageHex) throw new Error("Missing MESSAGE_HEX");

  const vault = new ethers.Contract(
    vaultAddress,
    [
      "function setAllowedMessageHash(bytes32,bool) external",
      "function allowAllMessages() external view returns (bool)",
      "function executeXcm(bytes message) external returns (bool)"
    ],
    signer
  );

  const messageHash = ethers.utils.keccak256(messageHex);
  const allowAll = await vault.allowAllMessages().catch(() => false);
  if (!allowAll) {
    const txAllow = await vault.setAllowedMessageHash(messageHash, true);
    console.log(`Allowlist tx: ${txAllow.hash}`);
    await txAllow.wait();
  }

  const tx = await vault.executeXcm(messageHex);
  console.log(`executeXcm tx: ${tx.hash}`);
  await tx.wait();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
