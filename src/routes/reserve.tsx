import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Check,
  Minus,
  Plus,
  Clock,
  Flame,
  ShieldCheck,
  ChefHat,
  Sparkles,
  Utensils,
  Coffee,
  Info,
  RotateCcw,
  QrCode,
  Banknote,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-qr-code";

import { categories as categoriesRaw, menu as menuRaw, tableTypes as tableTypesRaw } from "@/data/menu";

const categories = categoriesRaw ?? [];
const menu = menuRaw ?? [];
const tableTypes = tableTypesRaw ?? [];
import {
  createBooking,
  evaluateSlotAndCustomer,
  getUserBookings,
  updateBookingPaymentStatus,
  type OrderItem,
} from "@/lib/bookings.functions";
import { sendBookingConfirmationNotifications } from "@/lib/notifications.functions";
import { getCafeSettings } from "@/lib/settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageBackground } from "@/components/PageBackground";

export const Route = createFileRoute("/reserve")({
  validateSearch: (search: Record<string, unknown>): { phone?: string; rebook?: string } => ({
    phone: (search["phone"] as string) || undefined,
    rebook: (search["rebook"] as string) || undefined,
  }),
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(settingsQueryOptions);
    } catch (err) {
      console.error("Failed to load cafe settings:", err);
    }
  },
  component: ReservePage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-xl px-5 py-20 text-center">
      <h1 className="text-2xl font-display">Something went wrong loading Reserve</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Please try again."}
      </p>
      <div className="mt-6 flex gap-4 justify-center">
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm"
        >
          Reload Page
        </button>
        <Link to="/" className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground text-sm">
          Go Home
        </Link>
      </div>
    </div>
  ),
});

const settingsQueryOptions = {
  queryKey: ["cafe-settings"],
  queryFn: () => getCafeSettings(),
};

const times = [
  "07:30",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:30",
  "16:00",
  "17:30",
];
const partySizes = [1, 2, 3, 4, 5, 6, 7, 8];
const dietaryOptions = ["Vegetarian", "Vegan", "Gluten-free", "Nut allergy", "Dairy-free", "Halal", "Kosher"];
const accessibilityOptions = ["High chair", "Pram space", "Wheelchair access", "Step-free entry"];
const occasions = [
  { value: "", label: "None / Casual" },
  { value: "Birthday", label: "Birthday" },
  { value: "Anniversary", label: "Anniversary" },
  { value: "Date", label: "Date" },
  { value: "Business meeting", label: "Business meeting" },
  { value: "Family brunch", label: "Family brunch" },
  { value: "Celebration", label: "Celebration" },
];

