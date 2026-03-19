import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const vaultAddress = process.env.VAULT_ADDRESS || "";
  if (!vaultAddress) throw new Error("Missing VAULT_ADDRESS");

  const amount = process.env.NATIVE_FUND_AMOUNT || "0.01";
  const tx = await signer.sendTransaction({
    to: vaultAddress,
    value: ethers.utils.parseEther(amount)
  });
  await tx.wait();
  console.log(`Funded vault ${vaultAddress} with ${amount} native`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
