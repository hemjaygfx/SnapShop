import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { checkoutSessions, orderItems, orders } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

function usage() {
  console.error(
    "Usage: npx tsx scripts/recover-checkout.ts <polar_checkout_id> [<polar_checkout_id2> ...]\n\n" +
      "Converts one or more checkout_sessions rows (matched by polar_checkout_id) into paid\n" +
      "orders + order_items using the same TX as the Polar webhook. Deletes the session on success.",
  );
}

async function recoverOne(
  tx: ReturnType<typeof drizzle<typeof import("../src/db/schema.js")>>,
  polarCheckoutId: string,
) {
  const [session] = await tx
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.polarCheckoutId, polarCheckoutId))
    .for("update");

  if (!session) {
    return { polarCheckoutId, ok: false, reason: "no checkout_session row" };
  }

  const [order] = await tx
    .insert(orders)
    .values({
      userId: session.userId,
      status: "paid",
      totalCents: session.totalCents,
      polarCheckoutId: session.polarCheckoutId ?? null,
    })
    .returning();

  if (session.lines.length) {
    await tx.insert(orderItems).values(
      session.lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
    );
  }

  await tx.delete(checkoutSessions).where(eq(checkoutSessions.id, session.id));

  return {
    ok: true,
    polarCheckoutId,
    orderId: order.id,
    userId: session.userId,
    totalCents: session.totalCents,
    lines: session.lines.length,
  };
}

async function main() {
  const polarIds = process.argv.slice(2).filter((x) => x && x.trim().length > 0);
  if (polarIds.length === 0) {
    usage();
    process.exit(2);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    for (const id of polarIds) {
      const result = await db.transaction(async (tx) => recoverOne(tx as any, id));
      console.log(JSON.stringify(result));
    }
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
