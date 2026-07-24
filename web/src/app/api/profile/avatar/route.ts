import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { getProfileAvatarRow } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const avatar = await getProfileAvatarRow(user.id);
  if (!avatar) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = Buffer.from(avatar.data, "base64");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": avatar.mime,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(body.length),
    },
  });
}
