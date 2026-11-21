import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** Service-role client, or null when env is not configured (local dev). */
function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

export type InsertOutcome = "inserted" | "duplicate" | "skipped";

/** Postgres unique violation means a retry of a request we already stored. */
export function outcomeFor(error: { code?: string } | null): InsertOutcome | "error" {
  if (!error) return "inserted";
  return error.code === "23505" ? "duplicate" : "error";
}

export async function insertRow(table: "orders" | "scans", row: Record<string, unknown>): Promise<InsertOutcome> {
  const db = getClient();
  if (!db) {
    // In production a missing database must fail loudly: a "sent" order nobody receives is the worst outcome.
    if (process.env.NODE_ENV === "production") throw new Error("Supabase is not configured");
    console.warn(`[skin-check] Supabase not configured (dev); ${table} row not stored`, { id: row.id });
    return "skipped";
  }
  const { error } = await db.from(table).insert(row);
  const outcome = outcomeFor(error);
  if (outcome === "error") throw new Error(`insert into ${table} failed: ${error?.message}`);
  return outcome;
}

export async function markScanOrdered(id: string): Promise<void> {
  const db = getClient();
  if (!db) return;
  const { error } = await db.from("scans").update({ ordered: true }).eq("id", id);
  if (error) console.warn("[skin-check] could not mark scan as ordered", error.message);
}
