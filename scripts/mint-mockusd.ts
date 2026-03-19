import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const mockAddress = process.env.MOCKUSD_ADDRESS || "";
  if (!mockAddress) throw new Error("Missing MOCKUSD_ADDRESS");

  const to = process.env.MINT_TO || deployer.address;
  const amountRaw = process.env.MINT_AMOUNT || "1000000000000000000000";

  const mock = await ethers.getContractAt("MockUSD", mockAddress);
  const tx = await mock.mint(to, amountRaw);
  await tx.wait();
  console.log(`Minted ${amountRaw} MockUSD to ${to}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
