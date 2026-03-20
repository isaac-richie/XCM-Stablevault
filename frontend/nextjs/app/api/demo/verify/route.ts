import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(process.cwd(), "..", "..");

export async function POST() {
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", "xcm:verify-people"], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 4,
      env: process.env
    });

    return NextResponse.json({
      ok: true,
      stdout,
      stderr
    });
  } catch (error: any) {
    console.error("[demo/verify] verification command unavailable", error);
    return NextResponse.json({
      ok: true,
      degraded: true,
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
      error: error?.message || "Verification command failed"
    });
  }
}
