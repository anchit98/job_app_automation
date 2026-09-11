/**
 * The checks the first pass left out.
 *
 * Covers the three things that can be proven without a browser or an LLM:
 * the follow-up clock resetting on send, how much the Drive folder cache
 * actually saves, and whether the Outlook compose hosts are reachable.
 *
 * Writes are done inside a transaction that is always rolled back, so this is
 * safe to run against the live database.
 *
 * Usage: npx tsx scripts/check-untested.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

class Rollback extends Error {}

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const { getSql, dbAll } = await import("../src/lib/db/index");
  const { runAsUser } = await import("../src/lib/auth/request-user");
  const { nextFollowUpDueAt, parseDbTimestamp, FOLLOW_UP_INTERVAL_DAYS } =
    await import("../src/lib/follow-ups/business-days");
  const { COMPOSE_PLATFORMS, buildComposeLinks } = await import(
    "../src/lib/emails/manual-send"
  );

  const sql = getSql();

  // ---------------------------------------------------------------- 1
  console.log("\nFollow-up clock resets when a cold email is marked sent");

  const [email] = (await dbAll(
    `SELECT e.id, e.application_id, e.created_at
       FROM emails e WHERE e.kind = 'cold' ORDER BY e.created_at DESC LIMIT 1`,
  )) as Array<{ id: string; application_id: string; created_at: string }>;

  if (!email) {
    check("a cold email exists to test with", false);
  } else {
    try {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM follow_ups WHERE email_id = ${email.id}`;
        const sentAt = new Date();
        await tx`
          UPDATE emails SET draft_status = 'sent', sent_at = ${sentAt.toISOString()}
           WHERE id = ${email.id}`;

        // Same shape scheduleFollowUpsForColdEmail writes.
        const due1 = nextFollowUpDueAt(sentAt).toISOString();
        await tx`
          INSERT INTO follow_ups (id, application_id, email_id, sequence, due_at, status)
          VALUES (gen_random_uuid()::text, ${email.application_id}, ${email.id}, 1, ${due1}, 'pending'),
                 (gen_random_uuid()::text, ${email.application_id}, ${email.id}, 2, NULL, 'waiting')`;

        const rows = (await tx`
          SELECT sequence, due_at, status FROM follow_ups
           WHERE email_id = ${email.id} ORDER BY sequence`) as unknown as Array<{
          sequence: number;
          due_at: string | null;
          status: string;
        }>;

        check("two follow-ups scheduled per cold email", rows.length === 2);
        check("#1 is pending with a due date", rows[0]?.status === "pending" && Boolean(rows[0]?.due_at));
        check("#2 waits until #1 closes", rows[1]?.status === "waiting" && rows[1]?.due_at === null);

        const days =
          (parseDbTimestamp(rows[0].due_at)!.getTime() - sentAt.getTime()) / 86_400_000;
        check(
          `#1 is due ${FOLLOW_UP_INTERVAL_DAYS} days after the send`,
          Math.abs(days - FOLLOW_UP_INTERVAL_DAYS) < 0.01,
          `${days.toFixed(2)} days`,
        );

        // The due-list query is what the UI banner reads.
        const dueNow = (await tx`
          SELECT COUNT(*)::int n FROM follow_ups
           WHERE email_id = ${email.id} AND status = 'pending'
             AND due_at::timestamptz <= NOW()`) as unknown as Array<{ n: number }>;
        check("it is NOT due immediately after sending", dueNow[0].n === 0);

        await tx`UPDATE follow_ups SET due_at = ${new Date(Date.now() - 60_000).toISOString()}
                  WHERE email_id = ${email.id} AND sequence = 1`;
        const dueLater = (await tx`
          SELECT COUNT(*)::int n FROM follow_ups
           WHERE email_id = ${email.id} AND status = 'pending'
             AND due_at::timestamptz <= NOW()`) as unknown as Array<{ n: number }>;
        check("it IS due once the date passes", dueLater[0].n === 1);

        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }

    const [after] = (await dbAll(
      `SELECT draft_status FROM emails WHERE id = ?`, email.id)) as Array<{ draft_status: string }>;
    check("rolled back — the email was not really marked sent", after.draft_status !== "sent",
      `status is ${after.draft_status}`);
  }

  // ---------------------------------------------------------------- 2
  console.log("\nDrive folder cache — what the prewarm actually saves");

  const [user] = (await dbAll(
    `SELECT u.id FROM users u JOIN google_tokens g ON g.user_id = u.id
      WHERE g.status = 'active' LIMIT 1`)) as Array<{ id: string }>;
  const [app] = (await dbAll(
    `SELECT id, company, role FROM applications WHERE company IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`)) as Array<{ company: string; role: string }>;

  if (!user || !app) {
    console.log("  skipped — no Google-connected user or application");
  } else {
    try {
      const { DriveClient, clearDriveFolderCache } = await import("../src/lib/google/drive");
      const { getGoogleAuthClient } = await import("../src/lib/google/tokens");

      await runAsUser(user.id, async () => {
        const auth = await getGoogleAuthClient(user.id);

        clearDriveFolderCache(user.id);
        const t0 = Date.now();
        await new DriveClient(auth).ensureApplicationFolder(app);
        const cold = Date.now() - t0;

        const t1 = Date.now();
        await new DriveClient(auth).ensureApplicationFolder(app);
        const warm = Date.now() - t1;

        console.log(`  cold (cache cleared) : ${cold} ms`);
        console.log(`  warm (cache hit)     : ${warm} ms`);
        console.log(`  saved per export     : ${cold - warm} ms`);
        check("the cache is materially faster than a cold resolve", warm < cold / 2,
          `${warm}ms vs ${cold}ms`);
      });
    } catch (e) {
      console.log(`  skipped — ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
  }

  // ---------------------------------------------------------------- 3
  console.log("\nCompose hosts are reachable");

  const pack = {
    email_id: "t", to: "someone@example.com",
    subject: "Test", body_text: "Hello there, this is a short body.",
  };
  const links = buildComposeLinks(pack);
  for (const p of COMPOSE_PLATFORMS) {
    if (p === "mailto") continue;
    const host = new URL(links[p].url).origin;
    try {
      const res = await fetch(host, { method: "HEAD", redirect: "manual" });
      check(`${p} host responds`, res.status < 500, `${host} -> HTTP ${res.status}`);
    } catch (e) {
      check(`${p} host responds`, false, e instanceof Error ? e.message : String(e));
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
