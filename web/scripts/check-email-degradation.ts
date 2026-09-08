/**
 * The app must keep working when it cannot send mail.
 *
 * Two different things send email here, and only one of them still needs a
 * provider:
 *
 *   - Cold emails leave from the user's own client through a compose link.
 *     No provider, nothing to break.
 *   - The app's own mail (password resets, payment notifications) goes through
 *     lib/emails/transactional.ts.
 *
 * The rule is that a provider outage degrades and never crashes: work that
 * already succeeded is kept, and the user is left somewhere they can continue
 * from. These checks hold the invariants that make that true.
 *
 *   npx tsx scripts/check-email-degradation.ts
 */
import fs from "fs";
import path from "path";
import {
  transactionalAdminRecipients,
  transactionalEmailAvailable,
} from "@/lib/emails/transactional";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvLocal();

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

function read(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

/** Every path that sends app mail has to go through the one guarded seam. */
function checkSingleSeam() {
  console.log("\n== one guarded seam ==");
  const offenders: string[] = [];
  const roots = ["src/app", "src/lib", "src/components"];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
      if (
        rel === "src/lib/emails/transactional.ts" ||
        rel === "src/lib/google/admin-gmail.ts"
      ) {
        continue;
      }
      if (/\bsendAdminGmail\s*\(/.test(fs.readFileSync(full, "utf8"))) {
        offenders.push(rel);
      }
    }
  };
  for (const root of roots) walk(path.join(process.cwd(), root));

  check(
    "nothing calls the provider directly",
    offenders.length === 0,
    offenders.join(", ") || "all sends go through sendTransactionalEmail",
  );

  const seam = read("src/lib/emails/transactional.ts");
  check(
    "the seam reports a missing provider separately from a failed send",
    seam.includes('"not_configured"') && seam.includes('"send_failed"'),
  );
  check(
    "the seam returns failures instead of throwing",
    /catch\s*\(error\)/.test(seam) && !/throw\s+/.test(seam),
  );
}

/** A password reset must survive the email not arriving. */
function checkPasswordReset() {
  console.log("\n== password reset ==");
  const mail = read("src/lib/auth/password-reset-email.ts");
  const auth = read("src/app/actions/auth.ts");
  const admin = read("src/app/actions/admin.ts");

  check(
    "the token is issued whether or not the mail goes out",
    mail.includes("delivered: sent.ok") && !/throw new PasswordResetEmail/.test(mail),
  );
  check(
    "a delivery failure does not reveal that the account exists",
    auth.includes("If that email exists, a password reset link has been emailed."),
  );
  check(
    "an admin gets the link back when it could not be emailed",
    admin.includes("recovery_url: reset.delivered ? null : reset.token.resetUrl"),
  );
}

/** Apply must finish even when the optional Gmail draft step cannot run. */
function checkPipeline() {
  console.log("\n== apply pipeline ==");
  const pipeline = read("src/app/actions/pipeline.ts");
  const stage = pipeline.slice(
    pipeline.indexOf("const result = await createGmailDrafts("),
    pipeline.indexOf("async function onChatGptStageCompleted"),
  );

  check("the gmail_drafts stage was found", stage.length > 0);
  check(
    "a Gmail failure no longer fails the run",
    !stage.includes('status: "failed"') && !stage.includes('"needs_manual"'),
  );
  check(
    "it is recorded as skipped and points at the Outreach tab",
    stage.includes('status: result.ok ? "completed" : "skipped"') &&
      stage.includes("Outreach tab"),
  );
  check(
    "the run still completes",
    stage.includes('status: "completed", current_stage: null'),
  );
}

/** The cold email path should need no provider at all. */
function checkColdEmailPath() {
  console.log("\n== cold email path ==");
  const manualSend = read("src/lib/emails/manual-send.ts");
  check(
    "compose links are built without any API call",
    !/fetch\(|googleapis|import .*google/.test(manualSend),
  );
  const artifacts = read("src/components/applications/application-artifacts.tsx");
  check(
    "the send UI does not depend on a Google connection",
    !/googleConnected/.test(artifacts),
  );
}

async function checkRuntime() {
  console.log("\n== runtime, against the real database ==");
  try {
    const status = await transactionalEmailAvailable();
    check(
      "availability can be read without throwing",
      typeof status.available === "boolean",
      `available=${status.available} · ${status.detail}`,
    );
  } catch (error) {
    check(
      "availability can be read without throwing",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const recipients = await transactionalAdminRecipients();
    check(
      "admin recipients resolve to a list, never an exception",
      Array.isArray(recipients),
      `${recipients.length} recipient(s)`,
    );
  } catch (error) {
    check(
      "admin recipients resolve to a list, never an exception",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function main() {
  checkSingleSeam();
  checkPasswordReset();
  checkPipeline();
  checkColdEmailPath();
  await checkRuntime();

  console.log(
    "\nNote: the send-failure branch is covered by construction — the seam has a" +
      "\nsingle try/catch that returns a value. Forcing a live failure would mean" +
      "\nsending real mail, so it is not exercised here.",
  );

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nall checks passed");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
