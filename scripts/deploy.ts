import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function setEnvValue(filePath: string, key: string, value: string) {
  let content = "";
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf8");
  }
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const nextLines: string[] = [];
  let updated = false;
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      nextLines.push(`${key}=${value}`);
      updated = true;
    } else {
      nextLines.push(line);
    }
  }
  if (!updated) {
    nextLines.push(`${key}=${value}`);
  }
  fs.writeFileSync(filePath, nextLines.join("\n") + "\n");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const baseGasPrice = await deployer.getGasPrice();
  const gasPrice = baseGasPrice.mul(2);
  const startNonce = await deployer.getTransactionCount("pending");

  const WPAS = await ethers.getContractFactory("WPAS");
  const wpas = await WPAS.deploy({ gasPrice, nonce: startNonce });
  await wpas.deployed();
  console.log(`WPAS deployed: ${wpas.address}`);

  const MockUSD = await ethers.getContractFactory("MockUSD");
  const mockUsd = await MockUSD.deploy({ gasPrice, nonce: startNonce + 1 });
  await mockUsd.deployed();
  console.log(`MockUSD deployed: ${mockUsd.address}`);

  const aiOperator = deployer.address;
  const Vault = await ethers.getContractFactory("XCMStableVault");
  const vault = await Vault.deploy(wpas.address, mockUsd.address, aiOperator, { gasPrice, nonce: startNonce + 2 });
  await vault.deployed();
  console.log(`XCMStableVault deployed: ${vault.address}`);

  const txMinter = await mockUsd.setMinter(vault.address, true, { gasPrice, nonce: startNonce + 3 });
  await txMinter.wait();
  console.log(`MockUSD minter enabled for vault: ${vault.address}`);

  const envTargets = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "frontend/nextjs/.env.local")
  ];

  for (const envPath of envTargets) {
    setEnvValue(envPath, "WPAS_ADDRESS", wpas.address);
    setEnvValue(envPath, "MOCKUSD_ADDRESS", mockUsd.address);
    setEnvValue(envPath, "COLLATERAL_ADDRESS", wpas.address);
    setEnvValue(envPath, "VAULT_ADDRESS", vault.address);
    setEnvValue(envPath, "NEXT_PUBLIC_WPAS_ADDRESS", wpas.address);
    setEnvValue(envPath, "NEXT_PUBLIC_MOCKUSD_ADDRESS", mockUsd.address);
    setEnvValue(envPath, "NEXT_PUBLIC_VAULT_ADDRESS", vault.address);
    console.log(`Updated ${path.relative(process.cwd(), envPath) || ".env.local"} with WPAS_ADDRESS, MOCKUSD_ADDRESS, COLLATERAL_ADDRESS, VAULT_ADDRESS`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
