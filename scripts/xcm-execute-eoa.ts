import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

const MESSAGE_HEX = process.env.MESSAGE_HEX || "";

async function main() {
  if (!MESSAGE_HEX) throw new Error("Missing MESSAGE_HEX");

  const [signer] = await ethers.getSigners();
  const precompile = new ethers.Contract(
    "0x00000000000000000000000000000000000a0000",
    [
      "function weighMessage(bytes message) view returns (uint64 refTime, uint64 proofSize)",
      "function execute(bytes message, tuple(uint64 refTime, uint64 proofSize) weight)"
    ],
    signer
  );

  const weight = await precompile.weighMessage(MESSAGE_HEX);
  const tx = await precompile.execute(MESSAGE_HEX, weight, { gasLimit: 500000 });
  console.log(`execute tx: ${tx.hash}`);
  await tx.wait();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
