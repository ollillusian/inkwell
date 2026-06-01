#!/usr/bin/env node
/**
 * Smoke-test cron nudge endpoint. Loads CRON_SECRET from web/.env.local
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv();

const secret = process.env.CRON_SECRET;
const base = process.env.INKWELL_URL || "http://localhost:3001";

if (!secret) {
  console.error("Missing CRON_SECRET in web/.env.local");
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/cron/send-nudges`;

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
});

const body = await res.text();
console.log(res.status, body);

if (!res.ok) process.exit(1);
