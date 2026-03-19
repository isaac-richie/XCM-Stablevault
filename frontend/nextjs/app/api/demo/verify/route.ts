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
    return NextResponse.json(
      {
        ok: false,
        stdout: error?.stdout || "",
        stderr: error?.stderr || "",
        error: error?.message || "Verification command failed"
      },
      { status: 500 }
    );
  }
}
