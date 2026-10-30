import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  RotateCcw,
  CalendarCheck,
  Search,
  Clock,
  Coffee,
  Ban,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  ChevronRight,
  Download,
  Bell,
  FileText,
  Check,
  CreditCard,
  Utensils,
  ShoppingBag,
  Bike,
  MapPin,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { WifiCard } from "@/components/WifiCard";
import { getUserBookings, cancelBooking, withKitchenState, type BookingInput } from "@/lib/bookings.functions";
import {
  formatItemProgress,
  getItemProgress,
  ITEM_STATUS_BADGE_CLASS,
  ITEM_STATUS_LABELS,
} from "@/lib/order-items";
import { subscribeToKitchenEvents } from "@/lib/kitchen.sync";
import { getCafeSettings } from "@/lib/settings.functions";
import { isOnlinePaymentMethod } from "@/lib/payment-methods";

/** Pre-order awaiting its deposit, or any order that chose online payment and hasn't paid yet. */
const needsOnlinePayment = (b: BookingInput) =>
  b.status === "pending_payment" ||
  (!b.paymentRequired &&
    isOnlinePaymentMethod(b.paymentMethod) &&
    (b.paymentState === "UNPAID" || b.paymentState === "PENDING") &&
    b.paymentStatus !== "paid" &&
    !["cancelled", "no_show", "expired", "billed"].includes(b.status));
import {
  cancelPreorder,
  DEFAULT_PREORDER_SETTINGS,
  formatIst,
  formatPaise,
  payOnline,
  PAYMENT_STATE_BADGE_CLASS,
  PAYMENT_STATE_LABELS,
  refundCutoffMs,
} from "@/lib/prepayment";
import {
  getReceiptByBookingCode,
  downloadReceiptPdf,
  generateReceiptNumber,
} from "@/lib/receipt.service";
import {
  getOrderTypeDetails,
  getOrderStatusLabel,
} from "@/lib/order-types";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  type NotificationPreferences,
  DEFAULT_PREFERENCES,
} from "@/lib/notifications";
import { tableTypes } from "@/data/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/history")({
  validateSearch: (search: Record<string, unknown>): { phone?: string } => ({
    phone: (search["phone"] as string) || undefined,
  }),
  component: HistoryPage,
});

function isBookingUpcoming(b: BookingInput): boolean {
  if (b.status === "cancelled") return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  if (b.date > todayStr) return true;
  if (b.date === todayStr) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [h, m] = b.time.split(":").map(Number);
    const bookingMinutes = (h || 0) * 60 + (m || 0);
    return bookingMinutes >= currentMinutes - 60; // Up to 1 hour past reservation time
  }
  return false;
}

function HistoryPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [searchPhone, setSearchPhone] = useState(search.phone || "");
  const [bookings, setBookings] = useState<BookingInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [cancellingCode, setCancellingCode] = useState<string | null>(null);
  const [payingCode, setPayingCode] = useState<string | null>(null);
  const [refundCutoffMinutes, setRefundCutoffMinutes] = useState(DEFAULT_PREORDER_SETTINGS.refundCutoffMinutes);

  useEffect(() => {
    getCafeSettings()
      .then((s) => setRefundCutoffMinutes(s.refundCutoffMinutes))
      .catch(() => {});
  }, []);
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (user || searchPhone) {
      getUserNotificationPreferences({
        userId: user?.id,
        phone: user?.phone || searchPhone,
        email: user?.email,
      }).then(setPrefs);
    }
  }, [user, searchPhone]);

  const handleTogglePref = async (key: keyof NotificationPreferences) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSavingPrefs(true);
    try {
      await updateUserNotificationPreferences(
        {
          userId: user?.id,
          phone: user?.phone || searchPhone,
          email: user?.email,
        },
        { [key]: updated[key] }
      );
      toast.success("Notification preferences updated!");
    } catch {
      toast.error("Failed to save preference.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleDownloadReceipt = async (b: BookingInput) => {
    setDownloadingCode(b.code);
    try {
      // 1. Check if stored receipt exists
      let receipt = await getReceiptByBookingCode(b.code);

      if (!receipt) {
        // Generate on the fly from booking details
        const total = b.total || 0;
        const deposit = b.depositAmount || 0;
        const itemsTotal = Math.max(0, total - deposit);
        const taxAmount = Math.round(itemsTotal * 0.05 * 100) / 100;
        const subtotal = Math.max(0, itemsTotal - taxAmount);
        const cgst = Math.round((taxAmount / 2) * 100) / 100;
        const sgst = Math.round((taxAmount / 2) * 100) / 100;

        receipt = {
          id: `rcpt_${b.code}`,
          receiptNumber: generateReceiptNumber(b.code),
          bookingCode: b.code,
          orderId: `order_${b.code}`,
          paymentId: b.paymentReference || "Prepaid",
          paymentMethod: b.paymentMethod === "online_razorpay" ? "Razorpay Online" : b.paymentMethod === "upi_razorpay" ? "UPI (Razorpay)" : b.paymentMethod === "upi_prepay" ? "UPI QR Code" : "Cash on Arrival",
          paymentStatus: (b.paymentStatus as any) === "paid" ? "paid" : "pending",
          date: b.date,
          time: b.time,
          customerName: b.name,
          customerPhone: b.phone,
          customerEmail: b.customerEmail || undefined,
          tableType: b.tableType || "Reserved Table",
          partySize: b.party,
          items: b.items || [],
          subtotal,
          cgst,
          sgst,
          taxAmount,
          depositAmount: deposit,
          total,
          createdAt: new Date().toISOString(),
        };
      }

      if (receipt) {
        downloadReceiptPdf(receipt);
        toast.success(`Downloaded digital receipt for ${b.code}`);
      }
    } catch (err) {
      toast.error("Could not generate receipt PDF.");
    } finally {
      setDownloadingCode(null);
    }
  };

  const fetchBookings = async (customPhone?: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (user) {
        const results = await getUserBookings({
          userId: user.id,
          phone: customPhone || user.phone,
          email: user.email,
        });
        setBookings(results);
      } else if (customPhone || search.phone) {
        const results = await getUserBookings(customPhone || search.phone || "");
        setBookings(results);
      } else {
        // Fallback to local storage
        const stored: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
        setBookings(stored.reverse().map(withKitchenState));
      }
    } catch {
      if (!silent) toast.error("Could not retrieve bookings.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchBookings();
    }
  }, [user, authLoading, search.phone]);

  // Live order tracking: refresh item progress when the kitchen updates an order
  useEffect(() => {
    if (authLoading) return;
    const refresh = () => fetchBookings(undefined, true);
    const unsubscribe = subscribeToKitchenEvents((event) => {
      if (event.type !== "STOCK_CHANGED") refresh();
    });
    const poll = setInterval(refresh, 15000);
    return () => {
      unsubscribe();
      clearInterval(poll);
    };
  }, [user, authLoading, search.phone]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchPhone.trim()) return;
    fetchBookings(searchPhone);
  };

  /** Retry payment for a pre-order still awaiting payment (within its 15-minute window). */
  const handlePayNow = async (b: BookingInput) => {
    if (payingCode) return;
    setPayingCode(b.code);
    try {
      const outcome = await payOnline(b.code, b.paymentMethod === "upi_razorpay" ? "upi" : "razorpay");
      if (outcome.status === "paid") {
        toast.success(`Payment received. Order ${b.code} is confirmed and sent to the kitchen.`);
      } else if (outcome.status === "failed") {
        toast.error(outcome.message);
      }
      await fetchBookings(undefined, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the payment.");
      await fetchBookings(undefined, true);
    } finally {
      setPayingCode(null);
    }
  };

  const handleCancelBooking = async (b: BookingInput) => {
    const code = b.code;
    const paidOnline = b.paymentRequired && (b.amountPaidPaise ?? 0) > 0;

    if (paidOnline) {
      // Paid pre-order: the server refunds before the cutoff and forfeits after it
      const cutoff = refundCutoffMs(b.scheduledAt, refundCutoffMinutes);
      const beforeCutoff = cutoff === null || Date.now() < cutoff;
      const message = beforeCutoff
        ? `Cancel ${code}? You'll get a full refund of ${formatPaise(b.amountPaidPaise)} to your original payment method.`
        : `Cancel ${code}? The free-cancellation window ended at ${formatIst(cutoff)} IST, so your ${formatPaise(b.amountPaidPaise)} deposit is non-refundable.`;
      if (!window.confirm(message)) return;

      setCancellingCode(code);
      try {
        const res = await cancelPreorder(code, b.phone);
        toast.success(
          res.action === "refund"
            ? `Order ${code} cancelled. Refund of ${formatPaise(res.refundedPaise)} issued (5–7 working days).`
            : `Order ${code} cancelled. The deposit was forfeited as per the cancellation policy.`
        );
        await fetchBookings(undefined, true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to cancel the order.");
      } finally {
        setCancellingCode(null);
      }
      return;
    }

    if (!window.confirm(`Are you sure you want to cancel reservation ${code}?`)) {
      return;
    }

    setCancellingCode(code);
    try {
      const res = await cancelBooking({ code, userId: user?.id });
      if (!res.success) {
        toast.error(res.error || "Failed to cancel reservation.");
        return;
      }
      toast.success(`Reservation ${code} has been cancelled.`);
      // Update local state directly
      setBookings((prev) =>
        prev.map((b) => (b.code === code ? { ...b, status: "cancelled" } : b))
      );
    } catch {
      toast.error("Failed to cancel reservation.");
    } finally {
      setCancellingCode(null);
    }
  };

  // Rebook & Reorder handler
  const handleRebook = (b: BookingInput) => {
    const rebookData = {
      tableType: b.tableType || "window",
      party: b.party,
      dietary: b.dietary,
      name: b.name,
      phone: b.phone,
      items: b.items || [],
    };
    const encoded = encodeURIComponent(JSON.stringify(rebookData));
    navigate({
      to: "/reserve",
      search: {
        rebook: encoded,
        phone: b.phone,
      },
    });
  };

  const upcomingBookings = bookings.filter(isBookingUpcoming);
  const pastBookings = bookings.filter((b) => !isBookingUpcoming(b));
  const displayedBookings = activeTab === "upcoming" ? upcomingBookings : pastBookings;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
      {/* Header */}
      <div className="border-b border-border/70 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Guest Portal</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-display font-bold text-foreground">
            My Bookings & Reservations
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            {isAuthenticated && user ? (
              <>
                Signed in as <span className="font-semibold text-foreground">{user.name}</span> ({user.email}). View your scheduled visits or rebook past favorites.
              </>
            ) : (
              "View your reservations and quickly rebook your favorite table with a single click."
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPrefs((prev) => !prev)}
            className="text-xs shadow-xs"
          >
            <Bell className="size-3.5 mr-1.5 text-accent" />
            {showPrefs ? "Hide Preferences" : "Notification Settings"}
          </Button>

          {!isAuthenticated && (
            <Button asChild size="sm" className="shrink-0 shadow-sm">
              <Link to="/login" search={{ redirect: "/history" }}>
                <LogIn className="size-4 mr-1.5" /> Sign In for Full History
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Notification Preferences Drawer / Card */}
      {showPrefs && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm animate-in fade-in space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <div>
              <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
                <Bell className="size-4 text-accent" /> Communication & Notification Preferences
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose the channels you want CafeQ updates sent to (reservation confirmations, kitchen alerts, receipts & reminders).
              </p>
            </div>
            {savingPrefs && (
              <span className="text-[11px] text-muted-foreground animate-pulse">Saving…</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <label className="flex items-start gap-3 p-3 rounded-xl border border-border/80 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors">
              <input
                type="checkbox"
                checked={prefs.whatsappEnabled}
                onChange={() => handleTogglePref("whatsappEnabled")}
                className="mt-0.5 rounded text-accent"
              />
              <div>
                <p className="text-xs font-semibold text-foreground">WhatsApp Messages</p>
                <p className="text-[11px] text-muted-foreground">Order updates & booking refs via WhatsApp Cloud API</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-border/80 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors">
              <input
                type="checkbox"
                checked={prefs.smsEnabled}
                onChange={() => handleTogglePref("smsEnabled")}
                className="mt-0.5 rounded text-accent"
              />
              <div>
                <p className="text-xs font-semibold text-foreground">SMS Alerts</p>
                <p className="text-[11px] text-muted-foreground">Instant SMS confirmations via MSG91 / Twilio</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-border/80 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors">
              <input
                type="checkbox"
                checked={prefs.emailEnabled}
                onChange={() => handleTogglePref("emailEnabled")}
                className="mt-0.5 rounded text-accent"
              />
              <div>
                <p className="text-xs font-semibold text-foreground">Email & PDF Receipts</p>
                <p className="text-[11px] text-muted-foreground">Detailed HTML emails with downloadable tax receipts</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-border/80 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors">
              <input
                type="checkbox"
                checked={prefs.remindersEnabled}
                onChange={() => handleTogglePref("remindersEnabled")}
                className="mt-0.5 rounded text-accent"
              />
              <div>
                <p className="text-xs font-semibold text-foreground">Visit Reminders</p>
                <p className="text-[11px] text-muted-foreground">Friendly reminders 1–2 hours before reservation time</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Guest Phone Lookup (if not logged in) */}
      {!isAuthenticated && (
        <form onSubmit={handleSearch} className="mt-6 flex flex-col sm:flex-row gap-3 max-w-md">
          <Input
            type="tel"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            placeholder="Search by phone (+91 90000 00000)"
            className="flex-1"
          />
          <Button type="submit" disabled={loading} variant="secondary">
            <Search className="size-4 mr-1.5" /> {loading ? "Searching…" : "Find Bookings"}
          </Button>
        </form>
      )}

      {/* Tabs */}
      <div className="mt-8 flex gap-3 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("upcoming")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "upcoming"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <Clock className="size-4" />
          Upcoming Bookings
          <span className="ml-1.5 rounded-full px-2 py-0.5 text-xs bg-black/15 font-bold">
            {upcomingBookings.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("past")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "past"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <CheckCircle2 className="size-4" />
          Past & Cancelled
          <span className="ml-1.5 rounded-full px-2 py-0.5 text-xs bg-black/15 font-bold">
            {pastBookings.length}
          </span>
        </button>
      </div>

      {/* Bookings List */}
      <div className="mt-8 space-y-6">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            Loading reservations…
          </div>
        ) : displayedBookings.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/80 p-12 text-center bg-card/40">
            <Coffee className="size-10 text-accent/60 mx-auto" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              {activeTab === "upcoming" ? "No upcoming reservations" : "No past bookings recorded"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
              {activeTab === "upcoming"
                ? "You don't have any pending table bookings at Cafeq. Reserve your spot now for artisan bakes and slow coffee."
                : "Your past and cancelled reservations will appear here."}
            </p>
            <Button asChild className="mt-6 font-semibold shadow-md">
              <Link to="/reserve">Book a Table Now</Link>
            </Button>
          </div>
        ) : (
          displayedBookings.map((b) => {
            const tableInfo = tableTypes.find((t) => t.id === b.tableType);
            const typeDetails = getOrderTypeDetails(b.orderType);
            const statusFlowLabel = getOrderStatusLabel(b.orderType, b.status, b.kitchenStatus);
            const preOrdered = b.items?.filter((i) => i.fulfillment === "pre_ordered") || [];
            const atTable = b.items?.filter((i) => i.fulfillment === "at_table") || [];
            const isCancelled = b.status === "cancelled";
            const isUpcoming = isBookingUpcoming(b);

            return (
              <article
                key={b.code}
                className={`rounded-3xl border p-6 shadow-sm transition-all ${
                  isCancelled
                    ? "border-destructive/30 bg-card/60 opacity-80"
                    : "border-border/80 bg-card hover:shadow-md"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border/60 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-display font-bold text-xl text-foreground">{b.code}</span>

                      {/* Order Type Badge */}
                      <Badge className={`text-xs font-semibold flex items-center gap-1.5 shadow-xs ${typeDetails.badgeClass}`}>
                        {typeDetails.type === "DINE_IN" && <Utensils className="size-3" />}
                        {typeDetails.type === "TAKEAWAY" && <ShoppingBag className="size-3" />}
                        {typeDetails.type === "DELIVERY" && <Bike className="size-3" />}
                        {typeDetails.label}
                      </Badge>

                      {/* Status Flow Label */}
                      <Badge variant="outline" className="text-xs font-medium text-foreground border-border bg-secondary/60">
                        {statusFlowLabel}
                      </Badge>

                      {typeDetails.type === "DINE_IN" && (
                        <Badge variant="secondary" className="text-xs">
                          {tableInfo?.name || b.seating}
                        </Badge>
                      )}

                      {b.paymentRequired && b.paymentState && (
                        <Badge variant="outline" className={`text-xs font-semibold ${PAYMENT_STATE_BADGE_CLASS[b.paymentState]}`}>
                          {PAYMENT_STATE_LABELS[b.paymentState]}
                        </Badge>
                      )}

                      {isCancelled ? (
                        <Badge variant="destructive" className="text-xs">
                          Cancelled
                        </Badge>
                      ) : b.status === "billed" ? (
                        <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400 border-blue-500/40 bg-blue-500/10">
                          Completed & billed
                        </Badge>
                      ) : b.status === "pending" ? (
                        <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10">
                          Awaiting confirmation
                        </Badge>
                      ) : b.status === "pending_payment" ? (
                        <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10">
                          Payment pending
                        </Badge>
                      ) : b.status === "expired" ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                          Expired — not paid
                        </Badge>
                      ) : b.status === "no_show" ? (
                        <Badge variant="destructive" className="text-xs">
                          No-show
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10">
                          Confirmed
                        </Badge>
                      )}
                      {b.isPeakHour && (
                        <Badge variant="outline" className="text-xs text-accent border-accent/40">
                          Peak Slot
                        </Badge>
                      )}
                    </div>

                    <div className="mt-2 text-xs sm:text-sm text-muted-foreground space-y-1">
                      <p className="flex items-center gap-2">
                        <CalendarCheck className="size-4 text-accent" />
                        <span className="font-medium text-foreground">{b.date}</span> at{" "}
                        <span className="font-medium text-foreground">{b.time}</span>
                        {typeDetails.type === "DINE_IN" && (
                          <span> · {b.party} {b.party === 1 ? "Guest" : "Guests"}</span>
                        )}
                      </p>

                      {typeDetails.type === "DINE_IN" && b.tableNumber && (
                        <p className="text-xs text-foreground font-medium flex items-center gap-1.5">
                          <Utensils className="size-3.5 text-accent" /> Table #{b.tableNumber}
                        </p>
                      )}

                      {typeDetails.type === "TAKEAWAY" && (
                        <p className="text-xs text-foreground font-medium flex items-center gap-1.5">
                          <Package className="size-3.5 text-accent" /> Pickup: {b.pickupTime || "ASAP"} (Counter Collection)
                        </p>
                      )}

                      {typeDetails.type === "DELIVERY" && b.deliveryAddress && (
                        <p className="text-xs text-foreground font-medium flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-accent" /> Deliver to: {b.deliveryAddress}
                        </p>
                      )}

                      {/* Pre-order payment summary */}
                      {b.paymentRequired && (
                        <p className="text-xs text-foreground flex flex-wrap items-center gap-x-1.5">
                          <CreditCard className="size-3.5 text-accent" />
                          {b.status === "pending_payment" ? (
                            <span>
                              Pay {formatPaise(b.depositDuePaise)} online by {formatIst(b.paymentExpiresAt, false)} IST to confirm
                            </span>
                          ) : (
                            <span>
                              Paid online {formatPaise(b.amountPaidPaise)}
                              {(b.balanceDuePaise ?? 0) > 0 && !["cancelled", "no_show", "expired"].includes(b.status) && (
                                <> · Balance at the cafe {formatPaise(b.balanceDuePaise)}</>
                              )}
                            </span>
                          )}
                        </p>
                      )}
                      {b.forfeitReason && b.paymentState === "FORFEITED" && (
                        <p className="text-xs text-destructive">Deposit forfeited: {b.forfeitReason}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {/* Retry payment for an unpaid pre-order */}
                    {needsOnlinePayment(b) && (
                      <Button
                        size="sm"
                        onClick={() => handlePayNow(b)}
                        disabled={payingCode === b.code}
                        className="text-xs"
                      >
                        <CreditCard className="size-3.5 mr-1.5" />
                        {payingCode === b.code
                          ? "Opening payment…"
                          : `Pay ${formatPaise(b.status === "pending_payment" ? b.depositDuePaise : (b.totalAmountPaise ?? b.total * 100))} now`}
                      </Button>
                    )}

                    {/* Cancel Option for Upcoming Bookings */}
                    {isUpcoming && !isCancelled && !["no_show", "expired", "completed"].includes(b.status) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelBooking(b)}
                        disabled={cancellingCode === b.code}
                        className="text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                      >
                        <Ban className="size-3.5 mr-1.5" />
                        {cancellingCode === b.code ? "Cancelling…" : "Cancel Reservation"}
                      </Button>
                    )}

                    {/* Digital PDF Receipt Download */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadReceipt(b)}
                      disabled={downloadingCode === b.code}
                      className="text-xs border-border/80 hover:bg-secondary/60 text-foreground"
                    >
                      <Download className="size-3.5 mr-1.5 text-accent" />
                      {downloadingCode === b.code ? "Generating…" : "Receipt (PDF)"}
                    </Button>

                    {/* Rebook Shortcut */}
                    <Button
                      size="sm"
                      onClick={() => handleRebook(b)}
                      className="text-xs font-semibold bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
                    >
                      <RotateCcw className="size-3.5 mr-1.5" /> Rebook Table
                    </Button>
                  </div>
                </div>

                {/* Items breakdown */}
                {b.items && b.items.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Pre-Ordered Menu Items:
                      </p>
                      {!isCancelled && (
                        <span className="text-xs font-medium text-muted-foreground">{formatItemProgress(b.items)}</span>
                      )}
                    </div>

                    {/* Kitchen progress: share of live items that are ready or served */}
                    {!isCancelled && (() => {
                      const p = getItemProgress(b.items);
                      const pct = p.total > 0 ? Math.round(((p.ready + p.served) / p.total) * 100) : 0;
                      return (
                        <div
                          className="h-1.5 w-full rounded-full bg-secondary overflow-hidden"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Kitchen progress"
                        >
                          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      );
                    })()}

                    <div className="grid gap-2 sm:grid-cols-2">
                      {preOrdered.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3.5 py-2 text-xs"
                        >
                          <span className="font-medium text-foreground min-w-0 truncate">
                            {it.qty ?? 1} × {it.name || it.id}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${ITEM_STATUS_BADGE_CLASS[it.status]}`}>
                              {ITEM_STATUS_LABELS[it.status]}
                            </span>
                            <span className="text-accent font-semibold">₹{(it.price ?? 0) * (it.qty ?? 1)}</span>
                          </span>
                        </div>
                      ))}
                      {atTable.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-secondary/20 border border-border/50 px-3.5 py-2 text-xs"
                        >
                          <span className="text-muted-foreground min-w-0 truncate">
                            {it.qty ?? 1} × {it.name || it.id} (At Table)
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${ITEM_STATUS_BADGE_CLASS[it.status]}`}>
                              {ITEM_STATUS_LABELS[it.status]}
                            </span>
                            <span className="text-muted-foreground">₹{(it.price ?? 0) * (it.qty ?? 1)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cafe WiFi for the customer's own dine-in reservations from today on (the server enforces the exact window) */}
                {user && typeDetails.type === "DINE_IN" && (isUpcoming || b.date >= new Date().toISOString().slice(0, 10)) && !["cancelled", "no_show", "expired"].includes(b.status) && (
                  <WifiCard code={b.code} refreshKey={b.status} className="mt-5" />
                )}

                {/* Footer notes & total */}
                <div className="mt-5 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="text-muted-foreground">
                    Guest: <span className="font-medium text-foreground">{b.name}</span> ({b.phone})
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    Total: <span className="text-accent text-base">₹{b.total}</span> (
                    {b.paymentMethod === "upi_prepay" ? "UPI Prepaid" : "Pay on Arrival"})
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
