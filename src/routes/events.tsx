import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  CalendarDays,
  Clock,
  Ticket,
  Users,
  X,
  CheckCircle2,
  QrCode,
  Banknote,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import QRCode from "react-qr-code";
import { toast } from "sonner";

import {
  getEvents,
  registerForEvent,
  updateEventRegistrationPayment,
  EVENT_REGISTRATION_FEE,
  type EventItem,
  type EventRegistration,
} from "@/lib/events.functions";
import { sendEventRegistrationNotifications } from "@/lib/notifications.functions";
import { getCafeSettings } from "@/lib/settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageBackground } from "@/components/PageBackground";

// ─── Route ────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/events")({
  component: EventsPage,
});

const eventsQueryOptions = { queryKey: ["events"], queryFn: () => getEvents(), staleTime: Infinity, refetchOnWindowFocus: false };
const settingsQueryOptions = { queryKey: ["cafe-settings"], queryFn: () => getCafeSettings(), staleTime: Infinity, refetchOnWindowFocus: false };

// ─── Date helpers ─────────────────────────────────────────────────────────────
function formatDate(date?: string | null) {
  if (!date) return "TBA";
  return new Date(date).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ─── Registration modal / inline panel ───────────────────────────────────────
type RegistrationStep = "form" | "payment" | "done";

interface RegPanelProps {
  event: EventItem;
  upiId: string;
  upiPayeeName: string;
  onClose: () => void;
}

function RegistrationPanel({ event, upiId, upiPayeeName, onClose }: RegPanelProps) {
  const [step, setStep] = useState<RegistrationStep>("form");
  const [form, setForm] = useState({ name: "", phone: "", email: "", attendees: "1" });
  const [payMethod, setPayMethod] = useState<"upi_prepay" | "pay_on_arrival">("upi_prepay");
  const [txRef, setTxRef] = useState("");
  const [registration, setRegistration] = useState<EventRegistration | null>(null);

  const attendees = Math.max(1, parseInt(form.attendees || "1", 10));
  const totalAmount = attendees * EVENT_REGISTRATION_FEE;

  // UPI deep-link for QR
  const upiLink = registration
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${totalAmount}&cu=INR&tn=Cafeq-Event-${registration.id.slice(-6)}`
    : "";

  const registerMutation = useMutation({
    mutationFn: async () => {
      const reg = await registerForEvent({
        event_id: event.id,
        event_title: event.title,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        attendees,
        total_amount: totalAmount,
        payment_method: payMethod,
        payment_status: payMethod === "upi_prepay" ? "pending_qr" : "pending_cash",
      });

      try {
        await sendEventRegistrationNotifications({
          name: form.name.trim(),
          phone: form.phone.trim(),
          eventTitle: event.title,
          eventDate: formatDate(event.event_date),
          eventTime: event.event_time ?? "TBA",
          attendees,
          totalAmount,
          paymentStatus: payMethod === "upi_prepay" ? "pending_qr" : "pending_cash",
          registrationId: reg.id,
        });
      } catch (err) {
        console.error("Failed to send notification:", err);
      }

      return reg;
    },
    onSuccess: (reg) => {
      setRegistration(reg);
      if (payMethod === "pay_on_arrival") {
        setStep("done");
      } else {
        setStep("payment");
      }
    },
    onError: () => toast.error("Registration failed, please try again."),
  });

  const markPaidMutation = useMutation({
    mutationFn: () =>
      updateEventRegistrationPayment(registration!.id, "paid", txRef || undefined),
    onSuccess: () => setStep("done"),
    onError: () => toast.error("Could not update payment status."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Please enter your name."); return; }
    if (!form.phone.trim() || !/^\+?[0-9]{7,15}$/.test(form.phone.trim())) {
      toast.error("Enter a valid phone number."); return;
    }
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email.trim())) {
      toast.error("Enter a valid email address."); return;
    }
    registerMutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 p-5">
          <div>
            <p className="text-xs text-accent font-medium uppercase tracking-widest">Register</p>
            <h2 className="mt-0.5 text-lg font-semibold leading-snug">{event.title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDate(event.event_date)} · {event.event_time ?? "TBA"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="mt-0.5 rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Step: Form */}
        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="reg-name">Full name *</Label>
                <Input
                  id="reg-name"
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-phone">Phone *</Label>
                <Input
                  id="reg-phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reg-email">Email *</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reg-attendees">Number of attendees</Label>
              <Input
                id="reg-attendees"
                type="number"
                min={1}
                max={20}
                value={form.attendees}
                onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
              />
            </div>

            {/* Fee summary */}
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {attendees} × ₹{EVENT_REGISTRATION_FEE}
                </span>
                <span className="font-semibold">₹{totalAmount}</span>
              </div>
            </div>

            {/* Payment method */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Payment</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { val: "upi_prepay", icon: QrCode, label: "UPI / QR Code" },
                    { val: "pay_on_arrival", icon: Banknote, label: "Cash on Arrival" },
                  ] as const
                ).map(({ val, icon: Icon, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPayMethod(val)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      payMethod === val
                        ? "border-accent bg-accent/10 text-accent font-medium"
                        : "border-border text-muted-foreground hover:border-accent/50"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? "Registering…" : `Confirm — ₹${totalAmount}`}
            </Button>
          </form>
        )}

        {/* Step: QR Payment */}
        {step === "payment" && registration && (
          <div className="space-y-4 p-5 text-center">
            <p className="text-sm text-muted-foreground">
              Scan the QR code with any UPI app to pay ₹{totalAmount}
            </p>
            <div className="mx-auto w-fit rounded-xl border border-border bg-white p-3">
              <QRCode value={upiLink} size={200} />
            </div>
            <p className="text-xs text-muted-foreground">UPI ID: {upiId}</p>
            <div className="space-y-2 text-left">
              <Label htmlFor="reg-txref">Transaction reference (optional)</Label>
              <Input
                id="reg-txref"
                placeholder="UTR / UPI ref number"
                value={txRef}
                onChange={(e) => setTxRef(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => markPaidMutation.mutate()}
              disabled={markPaidMutation.isPending}
            >
              {markPaidMutation.isPending ? "Confirming…" : "Mark as Paid ✓"}
            </Button>
            <button
              className="text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => setStep("done")}
            >
              I'll pay at the venue
            </button>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && registration && (
          <div className="space-y-4 p-6 text-center">
            <CheckCircle2 className="mx-auto size-12 text-green-500" />
            <h3 className="text-xl font-semibold">You're registered! 🎉</h3>
            <p className="text-sm text-muted-foreground">
              {registration.attendees} seat{registration.attendees > 1 ? "s" : ""} reserved for{" "}
              <strong>{event.title}</strong>.
              {registration.payment_status === "pending_cash"
                ? " Please pay ₹" + registration.total_amount + " at the venue."
                : " Payment received. See you there!"}
            </p>
            <p className="text-xs text-muted-foreground">
              Confirmation sent to {registration.email}
            </p>
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────
function EventCard({
  event,
  onRegister,
}: {
  event: EventItem;
  onRegister: (ev: EventItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="group flex flex-col rounded-2xl border border-border bg-card shadow-warm transition-shadow hover:shadow-lg overflow-hidden">
      {/* Coloured accent strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[--espresso] to-[--clay]" />

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2 text-xs text-accent font-medium">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <span>{formatDate(event.event_date)}</span>
          {event.event_time && (
            <>
              <span className="text-border">·</span>
              <Clock className="size-3.5" aria-hidden="true" />
              <span>{event.event_time}</span>
            </>
          )}
        </div>

        <h2 className="mt-2 text-lg font-semibold leading-snug">{event.title}</h2>

        {event.description && (
          <div>
            <p
              className={`mt-2 text-sm text-muted-foreground leading-relaxed ${!expanded ? "line-clamp-2" : ""}`}
            >
              {event.description}
            </p>
            {event.description.length > 100 && (
              <button
                className="mt-1 flex items-center gap-0.5 text-xs text-accent hover:underline"
                onClick={() => setExpanded((x) => !x)}
              >
                {expanded ? (
                  <>
                    Less <ChevronUp className="size-3" />
                  </>
                ) : (
                  <>
                    More <ChevronDown className="size-3" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        <div className="mt-auto pt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm">
            <Ticket className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold">
              {event.price === 0 ? "Free" : `₹${event.price ?? EVENT_REGISTRATION_FEE}`}
            </span>
            {(event.price ?? EVENT_REGISTRATION_FEE) > 0 && (
              <span className="text-xs text-muted-foreground">/ person</span>
            )}
          </div>
          <Button size="sm" onClick={() => onRegister(event)}>
            <Users className="size-3.5 mr-1.5" />
            Register
          </Button>
        </div>
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function EventsPage() {
  const { data: events } = useSuspenseQuery(eventsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);

  return (
    <>
      {activeEvent && (
        <RegistrationPanel
          event={activeEvent}
          upiId={settings?.upiId ?? "cafeq@upi"}
          upiPayeeName={settings?.upiPayeeName ?? "Cafeq"}
          onClose={() => setActiveEvent(null)}
        />
      )}

      <PageBackground imageUrl="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=2000&auto=format&fit=crop" />
      <div className="mx-auto max-w-6xl px-8 py-16 relative z-10 bg-background/80 backdrop-blur-md my-12 rounded-3xl border border-border/50">
        <p className="eyebrow">Happenings</p>
        <h1 className="mt-3 text-4xl sm:text-5xl">Events &amp; Gatherings</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          From latte art workshops to open mic nights and book clubs. Join us — every event is ₹
          {EVENT_REGISTRATION_FEE} per person.
        </p>

        {events.length === 0 ? (
          <div className="mt-16 rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">
              No events scheduled right now. Check back soon, or book a table any day.
            </p>
          </div>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} onRegister={setActiveEvent} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
