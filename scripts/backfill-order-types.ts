// Back‑fill script for order_type values
// Run with: `node scripts/backfill-order-types.ts`
import { getPublicClient } from "@/lib/bookings.functions"; // re‑use Supabase client helper
import { ORDER_TYPE_VALUES } from "@/lib/order-types";

async function backfill() {
  const supabase = getPublicClient();
  if (!supabase) {
    console.error("Supabase client not configured.");
    process.exit(1);
  }

  // Fetch rows where order_type is null or not a recognized value
  const { data, error } = await supabase
    .from("bookings")
    .select("code, order_type")
    .neq("order_type", null);

  if (error) {
    console.error("Failed to fetch bookings:", error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("No bookings need back‑filling.");
    return;
  }

  const updates: any[] = [];
  for (const row of data as any[]) {
    const normalized = ORDER_TYPE_VALUES.includes(row.order_type as any)
      ? row.order_type
      : "DINE_IN"; // fallback to default
    if (normalized !== row.order_type) {
      updates.push({ code: row.code, order_type: normalized });
    }
  }

  if (updates.length === 0) {
    console.log("All order_type values already valid.");
    return;
  }

  // Perform upserts (on conflict code)
  const { error: upsertErr } = await supabase
    .from("bookings")
    .upsert(updates, { onConflict: "code" })
    .select();

  if (upsertErr) {
    console.error("Failed to upsert updates:", upsertErr);
    process.exit(1);
  }

  console.log(`Back‑filled ${updates.length} bookings.");
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
