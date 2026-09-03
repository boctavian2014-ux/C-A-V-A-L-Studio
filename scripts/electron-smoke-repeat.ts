/**
 * Repeat `npm run smoke:electron` and keep every run's raw logs.
 * Usage: npx tsx scripts/electron-smoke-repeat.ts [count]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const COUNT = Math.max(1, Number.parseInt(process.argv[2] ?? "20", 10) || 20);
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const GATE_DIR = path.join(ROOT, ".cicd-artifacts", "shutdown-gate", STAMP);

function runOnce(runDir: string): Promise<number> {
  fs.mkdirSync(runDir, { recursive: true });
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "smoke:electron"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CAVAL_SMOKE_LOG_DIR: runDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      windowsHide: true,
    });
    let out = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      out += chunk;
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk: string) => {
      out += chunk;
      process.stderr.write(chunk);
    });
    child.once("exit", (code) => {
      fs.writeFileSync(path.join(runDir, "wrapper-combined.txt"), out, "utf8");
      fs.writeFileSync(
        path.join(runDir, "wrapper-exit.txt"),
        `wrapper-exit code=${code ?? "null"}\n`,
        "utf8"
      );
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  const results: Array<{ run: number; code: number }> = [];
  for (let i = 1; i <= COUNT; i++) {
    const label = String(i).padStart(2, "0");
    const runDir = path.join(GATE_DIR, `run-${label}`);
    console.log(`\n===== smoke ${label}/${COUNT} → ${runDir} =====`);
    const code = await runOnce(runDir);
    results.push({ run: i, code });
    console.log(`===== smoke ${label} wrapper-exit ${code} =====`);
  }
  const passed = results.filter((r) => r.code === 0).length;
  const failed = results.filter((r) => r.code !== 0);
  const summary = [
    `dir=${GATE_DIR}`,
    `count=${COUNT}`,
    `pass=${passed}`,
    `fail=${failed.length}`,
    ...results.map((r) => `run-${String(r.run).padStart(2, "0")} code=${r.code}`),
  ].join("\n");
  fs.writeFileSync(path.join(GATE_DIR, "summary.txt"), `${summary}\n`, "utf8");
  console.log(`\n${summary}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
