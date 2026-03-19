import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const vaultAddress = process.env.VAULT_ADDRESS || "";
  const mockAddress = process.env.MOCKUSD_ADDRESS || "";
  if (!vaultAddress) throw new Error("Missing VAULT_ADDRESS");
  if (!mockAddress) throw new Error("Missing MOCKUSD_ADDRESS");

  const amountRaw = process.env.DEPOSIT_AMOUNT || "100000000000000000000";

  const mock = await ethers.getContractAt("MockUSD", mockAddress);
  const vault = await ethers.getContractAt("XCMStableVault", vaultAddress);

  const txApprove = await mock.approve(vaultAddress, amountRaw);
  await txApprove.wait();

  const txDeposit = await vault.depositCollateral(amountRaw);
  await txDeposit.wait();

  console.log(`Deposited ${amountRaw} MockUSD into vault ${vaultAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
