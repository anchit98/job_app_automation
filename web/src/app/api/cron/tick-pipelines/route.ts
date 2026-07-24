import { NextResponse } from "next/server";
import { tickGlobalPipelines } from "@/app/actions/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron / external heartbeat so pipelines continue without an open browser tab. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await tickGlobalPipelines();
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
