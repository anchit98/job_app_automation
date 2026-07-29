"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { DriveClient } from "@/lib/google/drive";
import {
  disconnectGoogle,
  getGoogleAuthClient,
  isGoogleConnected,
} from "@/lib/google/tokens";

export async function getGoogleConnectionStatus() {
  return { connected: await isGoogleConnected() };
}

export async function uploadDriveTestFile() {
  const auth = await getGoogleAuthClient();
  const drive = new DriveClient(auth);
  const rootId = await drive.ensureRootFolder();

  const content = `Job Application Automation - Phase 0 test file\nCreated: ${new Date().toISOString()}\n`;
  const fileId = await drive.uploadFile(
    Buffer.from(content, "utf8"),
    `phase0-test-${Date.now()}.txt`,
    "text/plain",
    rootId,
  );

  const webLink = await drive.getWebViewLink(fileId);

  await writeAuditLog("drive.test_upload", "drive", fileId, {
    file_id: fileId,
    root_id: rootId,
  });

  revalidatePath("/dashboard");
  return { fileId, webLink, rootId };
}

export async function disconnectGoogleAccount() {
  await disconnectGoogle();
  await writeAuditLog("google.disconnected", "google_tokens", "local");
  revalidatePath("/dashboard");
  return { ok: true };
}
