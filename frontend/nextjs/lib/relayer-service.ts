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
