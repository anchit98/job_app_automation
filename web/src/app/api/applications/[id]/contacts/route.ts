import { NextResponse } from "next/server";
import { listContacts, getApplicationById } from "@/lib/db/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const application = getApplicationById(id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const contacts = listContacts(id);
  return NextResponse.json({ contacts });
}