const inr = (usd: number) => Math.round(usd * 20);
const today = () => new Date().toISOString().slice(0, 10);
const genCode = () => `CQ-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

type CartItemState = {
  qty: number;
  fulfillment: "pre_ordered" | "at_table";
};

function ReservePage() {
  const { data: settingsData } = useQuery({
    ...settingsQueryOptions,
    initialData: { upiId: "cafeq@upi", upiPayeeName: "The CAFEQ" },
  });
  const settings = settingsData ?? {
    upiId: "cafeq@upi",
    upiPayeeName: "The CAFEQ",
  };
  const search = Route.useSearch();

  const [date, setDate] = useState(today());
  const [time, setTime] = useState("09:00");
  const [party, setParty] = useState(2);
  const [selectedTableType, setSelectedTableType] = useState<string>("window");
  const [hasPriorBookings, setHasPriorBookings] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(search.phone || "");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [occasion, setOccasion] = useState("");
  const [accessibility, setAccessibility] = useState<string[]>([]);
  const [windowPriority, setWindowPriority] = useState(false);

  // Merged flow toggle
  const [wantFoodOnArrival, setWantFoodOnArrival] = useState(true);
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>(categories?.[0] ?? "");

  // Cart
  const [cart, setCart] = useState<Record<string, CartItemState>>({});
  // Payment: qr_code vs cash
  const [paymentMethod, setPaymentMethod] = useState<"upi_prepay" | "pay_on_arrival">("upi_prepay");
  const [code, setCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Post-booking QR payment state
  const [qrPaymentStatus, setQrPaymentStatus] = useState<"pending" | "paid">("pending");
  const [txnRef, setTxnRef] = useState("");
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => {
    if (phone.trim().length >= 10) {
      getUserBookings(phone)
        .then((history) => {
          if (history && history.length > 0) {
            setHasPriorBookings(true);
            if (!name && history[0]?.name) setName(history[0].name);
            if (!email && history[0]?.customerEmail) setEmail(history[0].customerEmail);
          } else {
            setHasPriorBookings(false);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch user bookings:", err);
          setHasPriorBookings(false);
        });
    }
  }, [phone, name, email]);

  useEffect(() => {
    if (search.rebook) {
      try {
        const decoded = JSON.parse(decodeURIComponent(search.rebook));
        if (decoded.tableType) setSelectedTableType(decoded.tableType);
        if (decoded.party) setParty(decoded.party);
        if (decoded.dietary) setDietary(decoded.dietary);
        if (decoded.name) setName(decoded.name);
        if (decoded.phone) setPhone(decoded.phone);
        if (decoded.items && Array.isArray(decoded.items)) {
          const newCart: Record<string, CartItemState> = {};
          decoded.items.forEach((it: { id: string; qty: number; fulfillment?: "pre_ordered" | "at_table" }) => {
            newCart[it.id] = { qty: it.qty, fulfillment: it.fulfillment || "pre_ordered" };
          });
          setCart(newCart);
          setWantFoodOnArrival(true);
        }
        toast.info("Pre-filled your previous booking & favorite items!");
      } catch (err) {
        console.error("Failed to parse rebook query:", err);
      }
    }
  }, [search.rebook]);

  const slotEvaluation = useMemo(() => {
    return evaluateSlotAndCustomer({
      date,
      time,
      phone,
      hasPriorBookings,
      existingSlotOrders: 3,
    });
  }, [date, time, phone, hasPriorBookings]);

  const items: OrderItem[] = useMemo(() => {
    if (!wantFoodOnArrival) return [];
    return Object.entries(cart)
      .filter(([_, state]) => state.qty > 0)
      .map(([id, state]) => {
        const menuItem = menu.find((m) => m.id === id);
        return {
          id,
          name: menuItem ? menuItem.name : id,
          qty: state.qty,
          price: menuItem ? inr(menuItem.price) : 0,
          prepTimeMinutes: menuItem ? menuItem.prepTimeMinutes : 5,
          fulfillment: state.fulfillment,
        };
      });
  }, [cart, wantFoodOnArrival]);

  const preOrderedItems = useMemo(() => items.filter((i) => i.fulfillment === "pre_ordered"), [items]);
  const atTableItems = useMemo(() => items.filter((i) => i.fulfillment === "at_table"), [items]);

  const foodTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const totalWithDeposit = foodTotal + (slotEvaluation.depositRequired ? slotEvaluation.depositAmount : 0);

  const readyTimeEstimate = useMemo(() => {
    if (preOrderedItems.length === 0) return null;
    const maxItemPrep = Math.max(...preOrderedItems.map((i) => i.prepTimeMinutes), 0);
    const totalPrepMinutes = maxItemPrep + slotEvaluation.kitchenBufferMinutes;

    const [hourStr, minStr] = time.split(":");
    const startHour = parseInt(hourStr || "9", 10);
    const startMin = parseInt(minStr || "0", 10);

    const readyDate = new Date();
    readyDate.setHours(startHour, startMin + totalPrepMinutes, 0, 0);
    const readyTimeStr = readyDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    return {
      prepMinutes: totalPrepMinutes,
      readyTimeStr,
    };
  }, [preOrderedItems, time, slotEvaluation.kitchenBufferMinutes]);

  const toggle = (value: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) => {
      const current = prev[id] || { qty: 0, fulfillment: "pre_ordered" };
      const nextQty = Math.max(0, current.qty + delta);
      const copy = { ...prev };
      if (nextQty === 0) delete copy[id];
      else copy[id] = { ...current, qty: nextQty };
      return copy;
    });
  };

  const toggleFulfillment = (id: string) => {
    setCart((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return {
        ...prev,
        [id]: {
          ...current,
          fulfillment: current.fulfillment === "pre_ordered" ? "at_table" : "pre_ordered",
        },
      };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Add your name and phone number so we can hold your table.");
      return;
    }

    setSubmitting(true);
    const bookingCode = genCode();
    const initialPaymentStatus = paymentMethod === "upi_prepay" ? "pending_qr" : "pending_cash";

    try {
      await createBooking({
        data: {
          code: bookingCode,
          date,
          time,
          party,
          seating: tableTypes.find((t) => t.id === selectedTableType)?.name || selectedTableType,
          tableType: selectedTableType,
          hasPreorder: wantFoodOnArrival && items.length > 0,
          estimatedPrepTime: readyTimeEstimate ? readyTimeEstimate.prepMinutes : 0,
          foodReadyTime: readyTimeEstimate ? readyTimeEstimate.readyTimeStr : null,
          isPeakHour: slotEvaluation.isPeakHour,
          depositRequired: slotEvaluation.depositRequired,
          depositAmount: slotEvaluation.depositAmount,
          kitchenLoad: slotEvaluation.kitchenLoad,
          name: name.trim(),
          phone: phone.trim(),
          customerEmail: email.trim() || null,
          notes: notes.trim(),
          dietary,
          occasion: occasion || undefined,
          accessibility,
          windowPriority,
          items,
          total: totalWithDeposit,
          paymentMethod,
          paymentStatus: initialPaymentStatus,
        },
      });

      try {
        await sendBookingConfirmationNotifications({
          name: name.trim(),
          phone: phone.trim(),
          date,
          time,
          tableType: tableTypes.find((t) => t.id === selectedTableType)?.name || selectedTableType,
          partySize: party,
          bookingCode,
          preOrdered: wantFoodOnArrival && items.length > 0,
          totalAmount: totalWithDeposit,
        });
      } catch (err) {
        console.error("Failed to send notification:", err);
      }

      setCode(bookingCode);
      setQrPaymentStatus("pending");
      toast.success("Table reserved & booking recorded!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!code) return;
    setMarkingPaid(true);
    try {
      await updateBookingPaymentStatus({
        code,
        status: "paid",
        reference: txnRef.trim() || `UPI-TXN-${Date.now().toString().slice(-6)}`,
      });
      setQrPaymentStatus("paid");
      toast.success("Payment marked as verified!");
    } catch (err) {
      toast.error("Could not update payment status.");
    } finally {
      setMarkingPaid(false);
    }
  };

  const upiUrl = useMemo(() => {
    const params = new URLSearchParams({
      pa: settings?.upiId || "cafeq@upi",
      pn: settings?.upiPayeeName || "The CAFEQ",
      am: totalWithDeposit.toString(),
      cu: "INR",
      tn: `Cafeq-Order-${code || "pending"}`,
    });
    return `upi://pay?${params.toString()}`;
  }, [settings, totalWithDeposit, code]);

  if (code) {
    return (
      <>
        <PageBackground imageUrl="https://images.unsplash.com/photo-1559525839-b184a4d698c7?q=80&w=2000&auto=format&fit=crop" />
        <div className="mx-auto max-w-xl px-5 py-20 text-center relative z-10 bg-background/80 backdrop-blur-md rounded-3xl mt-12 border border-border/50">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg">
          <Check className="size-7" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl sm:text-4xl font-display">You're Booked, {name.split(" ")[0]}!</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          {party} {party === 1 ? "Guest" : "Guests"} · {tableTypes.find((t) => t.id === selectedTableType)?.name} · {date} at {time}
        </p>

        <div className="mt-6 inline-block rounded-xl bg-secondary/70 border border-border px-6 py-3">
          <p className="eyebrow text-[11px]">Booking Order Code</p>
          <p className="mt-1 font-display text-3xl tracking-widest text-foreground font-bold">{code}</p>
        </div>

        {/* Payment Confirmation Component: QR Code vs Cash on Arrival */}
        {paymentMethod === "upi_prepay" ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-left shadow-warm">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Payment Option: UPI QR Code</p>
                <h3 className="text-lg font-semibold text-foreground mt-0.5">Scan to Pay ₹{totalWithDeposit}</h3>
              </div>
              <Badge
                variant={qrPaymentStatus === "paid" ? "default" : "secondary"}
                className={qrPaymentStatus === "paid" ? "bg-emerald-600 text-white" : "bg-amber-500/10 text-amber-700"}
              >
                {qrPaymentStatus === "paid" ? "✅ Payment Verified" : "⏳ Pending Payment"}
              </Badge>
            </div>

            {qrPaymentStatus === "pending" ? (
              <div className="mt-5 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Scan this dynamic QR code using Google Pay, PhonePe, Paytm, or any UPI app to complete your order payment.
                </p>
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="rounded-xl bg-white p-4 shadow-md flex items-center justify-center border border-border/80">
                    <QRCode value={upiUrl} size={180} />
                  </div>
                  <div className="text-center text-xs">
                    <p className="font-semibold text-foreground">{settings.upiPayeeName}</p>
                    <p className="text-muted-foreground">{settings.upiId}</p>
                    <p className="mt-1 font-mono text-muted-foreground">Ref: Cafeq-Order-{code}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/60 space-y-3">
                  <Label htmlFor="txn" className="text-xs">UPI Transaction ID / UTR (Optional)</Label>
                  <Input
                    id="txn"
                    placeholder="e.g. 403829104829"
                    value={txnRef}
                    onChange={(e) => setTxnRef(e.target.value)}
                    className="text-xs h-8"
                  />
                  <Button
                    onClick={handleMarkAsPaid}
                    disabled={markingPaid}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium"
                    size="sm"
                  >
                    <CheckCircle2 className="size-4 mr-2" />
                    {markingPaid ? "Verifying…" : "I have completed payment — Mark as Paid"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center space-y-1">
                <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                  Payment Confirmed & Settled!
                </p>
                <p className="text-xs text-muted-foreground">
                  Your payment receipt of ₹{totalWithDeposit} has been logged under code {code}.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-left shadow-warm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="size-5 text-accent" />
                <h3 className="font-semibold text-base text-foreground">Cash on Arrival</h3>
              </div>
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 text-xs">
                Pending Cash at Counter
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your table is reserved and dishes are queued. Settle your bill of <strong>₹{totalWithDeposit}</strong> in cash at the counter when you visit. Staff will confirm payment on arrival.
            </p>
          </div>
        )}

        {readyTimeEstimate && (
          <div className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-left flex items-start gap-3">
            <ChefHat className="size-5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-foreground">
                Target Food Serving Time: {readyTimeEstimate.readyTimeStr}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Our kitchen will time preparation so your dishes land fresh and warm the minute you sit down.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="outline" asChild>
            <Link to="/history" search={{ phone }}>
              View in My Bookings
            </Link>
          </Button>
          <Button asChild>
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <PageBackground imageUrl="https://images.unsplash.com/photo-1559525839-b184a4d698c7?q=80&w=2000&auto=format&fit=crop" />
      <form onSubmit={submit} className="mx-auto max-w-6xl px-8 py-16 relative z-10 bg-background/80 backdrop-blur-md my-12 rounded-3xl border border-border/50">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-border/70 pb-6">
        <div>
          <p className="eyebrow">Table & Food Booking</p>
          <h1 className="mt-2 text-4xl sm:text-5xl font-display">Reserve Your Spot</h1>
          <p className="mt-2 max-w-xl text-muted-foreground text-sm">
            Choose your table type, timing, and pre-order plates with QR code or cash checkout.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-xs text-accent">
          <Link to="/history">
            <RotateCcw className="size-3.5 mr-1.5" /> Rebook Past Order
          </Link>
        </Button>
      </div>

      {/* Live Kitchen Load Indicator Banner */}
      <div className="mt-8 rounded-xl border border-border/70 bg-card p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`size-3 rounded-full shrink-0 animate-pulse ${
              slotEvaluation.kitchenLoad === "high"
                ? "bg-red-500 shadow-red-500/50"
                : slotEvaluation.kitchenLoad === "busy"
                ? "bg-amber-500 shadow-amber-500/50"
                : "bg-emerald-500 shadow-emerald-500/50"
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">Live Kitchen Load:</span>
              <Badge
                variant="secondary"
                className={`text-xs capitalize font-medium ${
                  slotEvaluation.kitchenLoad === "high"
                    ? "bg-red-500/10 text-red-600 border-red-500/20"
                    : slotEvaluation.kitchenLoad === "busy"
                    ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                }`}
              >
                {slotEvaluation.kitchenLoad === "high"
                  ? "Peak Rush (+10m buffer)"
                  : slotEvaluation.kitchenLoad === "busy"
                  ? "Moderate Busy (+5m buffer)"
                  : "Normal (~5-10m Standard)"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {slotEvaluation.kitchenLoad === "normal"
                ? "Kitchen running smoothly. Pre-orders prepared within standard prep time."
                : `Active orders in this slot. Prep times include +${slotEvaluation.kitchenBufferMinutes}m buffer.`}
            </p>
          </div>
        </div>

        {slotEvaluation.isPeakHour && (
          <div className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-1.5 text-xs text-accent font-medium shrink-0">
            <Flame className="size-4 text-accent" />
            <span>Peak Window Slot</span>
          </div>
        )}
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_370px]">
        <div className="space-y-12">
          {/* STEP 1: Date, Time & Party */}
          <section>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                1
              </span>
              <h2 className="text-xl font-display">Date & Time Slot</h2>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="date">Reservation Date</Label>
                <Input
                  id="date"
                  type="date"
                  min={today()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Party Size</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {partySizes.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      size="sm"
                      variant={party === p ? "default" : "outline"}
                      onClick={() => setParty(p)}
                      className="size-9 p-0"
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6">
              <Label>Available Time Slots</Label>
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2">
                {times.map((t) => {
                  const isSlotPeak = ["08:30", "09:00", "09:30", "17:30"].includes(t);
                  return (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={time === t ? "default" : "outline"}
                      onClick={() => setTime(t)}
                      className={`relative flex flex-col items-center py-2 h-auto ${
                        time === t ? "ring-2 ring-accent" : ""
                      }`}
                    >
                      <span className="font-semibold text-xs">{t}</span>
                      {isSlotPeak && (
                        <span className="text-[9px] text-accent/80 flex items-center gap-0.5 mt-0.5">
                          <Flame className="size-2.5" /> Peak
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* STEP 2: Table Type Selection */}
          <section>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                2
              </span>
              <h2 className="text-xl font-display">Select Table Type</h2>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {tableTypes.map((table) => {
                const isSelected = selectedTableType === table.id;
                const isCapacityFit = party >= table.minCapacity && party <= table.maxCapacity;
                const availableLeft = Math.max(1, table.totalTables - (party % 3));

                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setSelectedTableType(table.id)}
                    className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-accent bg-accent/10 shadow-sm ring-1 ring-accent"
                        : "border-border/80 bg-card hover:bg-secondary/40 hover:border-border"
                    } ${!isCapacityFit ? "opacity-75" : ""}`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-base text-foreground">{table.name}</span>
                        <Badge
                          variant={isSelected ? "default" : "secondary"}
                          className="text-[10px] font-normal"
                        >
                          {table.tag}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                        {table.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Seats: {table.minCapacity}–{table.maxCapacity} guests
                      </span>
                      <span className="font-medium text-accent">
                        🟢 {availableLeft} {availableLeft === 1 ? "table left" : "tables available"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* STEP 3: Merged Pre-Order Flow */}
          <section className="rounded-2xl border border-border/80 bg-secondary/30 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                  3
                </span>
                <div>
                  <h2 className="text-xl font-display">Food & Drinks Ready on Arrival?</h2>
                  <p className="text-xs text-muted-foreground">
                    Optional inline pre-order so coffees & bakery land the minute you sit down.
                  </p>
                </div>
              </div>

              <div className="flex items-center rounded-xl border border-border bg-background p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setWantFoodOnArrival(true)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    wantFoodOnArrival
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="size-3.5" /> Yes, Pre-order
                </button>
                <button
                  type="button"
                  onClick={() => setWantFoodOnArrival(false)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    !wantFoodOnArrival
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Order at Café
                </button>
              </div>
            </div>

            {wantFoodOnArrival && (
              <div className="mt-8 space-y-6 animate-in fade-in-50 duration-300">
                {readyTimeEstimate && (
                  <div className="rounded-xl border border-accent/40 bg-accent/15 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-accent flex items-center justify-center text-accent-foreground shrink-0">
                        <Clock className="size-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">
                          Estimated Serve Time: Ready by {readyTimeEstimate.readyTimeStr}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Max item prep ~{readyTimeEstimate.prepMinutes} mins (including {slotEvaluation.kitchenBufferMinutes}m load buffer). Timed for arrival at {time}.
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-background/80 shrink-0 text-xs">
                      ⚡ Timed Kitchen Prep
                    </Badge>
                  </div>
                )}

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-border/70">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategoryTab(cat)}
                      className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        activeCategoryTab === cat
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "bg-background text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3">
                  {menu
                    .filter((m) => m.category === activeCategoryTab)
                    .map((item) => {
                      const itemCartState = cart[item.id];
                      const qty = itemCartState?.qty || 0;
                      const isPreorder = itemCartState?.fulfillment === "pre_ordered";

                      return (
                        <div
                          key={item.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border/70 bg-card p-3.5 shadow-xs hover:border-accent/40 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {item.image && (
                              <img
                                src={item.image}
                                alt={item.name}
                                className="size-16 rounded-lg object-cover shrink-0"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-sm text-foreground truncate">{item.name}</h4>
                                {item.tag && (
                                  <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
                                    {item.tag}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                              <div className="mt-1 flex items-center gap-3 text-xs">
                                <span className="font-semibold text-accent">₹{inr(item.price)}</span>
                                <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                                  <Clock className="size-3" /> ~{item.prepTimeMinutes}m prep
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                            {qty > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleFulfillment(item.id)}
                                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors border cursor-pointer ${
                                  isPreorder
                                    ? "bg-accent/15 text-accent border-accent/30"
                                    : "bg-secondary text-muted-foreground border-border"
                                }`}
                              >
                                {isPreorder ? "🍽️ Ready on Arrival" : "⏳ Order at Table"}
                              </button>
                            )}

                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="size-8"
                                aria-label={`Remove one ${item.name}`}
                                onClick={() => changeQty(item.id, -1)}
                              >
                                <Minus className="size-3.5" />
                              </Button>
                              <span className="w-5 text-center text-sm font-semibold">{qty}</span>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="size-8"
                                aria-label={`Add one ${item.name}`}
                                onClick={() => changeQty(item.id, 1)}
                              >
                                <Plus className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </section>

          {/* STEP 4: Preferences & Notes */}
          <section>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                4
              </span>
              <h2 className="text-xl font-display">Preferences & Requests</h2>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <Label>Dietary Requirements</Label>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {dietaryOptions.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary/60 cursor-pointer"
                    >
                      <Checkbox
                        checked={dietary.includes(opt)}
                        onCheckedChange={() => toggle(opt, dietary, setDietary)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="occasion">Occasion</Label>
                  <Select value={occasion} onValueChange={setOccasion}>
                    <SelectTrigger id="occasion" className="mt-2 w-full">
                      <SelectValue placeholder="Select an occasion" />
                    </SelectTrigger>
                    <SelectContent>
                      {occasions.map((o) => (
                        <SelectItem key={o.value || "none"} value={o.value || "none"}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Accessibility Needs</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {accessibilityOptions.map((opt) => (
                      <label
                        key={opt}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:bg-secondary/60 cursor-pointer"
                      >
                        <Checkbox
                          checked={accessibility.includes(opt)}
                          onCheckedChange={() => toggle(opt, accessibility, setAccessibility)}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Special Notes for Head Barista & Chef</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, birthday candle requests, quiet booth requests…"
                  className="mt-2"
                  rows={2}
                />
              </div>
            </div>
          </section>
        </div>

        {/* SIDEBAR BOOKING SUMMARY */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-warm">
            <h3 className="text-xl font-display text-foreground">Reservation Summary</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {date} · {time} · {party} {party === 1 ? "Guest" : "Guests"}
            </p>
            <p className="text-xs font-medium text-accent mt-0.5">
              📍 {tableTypes.find((t) => t.id === selectedTableType)?.name}
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Lekhana B S"
                  className="mt-1.5"
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 90000 00000"
                  className="mt-1.5"
                  required
                />
                {hasPriorBookings && (
                  <p className="mt-1 text-[11px] text-emerald-600 flex items-center gap-1">
                    <ShieldCheck className="size-3.5" /> Welcome back! Repeat guest verified.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="email">Email (Optional for confirmation)</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="lekhana@example.com"
                  className="mt-1.5 text-xs"
                />
              </div>
            </div>

            {items.length > 0 && (
              <div className="mt-6 border-t border-border/70 pt-4 text-xs space-y-3">
                <p className="eyebrow">Pre-Order Cart ({items.length} items)</p>

                {preOrderedItems.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-accent flex items-center gap-1 mb-1">
                      <Sparkles className="size-3" /> Ready on Arrival:
                    </span>
                    <ul className="space-y-1 pl-1">
                      {preOrderedItems.map((i) => (
                        <li key={i.id} className="flex justify-between text-muted-foreground">
                          <span>
                            {i.qty} × {i.name}
                          </span>
                          <span className="font-medium text-foreground">₹{i.price * i.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {atTableItems.length > 0 && (
                  <div className="pt-2 border-t border-dashed border-border/60">
                    <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                      <Utensils className="size-3" /> Order at Table:
                    </span>
                    <ul className="space-y-1 pl-1">
                      {atTableItems.map((i) => (
                        <li key={i.id} className="flex justify-between text-muted-foreground">
                          <span>
                            {i.qty} × {i.name}
                          </span>
                          <span className="font-medium text-foreground">₹{i.price * i.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-between font-medium pt-2 border-t border-border/60 text-sm">
                  <span>Food Total</span>
                  <span>₹{foodTotal}</span>
                </div>
              </div>
            )}

            {/* Feature 1 & 5: Payment Options (QR Code vs Cash on Arrival) */}
            <div className="mt-5 space-y-2.5 border-t border-border/70 pt-4">
              <p className="text-xs font-semibold text-foreground">Payment Method</p>

              <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors text-xs ${
                paymentMethod === "upi_prepay" ? "border-accent bg-accent/10" : "border-border hover:bg-secondary/40"
              }`}>
                <input
                  type="radio"
                  name="payment"
                  className="mt-0.5"
                  checked={paymentMethod === "upi_prepay"}
                  onChange={() => setPaymentMethod("upi_prepay")}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground flex items-center gap-1">
                      <QrCode className="size-3.5 text-accent" /> QR Code Payment (UPI)
                    </p>
                    <Badge variant="secondary" className="text-[10px]">Instant</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Scan with UPI on confirmation & mark as paid.
                  </p>
                </div>
              </label>

              <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors text-xs ${
                paymentMethod === "pay_on_arrival" ? "border-accent bg-accent/10" : "border-border hover:bg-secondary/40"
              }`}>
                <input
                  type="radio"
                  name="payment"
                  className="mt-0.5"
                  checked={paymentMethod === "pay_on_arrival"}
                  onChange={() => setPaymentMethod("pay_on_arrival")}
                />
                <div className="flex-1">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    <Banknote className="size-3.5 text-muted-foreground" /> Pay at Counter (Cash)
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Order flagged for staff confirmation on arrival.
                  </p>
                </div>
              </label>
            </div>

            <div className="mt-4 pt-3 border-t border-border/70 flex justify-between items-baseline">
              <span className="font-semibold text-sm">Total Due</span>
              <span className="font-bold text-accent text-xl">₹{totalWithDeposit}</span>
            </div>

            <Button type="submit" className="mt-6 w-full shadow-md" size="lg" disabled={submitting}>
              {submitting ? "Confirming Table…" : "Confirm Table & Pre-Order"}
            </Button>
          </div>
        </aside>
      </div>
    </form>
    </>
  );
}
