
import { Link, useNavigate, useSearchParams } from "react-router";
import { useCart } from "../store/cart";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PackageIcon,
} from "lucide-react";
import { apiFetch } from "../lib/api";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 25_000;

function CheckoutReturnPage() {
  const clearCart = useCart((s) => s.clear);
  const { getToken, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [params] = useSearchParams();
  const checkoutId = params.get("checkout_id");

  const [status, setStatus] = useState(checkoutId ? "recovering" : "idle");
  const [recoverError, setRecoverError] = useState(null);
  const [recoveredOrderId, setRecoveredOrderId] = useState(null);
  const pollTimerRef = useRef(null);
  const pollStartRef = useRef(null);

  useEffect(() => {
    clearCart();
    queryClient.invalidateQueries({ queryKey: ["orders"] });
  }, [queryClient, clearCart]);

  useEffect(() => {
    if (!checkoutId || status !== "recovering" || !isSignedIn) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await apiFetch(
          `/api/checkout/recover-by-polar-id/${encodeURIComponent(checkoutId)}`,
          {
            method: "POST",
            getToken,
          },
        );
        if (cancelled) return;
        if (result?.orderId) setRecoveredOrderId(result.orderId);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setRecoverError(msg || "Recovery unavailable");
        }
      } finally {
        if (!cancelled) {
          pollStartRef.current = Date.now();
          setStatus("polling");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    checkoutId,
    status,
    getToken,
    isSignedIn,
    pollStartRef,
    setRecoverError,
    setRecoveredOrderId,
    setStatus,
  ]);

  useEffect(() => {
    if (status !== "polling") return;

    const tick = async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      const ordersData = queryClient.getQueryData(["orders"]);
      const orders = ordersData?.orders ?? [];
      const found = recoveredOrderId
        ? orders.some((o) => o.id === recoveredOrderId)
        : orders.length > 0;
      if (found) {
        if (pollTimerRef.current !== null) {
          window.clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setStatus("ready");
        return;
      }
      const elapsed = pollStartRef.current ? Date.now() - pollStartRef.current : 0;
      if (elapsed >= POLL_TIMEOUT_MS) {
        if (pollTimerRef.current !== null) {
          window.clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setStatus("timeout");
      }
    };

    void tick();
    pollTimerRef.current = window.setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [status, queryClient, recoveredOrderId, pollStartRef, pollTimerRef, setStatus]);

  useEffect(() => {
    if (status !== "ready") return;
    const t = window.setTimeout(() => navigate("/orders"), 800);
    return () => window.clearTimeout(t);
  }, [status, navigate]);

  const isWorking = status === "recovering" || status === "polling";
  const workingLabel =
    status === "recovering"
      ? "Confirming your payment…"
      : "Updating your order list…";

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="avatar placeholder mx-auto mb-4">
        <div
          className={`w-16 rounded-full flex items-center justify-center ${
            status === "timeout" || recoverError
              ? "bg-warning/20 text-warning"
              : status === "ready"
                ? "bg-success/20 text-success"
                : "bg-primary/20 text-primary"
          }`}
        >
          {isWorking ? (
            <Loader2Icon className="size-10 animate-spin" aria-hidden />
          ) : status === "timeout" ? (
            <AlertTriangleIcon className="size-10" aria-hidden />
          ) : (
            <CheckCircle2Icon className="size-10" aria-hidden />
          )}
        </div>
      </div>

      <h1 className="text-2xl font-bold text-base-content">
        {status === "timeout" ? "Your payment went through" : "Thanks for your order"}
      </h1>

      {status === "ready" ? (
        <p className="mt-4 text-base-content/70">
          Taking you to your orders…
        </p>
      ) : isWorking ? (
        <p className="mt-4 text-base-content/70">
          {workingLabel} This usually takes a few seconds.
        </p>
      ) : status === "timeout" ? (
        <div className="mt-4 text-left space-y-3 text-base-content/70">
          <p>
            We couldn&apos;t finalize the order in the background right now. Your
            card was charged successfully — the order will appear in this list
            shortly when the payment confirmation finishes syncing.
          </p>
          {checkoutId ? (
            <p className="font-mono text-xs rounded-md bg-base-200 px-3 py-2 break-all text-base-content/70">
              Checkout ID: {checkoutId}
            </p>
          ) : null}
          <p>
            If nothing shows up in 5 minutes, share the Checkout ID above with
            support and we&apos;ll recover it for you.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-base-content/70">
          Your order is created after payment is confirmed. Open it from your
          orders list for <strong className="text-base-content">support chat</strong>{" "}
          (it appears there as <strong className="text-base-content">paid</strong>
          ). We&apos;ll send video invites in that thread when needed.
        </p>
      )}

      {checkoutId && status !== "timeout" ? (
        <p className="mt-2 font-mono text-xs text-base-content/50">
          Checkout: {checkoutId}
        </p>
      ) : null}

      {!isWorking && status !== "ready" ? (
        <Link to="/orders" className="btn btn-primary mt-8 gap-2">
          <PackageIcon className="size-4" aria-hidden />
          View orders
        </Link>
      ) : null}

      {status === "ready" ? (
        <Link to="/orders" className="btn btn-primary mt-8 gap-2">
          <PackageIcon className="size-4" aria-hidden />
          Go to orders now
        </Link>
      ) : null}
    </div>
  );
}

export default CheckoutReturnPage;
