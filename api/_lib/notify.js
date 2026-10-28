/**
 * Server-side customer SMS for payment events (works even if the customer closed the tab).
 * Uses the same Twilio env vars as /api/send-sms; without them it only logs.
 */
const formatInr = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function createSmsNotifier(env = process.env, fetchImpl = fetch) {
  const sid = env.TWILIO_SID || env.VITE_TWILIO_SID;
  const token = env.TWILIO_AUTH_TOKEN || env.VITE_TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_PHONE || env.VITE_TWILIO_FROM_PHONE;

  return async function notify(event, booking, extra = {}) {
    if (!booking?.phone) return;
    const code = booking.code;
    const messages = {
      paid: `CafeQ: Payment of ${formatInr(extra.amountPaise ?? booking.amount_paid_paise)} received for order ${code}. Balance due at the cafe: ${formatInr(booking.balance_due_paise ?? 0)}.`,
      refunded: `CafeQ: Order ${code} was cancelled. A refund of ${formatInr(extra.amountPaise ?? 0)} has been issued to your original payment method (5–7 working days).`,
      forfeited: `CafeQ: Order ${code} was cancelled after the free-cancellation cutoff, so the deposit of ${formatInr(booking.amount_paid_paise ?? 0)} is non-refundable.`,
      no_show: `CafeQ: Order ${code} was marked as a no-show. The deposit of ${formatInr(booking.amount_paid_paise ?? 0)} is non-refundable.`,
    };
    const body = messages[event];
    if (!body) return;
    if (!sid || !token || !from) {
      console.info(`[payments:notify] (SMS not configured) ${booking.phone}: ${body}`);
      return;
    }
    try {
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: booking.phone, From: from, Body: body }).toString(),
      });
      if (!res.ok) console.warn("[payments:notify] Twilio error", res.status);
    } catch (err) {
      console.warn("[payments:notify] SMS failed:", err?.message);
    }
  };
}
