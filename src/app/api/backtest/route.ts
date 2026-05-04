import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5분

type Params = {
  start: string;
  end: string;
  capital: number;
  freq: "monthly" | "quarterly";
  positions: number;
  minScore: number;
  minMos: number;
  txCost: number;
};

function validate(body: unknown): Params | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid body" };
  const b = body as Record<string, unknown>;
  const start = String(b.start ?? "");
  const end = String(b.end ?? "");
  const capital = Number(b.capital);
  const freq = String(b.freq ?? "monthly");
  const positions = Number(b.positions);
  const minScore = Number(b.minScore);
  const minMos = Number(b.minMos);
  const txCost = Number(b.txCost ?? 0.004);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: "invalid start date" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return { error: "invalid end date" };
  if (start >= end) return { error: "start must be before end" };
  if (!Number.isFinite(capital) || capital < 1_000_000)
    return { error: "capital must be ≥ 1,000,000" };
  if (freq !== "monthly" && freq !== "quarterly")
    return { error: "freq must be monthly or quarterly" };
  if (!Number.isInteger(positions) || positions < 1 || positions > 50)
    return { error: "positions must be 1~50" };
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100)
    return { error: "minScore must be 0~100" };
  if (!Number.isFinite(minMos) || minMos < -1 || minMos > 1)
    return { error: "minMos must be -1~1" };
  if (!Number.isFinite(txCost) || txCost < 0 || txCost > 0.1)
    return { error: "txCost must be 0~0.1" };

  return { start, end, capital, freq: freq as "monthly" | "quarterly", positions, minScore, minMos, txCost };
}

function runBacktest(p: Params): Promise<{ id: number }> {
  const scriptsDir = path.resolve(process.cwd(), "scripts");
  const args = [
    "run", "python", "-m", "analysis.backtest", "--save",
    "--start", p.start,
    "--end", p.end,
    "--capital", String(p.capital),
    "--freq", p.freq,
    "--positions", String(p.positions),
    "--min-score", String(p.minScore),
    "--min-mos", String(p.minMos),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn("uv", args, {
      cwd: scriptsDir,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`backtest exited ${code}: ${stderr.slice(-500)}`));
        return;
      }
      // 마지막 출력에서 "saved as backtest_runs.id = N" 추출
      const m = stdout.match(/backtest_runs\.id\s*=\s*(\d+)/);
      if (!m) {
        reject(new Error(`could not parse backtest id from output: ${stdout.slice(-500)}`));
        return;
      }
      resolve({ id: Number(m[1]) });
    });
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validate(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const { id } = await runBacktest(v);
    return NextResponse.json({ id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
