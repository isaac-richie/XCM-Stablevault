import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

const DESTINATION_HEX = process.env.DESTINATION_HEX || "";
const MESSAGE_HEX = process.env.MESSAGE_HEX || "";
const TEMPLATE_HEX = process.env.TEMPLATE_HEX || "";
const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "";

async function main() {
  if (!DESTINATION_HEX) throw new Error("Missing DESTINATION_HEX");
  if (!MESSAGE_HEX) throw new Error("Missing MESSAGE_HEX");
  if (!VAULT_ADDRESS) throw new Error("Missing VAULT_ADDRESS");

  const [signer] = await ethers.getSigners();
  const vault = new ethers.Contract(
    VAULT_ADDRESS,
    [
      "function setAllowedMessageHash(bytes32,bool) external",
      "function setAllowedDestinationHash(bytes32,bool) external",
      "function setAllowedTemplate(bytes32,uint256,bool) external",
      "function sendXcm(bytes destination, bytes message) external returns (bool)",
      "function allowAllMessages() external view returns (bool)"
    ],
    signer
  );

  const messageHash = ethers.utils.keccak256(MESSAGE_HEX);
  const destinationHash = ethers.utils.keccak256(DESTINATION_HEX);

  const allowAll = await vault.allowAllMessages().catch(() => false);
  if (!allowAll) {
    const txAllow = await vault.setAllowedMessageHash(messageHash, true);
    console.log(`Allowlist tx: ${txAllow.hash}`);
    await txAllow.wait();

    const txDest = await vault.setAllowedDestinationHash(destinationHash, true);
    console.log(`Destination allowlist tx: ${txDest.hash}`);
    await txDest.wait();

    if (TEMPLATE_HEX) {
      const templateHash = ethers.utils.keccak256(TEMPLATE_HEX);
      const templateLength = (TEMPLATE_HEX.length - 2) / 2;
      const txTpl = await vault.setAllowedTemplate(templateHash, templateLength, true);
      console.log(`Template allowlist tx: ${txTpl.hash}`);
      await txTpl.wait();
    }
  }

  const tx = await vault.sendXcm(DESTINATION_HEX, MESSAGE_HEX);
  console.log(`sendXcm tx: ${tx.hash}`);
  await tx.wait();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
