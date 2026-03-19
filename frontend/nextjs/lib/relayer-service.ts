import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(process.cwd(), "..", "..");

export async function runRepoScript(
  command: string,
  envOverrides: Record<string, string>
) {
  const { stdout, stderr } = await execFileAsync("npm", ["run", command], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 4,
    env: {
      ...process.env,
      ...envOverrides
    }
  });

  return { stdout, stderr };
}

export function parseTeleportOutput(stdout: string) {
  const txHash =
    stdout.match(/Extrinsic hash:\s*(0x[a-fA-F0-9]+)/)?.[1] ||
    stdout.match(/tx hash:\s*(0x[a-fA-F0-9]+)/i)?.[1];
  const blockHash =
    stdout.match(/Finalized in block\s*(0x[a-fA-F0-9]+)/)?.[1] ||
    stdout.match(/Included in block\s*(0x[a-fA-F0-9]+)/)?.[1];
  const eventsLine = stdout.match(/Events:\s*(.+)/)?.[1];
  const events = eventsLine ? eventsLine.split(",").map((item) => item.trim()) : [];

  return {
    txHash,
    blockHash,
    events
  };
}

export function parseVerifyOutput(stdout: string) {
  const lines = stdout.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim().startsWith("{"));
  if (startIndex === -1) {
    throw new Error("Verification output did not contain JSON");
  }
  const jsonText = lines.slice(startIndex).join("\n").trim();
  return JSON.parse(jsonText);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
