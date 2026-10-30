import { useState } from "react";
import QRCode from "react-qr-code";
import { CheckCircle2, Clock, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildUpiPaymentLink, CAFE_UPI_ID } from "@/lib/upi";

/**
 * "Pay via UPI QR" — the backup under the UPI option when the gateway fails.
 * The QR is regenerated from the amount, so it always matches the order total.
 * "I have paid" doesn't confirm anything by itself: the order becomes "Pending verification"
 * and staff confirm it in Admin › Payments.
 */
export function UpiQrBackup({
  amount,
  reference,
  onPaid,
  busy = false,
  submitted = false,
  compact = false,
}: {
  /** Order total in rupees */
  amount: number;
  /** Reservation / order ID, shown in the payer's UPI app */
  reference: string;
  onPaid: (utr: string) => void | Promise<void>;
  busy?: boolean;
  /** "I have paid" already recorded → show the pending state */
  submitted?: boolean;
  /** Smaller QR for the checkout sidebar */
  compact?: boolean;
}) {
  const [utr, setUtr] = useState("");
  const link = buildUpiPaymentLink({ amount, reference });

  return (
    <section aria-label="Pay via UPI QR" className="rounded-xl border border-accent/30 bg-accent/5 p-3.5 text-left">
      <div className="flex items-center gap-1.5">
        <QrCode className="size-4 text-accent" aria-hidden="true" />
        <h4 className="text-xs font-semibold text-foreground">Pay via UPI QR</h4>
      </div>

      <div className="mt-3 flex flex-col items-center gap-2">
        <div className="rounded-xl bg-white p-2.5 shadow-sm border border-border/60">
          <QRCode value={link} size={compact ? 148 : 176} aria-label={`UPI QR code to pay ₹${amount}`} />
        </div>
        <p className="text-lg font-bold text-accent leading-none">₹{amount.toLocaleString("en-IN")}</p>
        <p className="text-[11px] text-muted-foreground">
          UPI ID: <span className="font-mono font-medium text-foreground select-all">{CAFE_UPI_ID}</span>
        </p>
        <p className="text-[11px] text-muted-foreground font-mono">Ref: {reference}</p>
        <p className="text-[11px] text-center text-muted-foreground">Scan with any UPI app (GPay, PhonePe, Paytm)</p>
      </div>

      {submitted ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
          <Clock className="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>Pending verification.</strong> Our staff will confirm your payment shortly — no need to pay again.
          </span>
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          <Input
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            placeholder="UPI transaction ID / UTR (optional)"
            aria-label="UPI transaction ID or UTR (optional)"
            inputMode="numeric"
            maxLength={64}
            className="h-8 text-xs bg-background"
          />
          <Button type="button" onClick={() => onPaid(utr)} disabled={busy} size="sm" className="w-full">
            {busy ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="size-4 mr-1.5" />}
            I have paid
          </Button>
        </div>
      )}
    </section>
  );
}
