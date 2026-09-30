import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck,
  LogOut,
  CalendarCheck,
  Clock,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Coffee,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { getCurrentAdmin, logoutAdmin, type User } from "@/lib/auth";
import {
  getAllBookings,
  updateBookingStatus,
  type BookingInput,
  type BookingStatus,
} from "@/lib/bookings.functions";
import { tableTypes } from "@/data/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingInput[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "upcoming">("all");
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Route Guard / Protection
  useEffect(() => {
    const current = getCurrentAdmin();
    if (!current || current.role !== "admin") {
      toast.error("Access denied. Please authenticate as an administrator.");
      navigate({ to: "/admin/login" });
      return;
    }
    setAdmin(current);
    loadBookings();
  }, [navigate]);

  const loadBookings = async () => {
    setRefreshing(true);
    try {
      const data = await getAllBookings();
      setBookings(data);
    } catch {
      toast.error("Failed to load reservations list.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = () => {
    logoutAdmin();
    toast.success("Admin session terminated.");
    navigate({ to: "/admin/login" });
  };

  const handleUpdateStatus = async (code: string, newStatus: BookingStatus) => {
    setActionLoadingCode(code);
    try {
      await updateBookingStatus({ code, status: newStatus });
      toast.success(`Booking ${code} marked as ${newStatus}`);
      setBookings((prev) =>
        prev.map((b) => (b.code === code ? { ...b, status: newStatus } : b))
      );
    } catch {
      toast.error("Failed to update booking status.");
    } finally {
      setActionLoadingCode(null);
    }
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = bookings.length;
    const todayCount = bookings.filter((b) => b.date === todayStr).length;
    const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;
    const completedCount = bookings.filter((b) => b.status === "completed").length;
    const cancelledCount = bookings.filter((b) => b.status === "cancelled" || b.status === "no_show").length;
    const totalGuestsToday = bookings
      .filter((b) => b.date === todayStr && b.status !== "cancelled")
      .reduce((sum, b) => sum + (b.party || 0), 0);

    return {
      total,
      todayCount,
      confirmedCount,
      completedCount,
      cancelledCount,
      totalGuestsToday,
    };
  }, [bookings, todayStr]);

  // Filtered reservations
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesCode = b.code.toLowerCase().includes(q);
        const matchesName = b.name.toLowerCase().includes(q);
        const matchesPhone = b.phone.toLowerCase().includes(q);
        const matchesEmail = b.customerEmail?.toLowerCase().includes(q);
        if (!matchesCode && !matchesName && !matchesPhone && !matchesEmail) {
          return false;
        }
      }

      // Status
      if (statusFilter !== "all" && b.status !== statusFilter) {
        return false;
      }

      // Date
      if (dateFilter === "today" && b.date !== todayStr) {
        return false;
      }
      if (dateFilter === "upcoming" && b.date < todayStr) {
        return false;
      }

      return true;
    });
  }, [bookings, searchQuery, statusFilter, dateFilter, todayStr]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-400">
          <RefreshCw className="size-5 animate-spin text-amber-500" />
          <span>Verifying administrator permissions…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
      {/* Top Admin Header Bar */}
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-8 py-3.5">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-lg text-neutral-50 tracking-tight">
                  Cafe<span className="text-amber-500">Q</span> Admin
                </span>
                <span className="rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-semibold px-2 py-0.5 border border-amber-500/30">
                  Operations Console
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Logged in as <span className="font-medium text-neutral-200">{admin?.name}</span> ({admin?.email})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="text-xs bg-neutral-900 border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800"
            >
              <Link to="/">
                <ExternalLink className="size-3.5 mr-1.5" /> Customer Site
              </Link>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-xs border-red-900/50 text-red-400 hover:bg-red-950/50 hover:text-red-300"
            >
              <LogOut className="size-3.5 mr-1.5" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Admin Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-8 py-8 space-y-8">
        {/* KPI Metric Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
              <span>Today's Bookings</span>
              <CalendarCheck className="size-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-white">
              {metrics.todayCount}
            </p>
            <p className="mt-1 text-[11px] text-neutral-500">
              {metrics.totalGuestsToday} guests expected today
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
              <span>Total Bookings</span>
              <Clock className="size-4 text-neutral-400" />
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-white">
              {metrics.total}
            </p>
            <p className="mt-1 text-[11px] text-neutral-500">All-time reservations</p>
          </div>

          <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-4 shadow-sm">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-medium">
              <span>Confirmed</span>
              <CheckCircle2 className="size-4 text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-emerald-300">
              {metrics.confirmedCount}
            </p>
            <p className="mt-1 text-[11px] text-emerald-500/70">Awaiting arrival</p>
          </div>

          <div className="rounded-2xl border border-blue-900/40 bg-blue-950/20 p-4 shadow-sm">
            <div className="flex items-center justify-between text-blue-400 text-xs font-medium">
              <span>Completed</span>
              <Coffee className="size-4 text-blue-400" />
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-blue-300">
              {metrics.completedCount}
            </p>
            <p className="mt-1 text-[11px] text-blue-500/70">Dined successfully</p>
          </div>

          <div className="col-span-2 lg:col-span-1 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
              <span>Cancelled / No-show</span>
              <XCircle className="size-4 text-red-400" />
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-neutral-300">
              {metrics.cancelledCount}
            </p>
            <p className="mt-1 text-[11px] text-neutral-500">Voided slots</p>
          </div>
        </section>

        {/* Search & Filter Toolbar */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by guest name, phone, or CQ code…"
              className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 pl-10 text-xs h-10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date filter */}
            <div className="flex items-center rounded-xl bg-neutral-950 p-1 border border-neutral-800 text-xs">
              <button
                type="button"
                onClick={() => setDateFilter("all")}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  dateFilter === "all"
                    ? "bg-amber-600 text-neutral-950 font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                All Dates
              </button>
              <button
                type="button"
                onClick={() => setDateFilter("today")}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  dateFilter === "today"
                    ? "bg-amber-600 text-neutral-950 font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDateFilter("upcoming")}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  dateFilter === "upcoming"
                    ? "bg-amber-600 text-neutral-950 font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Upcoming
              </button>
            </div>

            {/* Status filter dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs px-3 py-2 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-Show</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={loadBookings}
              disabled={refreshing}
              className="bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white h-10 px-3"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </section>

        {/* Reservations Table */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl">
          <div className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
            <h2 className="font-display font-semibold text-base text-neutral-200">
              Reservation Logs ({filteredBookings.length})
            </h2>
            <span className="text-xs text-neutral-500">Auto-synced</span>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 text-sm">
              No reservations found matching the selected criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-950/70 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">Code / Time</th>
                    <th className="px-5 py-3.5 font-semibold">Date</th>
                    <th className="px-5 py-3.5 font-semibold">Guest</th>
                    <th className="px-5 py-3.5 font-semibold">Table & Party</th>
                    <th className="px-5 py-3.5 font-semibold">Pre-Order / Total</th>
                    <th className="px-5 py-3.5 font-semibold">Status</th>
                    <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 text-neutral-200">
                  {filteredBookings.map((b) => {
                    const tableInfo = tableTypes.find((t) => t.id === b.tableType);
                    const preOrdered = b.items?.filter((i) => i.fulfillment === "pre_ordered") || [];

                    return (
                      <tr key={b.code} className="hover:bg-neutral-800/40 transition-colors">
                        {/* Code & Time */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="font-mono font-bold text-amber-400 text-sm">{b.code}</span>
                          <div className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5">
                            <Clock className="size-3 text-neutral-500" />
                            {b.time}
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={b.date === todayStr ? "font-bold text-amber-300" : "text-neutral-300"}>
                            {b.date}
                          </span>
                          {b.date === todayStr && (
                            <span className="ml-1.5 inline-block text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
                              TODAY
                            </span>
                          )}
                        </td>

                        {/* Guest */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="font-medium text-white">{b.name}</div>
                          <div className="text-[11px] text-neutral-400">{b.phone}</div>
                          {b.customerEmail && (
                            <div className="text-[11px] text-neutral-500">{b.customerEmail}</div>
                          )}
                        </td>

                        {/* Table & Party */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <Badge variant="outline" className="border-neutral-700 bg-neutral-800 text-neutral-300 text-[11px]">
                            {tableInfo?.name || b.seating}
                          </Badge>
                          <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-1">
                            <Users className="size-3 text-neutral-500" /> {b.party} {b.party === 1 ? "Guest" : "Guests"}
                          </div>
                        </td>

                        {/* Pre-Order / Total */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="font-semibold text-white">₹{b.total}</div>
                          <div className="text-[11px] text-neutral-400">
                            {preOrdered.length > 0 ? `${preOrdered.length} items pre-ordered` : "No pre-order"}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {b.status === "confirmed" && (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px]">
                              Confirmed
                            </Badge>
                          )}
                          {b.status === "completed" && (
                            <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[11px]">
                              Completed
                            </Badge>
                          )}
                          {b.status === "cancelled" && (
                            <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 text-[11px]">
                              Cancelled
                            </Badge>
                          )}
                          {b.status === "no_show" && (
                            <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px]">
                              No-Show
                            </Badge>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {b.status !== "confirmed" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUpdateStatus(b.code, "confirmed")}
                                disabled={actionLoadingCode === b.code}
                                className="h-7 px-2 text-[11px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50"
                                title="Mark as Confirmed"
                              >
                                Confirm
                              </Button>
                            )}

                            {b.status !== "completed" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUpdateStatus(b.code, "completed")}
                                disabled={actionLoadingCode === b.code}
                                className="h-7 px-2 text-[11px] text-blue-400 hover:text-blue-300 hover:bg-blue-950/50"
                                title="Mark as Completed / Dined"
                              >
                                Complete
                              </Button>
                            )}

                            {b.status !== "no_show" && b.status !== "completed" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUpdateStatus(b.code, "no_show")}
                                disabled={actionLoadingCode === b.code}
                                className="h-7 px-2 text-[11px] text-amber-400 hover:text-amber-300 hover:bg-amber-950/50"
                                title="Mark as No-Show"
                              >
                                No-Show
                              </Button>
                            )}

                            {b.status !== "cancelled" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUpdateStatus(b.code, "cancelled")}
                                disabled={actionLoadingCode === b.code}
                                className="h-7 px-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-950/50"
                                title="Cancel Reservation"
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
