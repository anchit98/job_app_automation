/**
 * Where the master resume currently in use came from.
 *
 * Apply always copies one Doc, but that Doc can arrive by four different
 * routes. Users kept asking "which resume is actually being used?", so the
 * answer is stored on master_resume (source / source_label / source_ref) and
 * rendered from this one vocabulary everywhere it is shown.
 */
import type { MasterResumeSource } from "@/lib/db/types";

export const MASTER_SOURCE_LABELS: Record<MasterResumeSource, string> = {
  builder: "Built in the app",
  device_upload: "Uploaded from this device",
  drive_file: "Imported from Drive",
  google_doc: "Linked Google Doc",
  manual: "Entered manually",
};

export const MASTER_SOURCE_ICONS: Record<MasterResumeSource, string> = {
  builder: "draw",
  device_upload: "upload_file",
  drive_file: "add_to_drive",
  google_doc: "description",
  manual: "edit_note",
};

/** One line describing the master in use — "Built in the app · Technology CV". */
export function describeMasterSource(
  source: MasterResumeSource | null | undefined,
  label: string | null | undefined,
): string {
  if (!source) return "Source not recorded (synced before source tracking)";
  const head = MASTER_SOURCE_LABELS[source];
  const tail = label?.trim();
  return tail ? `${head} · ${tail}` : head;
}
