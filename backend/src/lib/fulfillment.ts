
import { checkoutSessions, orderItems, orders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";

export async function alreadyPaid(polarOrderId?: string, checkoutId?: string) {
  if (polarOrderId) {
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.polarOrderId, polarOrderId))
      .limit(1);
    if (row?.status === "paid") return true;
  }
  if (checkoutId) {
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.polarCheckoutId, checkoutId))
      .limit(1);
    if (row?.status === "paid") return true;
  }
  return false;
}

export async function findSessionByPolarCheckoutId(
  polarCheckoutId: string,
): Promise<{ id: string; userId: string } | null> {
  const [row] = await db
    .select({ id: checkoutSessions.id, userId: checkoutSessions.userId })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.polarCheckoutId, polarCheckoutId))
    .limit(1);
  return row ?? null;
}

export async function fulfillCheckoutSession(
  sessionId: string,
  polarOrderId: string | undefined,
  checkoutId: string | undefined,
): Promise<boolean | "duplicate"> {
  return await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, sessionId))
      .for("update");

    const effectiveCheckoutId = checkoutId ?? session?.polarCheckoutId ?? undefined;
    if (polarOrderId || effectiveCheckoutId) {
      let duplicateExists = false;
      if (polarOrderId) {
        const [row] = await tx
          .select()
          .from(orders)
          .where(eq(orders.polarOrderId, polarOrderId))
          .limit(1);
        if (row?.status === "paid") duplicateExists = true;
      }
      if (!duplicateExists && effectiveCheckoutId) {
        const [row] = await tx
          .select()
          .from(orders)
          .where(eq(orders.polarCheckoutId, effectiveCheckoutId))
          .limit(1);
        if (row?.status === "paid") duplicateExists = true;
      }
      if (duplicateExists) {
        console.info("[fulfillment] duplicate detected inside tx (pre-insert)", {
          polarOrderId: polarOrderId ?? null,
          polarCheckoutId: effectiveCheckoutId ?? null,
          sessionExists: Boolean(session),
        });
        if (session) {
          await tx.delete(checkoutSessions).where(eq(checkoutSessions.id, sessionId));
        }
        return "duplicate";
      }
    }

    if (!session) return false;

    let order;
    try {
      [order] = await tx
        .insert(orders)
        .values({
          userId: session.userId,
          status: "paid",
          totalCents: session.totalCents,
          polarCheckoutId: checkoutId ?? session.polarCheckoutId ?? null,
          ...(polarOrderId ? { polarOrderId } : {}),
        })
        .returning();
    } catch (insertErr) {
      const code = (insertErr as { code?: string })?.code;
      if (code === "23505") {
        console.info("[fulfillment] duplicate detected inside tx (23505)", {
          polarOrderId: polarOrderId ?? null,
          polarCheckoutId: checkoutId ?? null,
        });
        const stillPaid = await alreadyPaid(polarOrderId, checkoutId);
        if (stillPaid) {
          if (session) {
            await tx.delete(checkoutSessions).where(eq(checkoutSessions.id, sessionId));
          }
          return "duplicate";
        }
      }
      throw insertErr;
    }

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

    await tx.delete(checkoutSessions).where(eq(checkoutSessions.id, sessionId));

    console.info("[fulfillment] fulfilled checkout", {
      orderId: order.id,
      userId: session.userId,
      totalCents: session.totalCents,
      polarOrderId: polarOrderId ?? null,
      polarCheckoutId: checkoutId ?? session.polarCheckoutId ?? null,
    });

    return true;
  });
}

export async function findOrderIdByPolarCheckoutId(
  polarCheckoutId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.polarCheckoutId, polarCheckoutId))
    .limit(1);
  return row?.id ?? null;
}
