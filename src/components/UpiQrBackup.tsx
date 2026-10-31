import { useState } from "react";
import QRCode from "react-qr-code";
import { CheckCircle2, ChevronDown, Clock, Loader2, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildUpiPaymentLink,
  CAFE_PAYEE_NAME,
  CAFE_STATIC_QR_URL,
  CAFE_UPI_ID,
  isValidUtr,
  normalizeUtr,
} from "@/lib/upi";

/**
 * "Pay via UPI QR" — the backup under the UPI option when the gateway fails.
 * The QR is regenerated from the amount, so it always matches the order total.
 * "I have paid" (with the 12-digit UTR) doesn't confirm anything by itself: the order becomes
 * "Pending verification" and staff Confirm or Reject it in Admin › Payments.
 */
export function UpiQrBackup({
  amount,
  reference,
  onPaid,
  busy = false,
  submitted = false,
  compact = false,
  parcelCharge = 0,
}: {
  /** Order total in rupees (incl. any parcel charge) */
  amount: number;
  /** Reservation / order ID, shown in the payer's UPI app */
  reference: string;
  /** Called with the 12-digit UTR */
  onPaid: (utr: string) => void | Promise<void>;
  busy?: boolean;
  /** "I have paid" already recorded → show the pending state */
  submitted?: boolean;
  /** Smaller QR for the checkout sidebar */
  compact?: boolean;
  /** Takeaway parcel charge included in the amount (₹) */
  parcelCharge?: number;
}) {
  const [utr, setUtr] = useState("");
  const [touched, setTouched] = useState(false);
  const [showStatic, setShowStatic] = useState(false);
  const [staticMissing, setStaticMissing] = useState(false);
  const link = buildUpiPaymentLink({ amount, reference });
  const amountText = `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const utrValid = isValidUtr(utr);
  const showUtrError = touched && !utrValid;

  return (
    <section aria-label="Pay via UPI QR" className="rounded-xl border border-accent/30 bg-accent/5 p-3.5 text-left">
      <div className="flex items-center gap-1.5">
        <QrCode className="size-4 text-accent" aria-hidden="true" />
        <h4 className="text-xs font-semibold text-foreground">Pay via UPI QR</h4>
      </div>

      <div className="mt-3 flex flex-col items-center gap-2">
        <div className="rounded-xl bg-white p-2.5 shadow-sm border border-border/60">
          <QRCode value={link} size={compact ? 148 : 176} aria-label={`UPI QR code to pay ${amountText}`} />
        </div>
        <p className="text-lg font-bold text-accent leading-none">{amountText}</p>
        {parcelCharge > 0 && (
          <p className="text-[11px] text-muted-foreground">Includes ₹{parcelCharge} parcel charge</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          UPI ID: <span className="font-mono font-medium text-foreground select-all">{CAFE_UPI_ID}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          Payee: <span className="font-medium text-foreground">{CAFE_PAYEE_NAME}</span>
        </p>
        <p className="text-[11px] text-muted-foreground font-mono">Ref: {reference}</p>
        <p className="text-[11px] text-center text-muted-foreground">Scan with any UPI app (GPay, PhonePe, Paytm)</p>

        {/* Phones can't scan their own screen: open the UPI app with the same payment */}
        <Button asChild size="sm" variant="outline" className="sm:hidden w-full min-h-11 border-accent/40 text-accent">
          <a href={link}>
            <Smartphone className="size-4 mr-1.5" aria-hidden="true" />
            Pay with UPI app
          </a>
        </Button>
      </div>

      {/* Static PhonePe QR fallback */}
      <div className="mt-3 border-t border-border/60 pt-2.5">
        <button
          type="button"
          onClick={() => setShowStatic((v) => !v)}
          aria-expanded={showStatic}
          className="flex w-full items-center justify-between text-[11px] font-medium text-accent hover:underline underline-offset-2"
        >
          Can't scan? Use this QR
          <ChevronDown className={`size-3.5 transition-transform ${showStatic ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {showStatic && (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            {staticMissing ? (
              <p className="text-[11px] text-muted-foreground text-center">
                The QR image isn't available. Pay to UPI ID <span className="font-mono text-foreground">{CAFE_UPI_ID}</span>.
              </p>
            ) : (
              <img
                src={CAFE_STATIC_QR_URL}
                alt={`PhonePe QR code for ${CAFE_PAYEE_NAME}`}
                onError={() => setStaticMissing(true)}
                className="w-40 max-w-full rounded-lg border border-border/60 bg-white"
                loading="lazy"
              />
            )}
            <p className="text-[11px] text-center text-amber-800 dark:text-amber-300">
              This QR has no amount in it — enter <strong>{amountText}</strong> manually and add <strong>{reference}</strong> in the note.
            </p>
          </div>
        )}
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
          <label htmlFor={`utr-${reference}`} className="block text-[11px] font-medium text-foreground">
            UPI transaction ID (UTR) — 12 digits
          </label>
          <Input
            id={`utr-${reference}`}
            value={utr}
            onChange={(e) => setUtr(e.target.value.replace(/[^\d\s]/g, ""))}
            onBlur={() => setTouched(true)}
            placeholder="e.g. 412345678901"
            inputMode="numeric"
            autoComplete="off"
            maxLength={16}
            aria-invalid={showUtrError}
            aria-describedby={`utr-hint-${reference}`}
            className="h-8 text-xs bg-background font-mono"
          />
          <p id={`utr-hint-${reference}`} className={`text-[10px] ${showUtrError ? "text-destructive" : "text-muted-foreground"}`}>
            {showUtrError
              ? "Enter the 12-digit UTR shown in your UPI app's payment details."
              : "Find it in your UPI app under the payment's details (UTR / UPI Ref No.)."}
          </p>
          <Button
            type="button"
            onClick={() => {
              setTouched(true);
              if (utrValid) onPaid(normalizeUtr(utr));
            }}
            disabled={busy}
            size="sm"
            className="w-full"
          >
            {busy ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="size-4 mr-1.5" />}
            I have paid
          </Button>
        </div>
      )}
    </section>
  );
}
