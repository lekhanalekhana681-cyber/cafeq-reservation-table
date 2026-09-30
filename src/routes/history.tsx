import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  RotateCcw,
  CalendarCheck,
  Search,
  Clock,
  Sparkles,
  Utensils,
  ChefHat,
  Coffee,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import { getUserBookings, type BookingInput } from "@/lib/bookings.functions";
import { tableTypes } from "@/data/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/history")({
  validateSearch: (search: Record<string, unknown>): { phone?: string } => ({
    phone: (search["phone"] as string) || undefined,
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [searchPhone, setSearchPhone] = useState(search.phone || "");
  const [bookings, setBookings] = useState<BookingInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchHistory = async (phoneToLookup: string) => {
    if (!phoneToLookup.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const results = await getUserBookings(phoneToLookup);
      setBookings(results);
    } catch (err) {
      toast.error("Could not retrieve bookings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (search.phone) {
      fetchHistory(search.phone);
    } else {
      // Check local storage for recent bookings
      try {
        const stored = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
        if (stored.length > 0) {
          setBookings(stored.reverse());
          setHasSearched(true);
        }
      } catch {
        // Ignore
      }
    }
  }, [search.phone]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory(searchPhone);
  };

  // Feature 7: 1-Click Rebook & Reorder handler
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

  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <div className="border-b border-border/70 pb-6">
        <p className="eyebrow">Guest Portal</p>
        <h1 className="mt-2 text-4xl sm:text-5xl font-display">My Bookings & Reorder</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          View your previous table reservations and quickly rebook your favorite table and pre-ordered dishes with a single click.
        </p>
      </div>

      {/* Lookup by Phone */}
      <form onSubmit={handleSearch} className="mt-8 flex gap-3 max-w-md">
        <div className="flex-1">
          <Input
            type="tel"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            placeholder="Enter your phone (+91 90000 00000)"
            className="w-full"
          />
        </div>
        <Button type="submit" disabled={loading}>
          <Search className="size-4 mr-2" /> {loading ? "Searching…" : "Find Bookings"}
        </Button>
      </form>

      {/* Bookings List */}
      <div className="mt-12 space-y-6">
        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card/40">
            <Coffee className="size-10 text-accent/60 mx-auto" />
            <h3 className="mt-4 text-lg font-semibold">
              {hasSearched ? "No bookings found for this number" : "No recent bookings"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
              Reserve your first table at Cafeq to enjoy slow mornings, artisan coffee, and pre-ordered bakes.
            </p>
            <Button asChild className="mt-6">
              <Link to="/reserve">Book a Table Now</Link>
            </Button>
          </div>
        ) : (
          bookings.map((b) => {
            const tableInfo = tableTypes.find((t) => t.id === b.tableType);
            const preOrdered = b.items?.filter((i) => i.fulfillment === "pre_ordered") || [];
            const atTable = b.items?.filter((i) => i.fulfillment === "at_table") || [];

            return (
              <article
                key={b.code}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-xl text-foreground">{b.code}</span>
                      <Badge variant="secondary" className="text-xs">
                        {tableInfo?.name || b.seating}
                      </Badge>
                      {b.isPeakHour && (
                        <Badge variant="outline" className="text-xs text-accent border-accent/40">
                          Peak Slot
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                      <CalendarCheck className="size-3.5" /> {b.date} at {b.time} · {b.party} {b.party === 1 ? "Guest" : "Guests"}
                    </p>
                  </div>

                  {/* Feature 7: Rebook Shortcut Action */}
                  <Button
                    onClick={() => handleRebook(b)}
                    className="shrink-0 bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
                  >
                    <RotateCcw className="size-4 mr-2" /> Rebook Table + Reorder Items
                  </Button>
                </div>

                {/* Items breakdown */}
                {b.items && b.items.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Ordered Menu Items:
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {preOrdered.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-foreground">
                            {it.qty} × {it.name}
                          </span>
                          <span className="text-accent font-medium">₹{it.price * it.qty}</span>
                        </div>
                      ))}
                      {atTable.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between rounded-lg bg-secondary/20 border border-border/50 px-3 py-2 text-xs"
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

                <div className="mt-5 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="text-muted-foreground">
                    Guest: <span className="font-medium text-foreground">{b.name}</span> ({b.phone})
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    Total: <span className="text-accent text-base">₹{b.total}</span> ({b.paymentMethod === "upi_prepay" ? "UPI Prepaid" : "Pay on Arrival"})
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
