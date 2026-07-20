import { NextResponse } from "next/server";
import { enqueueDueFollowUpPrompts } from "@/lib/follow-ups/enqueue";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await enqueueDueFollowUpPrompts();
  return NextResponse.json(result);
}
