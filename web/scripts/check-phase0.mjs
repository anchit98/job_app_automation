import Database from "better-sqlite3";

const db = new Database("data/app.db");

const profile = db
  .prepare("SELECT full_name, drive_root_id FROM profiles WHERE id = 1")
  .get();
const resume = db
  .prepare("SELECT length(content) AS len FROM master_resume WHERE id = 1")
  .get();
const demo = db
  .prepare(
    "SELECT status FROM prompt_runs WHERE kind = 'hello_world' AND status = 'completed' LIMIT 1",
  )
  .get();
const google = db
  .prepare("SELECT status, scope FROM google_tokens WHERE id = 1")
  .get();
const driveUpload = db
  .prepare(
    "SELECT action, payload FROM audit_log WHERE action = 'drive.test_upload' ORDER BY created_at DESC LIMIT 1",
  )
  .get();

const checklist = {
  profile_saved: Boolean(profile?.full_name),
  master_resume_saved: Boolean(resume?.len && resume.len > 2),
  google_connected: google?.status === "active",
  demo_completed: demo?.status === "completed",
  drive_test_upload: Boolean(driveUpload),
  drive_root_id: profile?.drive_root_id ?? null,
  drive_upload: driveUpload?.payload
    ? JSON.parse(driveUpload.payload)
    : null,
};

checklist.phase0_complete =
  checklist.profile_saved &&
  checklist.master_resume_saved &&
  checklist.google_connected &&
  checklist.demo_completed &&
  checklist.drive_test_upload;

console.log(JSON.stringify(checklist, null, 2));
db.close();
