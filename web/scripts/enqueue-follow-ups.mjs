#!/usr/bin/env node
/**
 * POST to the local cron endpoint to enqueue due follow-up prompts.
 * Usage: npm run cron:follow-ups
 * Optional: CRON_SECRET in .env.local → Authorization: Bearer <secret>
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.env.PORT ?? "3000";
const base = process.env.APP_URL ?? `http://localhost:${port}`;
const url = `${base}/api/cron/enqueue-follow-up-prompts`;

let secret = process.env.CRON_SECRET;
if (!secret) {
  try {
    const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env.local");
    const text = readFileSync(envPath, "utf8");
    const match = text.match(/^CRON_SECRET=(.+)$/m);
    if (match) secret = match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // no .env.local
  }
}

const headers = { "Content-Type": "application/json" };
if (secret) headers.Authorization = `Bearer ${secret}`;

const res = await fetch(url, { method: "POST", headers });
const body = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${body}`);
  process.exit(1);
}
console.log(body);
