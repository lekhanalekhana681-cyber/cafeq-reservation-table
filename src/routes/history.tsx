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
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { getUserBookings, cancelBooking, type BookingInput } from "@/lib/bookings.functions";
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

  const fetchBookings = async (customPhone?: string) => {
    setLoading(true);
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
        const stored = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
        setBookings(stored.reverse());
      }
    } catch {
      toast.error("Could not retrieve bookings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchBookings();
    }
  }, [user, authLoading, search.phone]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchPhone.trim()) return;
    fetchBookings(searchPhone);
  };

  const handleCancelBooking = async (code: string) => {
    if (!window.confirm(`Are you sure you want to cancel reservation ${code}?`)) {
      return;
    }

    setCancellingCode(code);
    try {
      await cancelBooking({ code, userId: user?.id });
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

        {!isAuthenticated && (
          <Button asChild size="sm" className="shrink-0 shadow-sm">
            <Link to="/login" search={{ redirect: "/history" }}>
              <LogIn className="size-4 mr-1.5" /> Sign In for Full History
            </Link>
          </Button>
        )}
      </div>

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
                      <Badge variant="secondary" className="text-xs">
                        {tableInfo?.name || b.seating}
                      </Badge>
                      {isCancelled ? (
                        <Badge variant="destructive" className="text-xs">
                          Cancelled
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
                    <p className="mt-2 text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                      <CalendarCheck className="size-4 text-accent" />
                      <span className="font-medium text-foreground">{b.date}</span> at{" "}
                      <span className="font-medium text-foreground">{b.time}</span> · {b.party}{" "}
                      {b.party === 1 ? "Guest" : "Guests"}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {/* Cancel Option for Upcoming Bookings */}
                    {isUpcoming && !isCancelled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelBooking(b.code)}
                        disabled={cancellingCode === b.code}
                        className="text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                      >
                        <Ban className="size-3.5 mr-1.5" />
                        {cancellingCode === b.code ? "Cancelling…" : "Cancel Reservation"}
                      </Button>
                    )}

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
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Pre-Ordered Menu Items:
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {preOrdered.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between rounded-xl bg-secondary/50 px-3.5 py-2 text-xs"
                        >
                          <span className="font-medium text-foreground">
                            {it.qty} × {it.name}
                          </span>
                          <span className="text-accent font-semibold">₹{it.price * it.qty}</span>
                        </div>
                      ))}
                      {atTable.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between rounded-xl bg-secondary/20 border border-border/50 px-3.5 py-2 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {it.qty} × {it.name} (At Table)
                          </span>
                          <span className="text-muted-foreground">₹{it.price * it.qty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
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
