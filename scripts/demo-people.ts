import { execSync } from "child_process";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const waitMs = Number(process.env.DEMO_VERIFY_WAIT_MS || "15000");

  console.log("Step 1/2: teleporting PAS from Asset Hub Paseo to People Paseo...");
  execSync("npm run xcm:teleport-assets", { stdio: "inherit" });

  console.log(`Step 2/2: waiting ${waitMs}ms before destination verification...`);
  await sleep(waitMs);
  execSync("npm run xcm:verify-people", { stdio: "inherit" });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
