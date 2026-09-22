
import type { Request, Response } from "express";
import { getEnv } from "../lib/env.js";
import { checkoutSessions, orderItems, orders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { Webhook } from "standardwebhooks";

function headerString(headers: Request["headers"], name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function checkoutSessionIdFromMetadata(order: Record<string, unknown>) {
  const metadata = order.metadata;
  if (!metadata || typeof metadata !== "object") return undefined;
  const sessionId = (metadata as Record<string, unknown>).checkout_session_id;
  return typeof sessionId === "string" ? sessionId : undefined;
}

async function alreadyPaid(polarOrderId?: string, checkoutId?: string) {
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

async function fulfillCheckoutSession(
  sessionId: string,
  polarOrderId: string | undefined,
  checkoutId: string | undefined,
) {
  return await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, sessionId))
      .for("update");

    if (!session) return false;

    const [order] = await tx
      .insert(orders)
      .values({
        userId: session.userId,
        status: "paid",
        totalCents: session.totalCents,
        polarCheckoutId: checkoutId ?? session.polarCheckoutId ?? null,
        ...(polarOrderId ? { polarOrderId } : {}),
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

    await tx.delete(checkoutSessions).where(eq(checkoutSessions.id, sessionId));

    console.info("[polar-webhook] fulfilled checkout", {
      orderId: order.id,
      userId: session.userId,
      totalCents: session.totalCents,
      polarOrderId: polarOrderId ?? null,
      polarCheckoutId: checkoutId ?? session.polarCheckoutId ?? null,
    });

    return true;
  });
}

export async function polarWebhookHandler(req: Request, res: Response) {
  const env = getEnv();

  // Fast-fail 503 before any parsing if the webhook secret is missing — this
  // is an operator error, not a webhook payload error. Reporting 4xx would
  // falsely make Polar think the payload was bad and trigger unnecessary
  // retries against a broken config.
  if (!env.POLAR_WEBHOOK_SECRET) {
    res.status(503).send("Polar webhooks not configured");
    return;
  }

  try {
    const raw = req.body instanceof Buffer ? req.body : Buffer.from(String(req.body));
    const wh = new Webhook(Buffer.from(env.POLAR_WEBHOOK_SECRET, "utf8").toString("base64"));

    const id = headerString(req.headers, "webhook-id");
    const ts = headerString(req.headers, "webhook-timestamp");
    const sig = headerString(req.headers, "webhook-signature");

    if (!id || !ts || !sig) {
      res.status(400).json({ error: "Missing webhook headers" });
      return;
    }

    wh.verify(raw, { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig });

    const event = JSON.parse(raw.toString("utf8")) as {
      type: string;
      data?: Record<string, unknown>;
    };

    if (event.type === "order.paid" && event.data) {
      const data = event.data;
      const polarOrderId = typeof data.id === "string" ? data.id : undefined;
      const checkoutId = typeof data.checkout_id === "string" ? data.checkout_id : undefined;

      if (await alreadyPaid(polarOrderId, checkoutId)) {
        res.json({ ok: true, duplicate: true });
        return;
      }

      let sessionId = checkoutSessionIdFromMetadata(data);

      // Fallback: if metadata.checkout_session_id was dropped / empty, but we
      // received Polar's checkout_id (always present on order.paid), reverse-
      // match our local checkout_session via polar_checkout_id.
      if (!sessionId && checkoutId) {
        try {
          const [row] = await db
            .select({ id: checkoutSessions.id })
            .from(checkoutSessions)
            .where(eq(checkoutSessions.polarCheckoutId, checkoutId))
            .limit(1);
          if (row) sessionId = row.id;
        } catch (dbErr) {
          console.error(
            "Polar order.paid: DB lookup for fallback checkout_session failed",
            { checkoutId, err: dbErr },
          );
          res.status(500).json({ error: "Internal server error" });
          return;
        }
      }

      if (sessionId) {
        const ok = await fulfillCheckoutSession(sessionId, polarOrderId, checkoutId);

        if (ok) {
          res.json({ ok: true });
          return;
        }

        if (await alreadyPaid(polarOrderId, checkoutId)) {
          res.json({ ok: true, duplicate: true });
          return;
        }

        console.error("Polar order.paid: could not fulfill checkout session", {
          sessionId,
          checkoutId,
        });

        res.status(500).json({ error: "Checkout fulfillment failed" });
        return;
      }

      console.warn("Polar order.paid: no matching checkout_session found", {
        polarOrderId,
        checkoutId,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    // Distinguish signature/verification/payload-parse errors (400, retryable
    // from Polar with a backoff) from any other unexpected failure (e.g. DB
    // outage during alreadyPaid/fulfill) which is a 500 so Polar retries.
    const msg = err instanceof Error ? err.message : String(err);
    const isPayloadError =
      /webhook/i.test(msg) ||
      /signature/i.test(msg) ||
      /verify/i.test(msg) ||
      msg.includes("JSON");

    console.error(
      `Polar webhook ${isPayloadError ? "payload" : "unexpected"} error`,
      err,
    );

    if (isPayloadError) {
      res.status(400).json({ error: "Invalid webhook" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
