
import type { Request, Response } from "express";
import { getEnv } from "../lib/env.js";
import {
  alreadyPaid,
  findSessionByPolarCheckoutId,
  fulfillCheckoutSession,
} from "../lib/fulfillment.js";
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

      // NOTE: this pre-transaction check is an optimization only. The
      // correctness boundary is the inside-transaction existence check + the
      // 23505 unique-violation guard in `fulfillCheckoutSession`. We keep
      // this short-circuit to avoid starting a DB transaction for obvious
      // replayed events.
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
          const found = await findSessionByPolarCheckoutId(checkoutId);
          if (found) sessionId = found.id;
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
        const result = await fulfillCheckoutSession(sessionId, polarOrderId, checkoutId);

        if (result === true) {
          res.json({ ok: true });
          return;
        }

        // Idempotent duplicate: either the inside-tx existence check caught
        // it, or we lost the race and the 23505 guard confirmed a paid order
        // exists. Respond 200 so Polar stops retrying.
        if (result === "duplicate") {
          res.json({ ok: true, duplicate: true });
          return;
        }

        // result === false: checkout_session no longer existed at tx start
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
