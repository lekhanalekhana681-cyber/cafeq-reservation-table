/**
 * Pre-order payment service: Razorpay calls + atomic pay_* SQL operations.
 * Dependencies are injected so tests can run it against a real Postgres with a fake gateway.
 *
 *   db        { rpc(name, args) }                     — service-role database
 *   razorpay  createRazorpayClient(...) shape          — gateway
 *   webhookSecret                                      — RAZORPAY_WEBHOOK_SECRET
 *   notify    (event, booking, extra) => Promise       — customer SMS
 */
import { PaymentError, toPaymentError } from "./errors.js";
import { verifyWebhookSignature } from "./razorpay.js";

const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);

// Checkout methods the server accepts (mirrors src/lib/payment-methods.ts)
const ONLINE_METHODS = new Set(["razorpay", "upi"]);
const CASH_METHODS = new Set(["cash", "pay_on_arrival", "cod", "pay_at_cafe"]);

export function createPaymentService({ db, razorpay, webhookSecret, notify = async () => {} }) {
  const run = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      throw toPaymentError(err);
    }
  };

  const summary = (b) => ({
    code: b.code,
    status: b.status,
    paymentState: b.payment_state,
    totalAmountPaise: b.total_amount_paise,
    depositDuePaise: b.deposit_due_paise,
    amountPaidPaise: b.amount_paid_paise,
    balanceDuePaise: b.balance_due_paise,
    scheduledAt: b.scheduled_at,
    paymentExpiresAt: b.payment_expires_at,
  });

  /** Refunds everything refundable on an order through Razorpay and records each refund. */
  async function refundAll(code, actor, reason) {
    const plan = await db.rpc("pay_cancel_plan", { _code: code, _actor: "cafe" }).catch(() => null);
    const refundable = plan?.refundable ?? (await db.rpc("pay_get_order", { _code: code })).payments
      .filter((p) => p.razorpay_payment_id && ["captured", "partially_refunded"].includes(p.status))
      .map((p) => ({ razorpay_payment_id: p.razorpay_payment_id, amount_paise: p.amount_paise - p.refunded_amount_paise }));
    let refunded = 0;
    let booking = null;
    for (const r of refundable) {
      if (r.amount_paise <= 0) continue;
      const rf = await razorpay.refund(r.razorpay_payment_id, r.amount_paise, { booking_code: code, reason: reason || "" });
      const res = await db.rpc("pay_apply_refund", {
        _razorpay_payment_id: r.razorpay_payment_id,
        _refund_id: rf.id,
        _amount_paise: r.amount_paise,
        _processed: rf.status === "processed",
        _actor: actor,
        _reason: reason || null,
      });
      refunded += r.amount_paise;
      booking = res.booking;
    }
    return { refunded, booking };
  }

  /** Shared by the checkout verify call and the payment.captured webhook. */
  async function applyCaptured({ orderId, paymentId, amountPaise, method }) {
    const res = await db.rpc("pay_mark_captured", {
      _razorpay_order_id: orderId,
      _razorpay_payment_id: paymentId,
      _amount_paise: amountPaise,
      _method: method || null,
    });
    let booking = res.booking;
    if (res.needs_refund && !res.already_processed) {
      const out = await refundAll(booking.code, "system", "Paid after the order was cancelled or expired");
      booking = out.booking || booking;
      if (booking.status !== "cancelled") {
        booking = (await db.rpc("pay_set_outcome", {
          _code: booking.code, _status: "cancelled", _forfeit: false, _actor: "system", _reason: "Payment arrived after expiry",
        })).booking;
      }
      await notify("refunded", booking, { amountPaise: out.refunded });
    } else if (!res.already_processed) {
      await notify("paid", booking, { amountPaise });
    }
    return { booking, payment: res.payment, alreadyProcessed: res.already_processed, refunded: res.needs_refund };
  }

  return {
    /** Creates (or reuses) the Razorpay order for an unpaid pre-order. Amount comes from the DB. */
    createOrder: ({ code, method = "razorpay" }) =>
      run(async () => {
        if (!code) throw new PaymentError(400, "BAD_REQUEST", "Missing order code.");
        if (CASH_METHODS.has(method)) {
          console.warn(`[payments] create-order ${code}: cash method "${method}" rejected`);
          throw new PaymentError(400, "CASH_NOT_ALLOWED_FOR_PREORDER", "Cash payment is not available for food pre-orders. Please pay online with Razorpay or UPI.");
        }
        if (!ONLINE_METHODS.has(method)) {
          throw new PaymentError(400, "BAD_REQUEST", "Choose Razorpay or UPI.");
        }
        const prep = await db.rpc("pay_prepare_checkout", { _code: code });
        let razorpayOrderId = prep.razorpay_order_id;
        if (razorpayOrderId) {
          console.info(`[payments] create-order ${code}: reusing Razorpay order ${razorpayOrderId} (${prep.amount_paise} paise)`);
        } else {
          const order = await razorpay.createOrder({
            amountPaise: prep.amount_paise,
            // Unique per Razorpay order (max 40 chars)
            receipt: `${code}-${Date.now().toString(36)}`.slice(0, 40),
            notes: { booking_code: code, kind: prep.kind, method },
          });
          if (order.amount !== prep.amount_paise) {
            throw new PaymentError(502, "GATEWAY_ERROR", "The payment gateway returned a different amount.");
          }
          await db.rpc("pay_record_order", {
            _code: code, _razorpay_order_id: order.id, _amount_paise: prep.amount_paise, _kind: prep.kind,
          });
          razorpayOrderId = order.id;
          console.info(`[payments] create-order ${code}: Razorpay order ${order.id} created for ${prep.amount_paise} paise (${prep.kind}, ${method})`);
        }
        const b = prep.booking;
        return {
          method,
          kind: prep.kind,
          keyId: razorpay.keyId,
          testMode: razorpay.isTestMode,
          razorpayOrderId,
          amountPaise: prep.amount_paise,
          currency: "INR",
          expiresAt: prep.expires_at,
          customer: { name: b.name, phone: b.phone, email: b.customer_email || "" },
          order: summary(b),
        };
      }),

    /** Checkout success callback: verify signature, confirm with Razorpay, then mark paid. */
    verify: ({ code, razorpay_order_id, razorpay_payment_id, razorpay_signature }) =>
      run(async () => {
        console.info(`[payments] verify ${code}: order ${razorpay_order_id}, payment ${razorpay_payment_id}`);
        if (!razorpay.verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) {
          console.warn(`[payments] verify ${code}: signature mismatch`);
          throw new PaymentError(400, "INVALID_SIGNATURE", "We couldn't verify this payment. If money was debited it will be confirmed automatically or refunded.");
        }
        let payment = await razorpay.fetchPayment(razorpay_payment_id);
        if (payment.order_id !== razorpay_order_id) {
          throw new PaymentError(400, "INVALID_SIGNATURE", "This payment doesn't belong to the order.");
        }
        if (payment.status === "authorized") {
          payment = await razorpay.capturePayment(razorpay_payment_id, payment.amount);
        }
        if (payment.status !== "captured") {
          throw new PaymentError(402, "NOT_CAPTURED", "The payment hasn't completed yet. Please try again.");
        }
        const res = await applyCaptured({
          orderId: razorpay_order_id, paymentId: razorpay_payment_id, amountPaise: payment.amount, method: payment.method,
        });
        if (code && res.booking.code !== code) {
          throw new PaymentError(400, "INVALID_SIGNATURE", "This payment doesn't belong to the order.");
        }
        console.info(
          `[payments] verify ${res.booking.code}: ${res.alreadyProcessed ? "already recorded" : "captured"} ${payment.amount} paise via ${payment.method} → ${res.booking.payment_state}`
        );
        return {
          order: summary(res.booking),
          refunded: res.refunded,
          receipt: {
            paymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            amountPaise: payment.amount,
            method: payment.method || null,
            paidAt: res.payment?.captured_at || new Date().toISOString(),
          },
        };
      }),

    /**
     * Razorpay webhook. Source of truth when the customer closes the tab after paying.
     * Each event id is processed once; the SQL operations are idempotent as well.
     */
    handleWebhook: ({ rawBody, signature, eventId }) =>
      run(async () => {
        if (!verifyWebhookSignature({ rawBody, signature, webhookSecret })) {
          throw new PaymentError(400, "INVALID_SIGNATURE", "Invalid webhook signature.");
        }
        const evt = JSON.parse(rawBody);
        const payment = evt?.payload?.payment?.entity;
        const refund = evt?.payload?.refund?.entity;
        const id = eventId || `${evt.event}:${refund?.id || payment?.id}`;

        const fresh = await db.rpc("pay_register_event", { _event_id: id, _event: evt.event });
        console.info(`[payments] webhook ${evt.event} ${id}${fresh ? "" : " (duplicate, ignored)"}`);
        if (!fresh) return { duplicate: true };

        try {
          switch (evt.event) {
            case "payment.captured":
              await applyCaptured({
                orderId: payment.order_id, paymentId: payment.id, amountPaise: payment.amount, method: payment.method,
              });
              break;
            case "payment.failed":
              await db.rpc("pay_mark_failed", {
                _razorpay_order_id: payment.order_id,
                _razorpay_payment_id: payment.id,
                _reason: payment.error_description || payment.error_reason || "Payment failed",
              });
              break;
            case "refund.processed":
              await db.rpc("pay_apply_refund", {
                _razorpay_payment_id: refund.payment_id,
                _refund_id: refund.id,
                _amount_paise: refund.amount,
                _processed: true,
                _actor: "razorpay",
                _reason: "refund.processed",
              });
              break;
            default:
              break;
          }
        } catch (err) {
          // Payments created outside CafeQ (or unknown orders) are acknowledged and ignored
          if (/PAYMENT_ORDER_NOT_FOUND|PAYMENT_NOT_FOUND/.test(String(err?.message))) return { ignored: true };
          // Let Razorpay retry the event later
          await db.rpc("pay_forget_event", { _event_id: id }).catch(() => {});
          throw err;
        }
        return { processed: evt.event };
      }),

    /** Customer cancellation: refund before the cutoff, forfeit after. Phone must match the order. */
    cancelByCustomer: ({ code, phone, reason }) =>
      run(async () => {
        const { booking } = await db.rpc("pay_get_order", { _code: code });
        if (!phone || digits(phone) !== digits(booking.phone)) {
          throw new PaymentError(403, "FORBIDDEN", "The phone number doesn't match this order.");
        }
        return cancelOrder(code, "customer", reason || "Cancelled by customer");
      }),

    cancelOrder: (code, actor, reason) => run(() => cancelOrder(code, actor, reason)),

    // ─── Admin actions ─────────────────────────────────────────────────────────
    refund: ({ code, amountPaise, actor, reason }) =>
      run(async () => {
        const plan = await db.rpc("pay_cancel_plan", { _code: code, _actor: "cafe" }).catch(async (err) => {
          // Refunds are also allowed after cancellation / no-show
          if (!/NOT_CANCELLABLE/.test(String(err?.message))) throw err;
          const order = await db.rpc("pay_get_order", { _code: code });
          return {
            refundable: order.payments
              .filter((p) => p.razorpay_payment_id && ["captured", "partially_refunded"].includes(p.status))
              .map((p) => ({ razorpay_payment_id: p.razorpay_payment_id, amount_paise: p.amount_paise - p.refunded_amount_paise })),
          };
        });
        const available = plan.refundable.reduce((s, r) => s + r.amount_paise, 0);
        const wanted = amountPaise == null ? available : Math.round(Number(amountPaise));
        if (!Number.isInteger(wanted) || wanted <= 0) throw new PaymentError(400, "BAD_REQUEST", "Enter a refund amount.");
        if (wanted > available) throw new PaymentError(400, "REFUND_EXCEEDS_PAYMENT", "The refund is larger than what was paid online.");

        let remaining = wanted;
        let booking = null;
        for (const r of plan.refundable) {
          if (remaining <= 0) break;
          const amount = Math.min(remaining, r.amount_paise);
          const rf = await razorpay.refund(r.razorpay_payment_id, amount, { booking_code: code, reason: reason || "" });
          booking = (await db.rpc("pay_apply_refund", {
            _razorpay_payment_id: r.razorpay_payment_id, _refund_id: rf.id, _amount_paise: amount,
            _processed: rf.status === "processed", _actor: actor, _reason: reason || null,
          })).booking;
          remaining -= amount;
        }
        await notify("refunded", booking, { amountPaise: wanted });
        return { order: summary(booking), refundedPaise: wanted };
      }),

    forfeit: ({ code, actor, reason }) =>
      run(async () => {
        if (!reason?.trim()) throw new PaymentError(400, "BAD_REQUEST", "A reason is required to forfeit a deposit.");
        const { booking } = await db.rpc("pay_get_order", { _code: code });
        const active = !["cancelled", "no_show", "completed", "expired"].includes(booking.status);
        const res = await db.rpc("pay_set_outcome", {
          _code: code, _status: active ? "cancelled" : null, _forfeit: true, _actor: actor, _reason: reason.trim(),
        });
        await notify("forfeited", res.booking);
        return { order: summary(res.booking) };
      }),

    noShow: ({ code, actor }) =>
      run(async () => {
        const { booking } = await db.rpc("pay_get_order", { _code: code });
        const res = await db.rpc("pay_set_outcome", {
          _code: code, _status: "no_show", _forfeit: booking.amount_paid_paise > 0, _actor: actor, _reason: "Customer did not arrive",
        });
        if (booking.amount_paid_paise > 0) await notify("no_show", res.booking);
        return { order: summary(res.booking) };
      }),

    collectBalance: ({ code, method, actor }) =>
      run(async () => {
        const res = await db.rpc("pay_collect_balance", { _code: code, _method: method, _actor: actor });
        return { order: summary(res.booking) };
      }),

    list: ({ filter = "all" } = {}) =>
      run(async () => ({
        ...(await db.rpc("pay_list", { _filter: filter, _limit: 200 })),
        daily: await db.rpc("pay_daily_summary", { _days: 14 }),
      })),

    updateSettings: ({ settings, actor }) =>
      run(() => db.rpc("pay_update_settings", { _settings: settings, _actor: actor })),

    expireUnpaid: () => run(() => db.rpc("expire_unpaid_preorders", {})),
  };

  async function cancelOrder(code, actor, reason) {
    const plan = await db.rpc("pay_cancel_plan", { _code: code, _actor: actor === "customer" ? "customer" : "cafe" });
    // Billed is a final state; check before any refund is issued
    if (plan.booking?.status === "billed") {
      throw new PaymentError(409, "NOT_CANCELLABLE", "This order has already been billed and can no longer be cancelled.");
    }
    if (plan.action === "refund") {
      const out = await refundAll(code, actor, reason);
      const res = await db.rpc("pay_set_outcome", { _code: code, _status: "cancelled", _forfeit: false, _actor: actor, _reason: reason });
      await notify("refunded", res.booking, { amountPaise: out.refunded });
      return { action: "refund", refundedPaise: out.refunded, order: summary(res.booking), cutoffAt: plan.cutoff_at };
    }
    const forfeit = plan.action === "forfeit";
    const res = await db.rpc("pay_set_outcome", {
      _code: code, _status: "cancelled", _forfeit: forfeit, _actor: actor,
      _reason: forfeit ? `${reason} (after the free-cancellation cutoff)` : reason,
    });
    if (forfeit) await notify("forfeited", res.booking);
    return { action: plan.action, refundedPaise: 0, order: summary(res.booking), cutoffAt: plan.cutoff_at };
  }
}
