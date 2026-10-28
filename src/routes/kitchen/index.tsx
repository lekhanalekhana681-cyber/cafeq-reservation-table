import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChefHat,
  LogOut,
  Clock,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  UtensilsCrossed,
  Filter,
  RefreshCw,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Flame,
  ShieldCheck,
  Check,
  Sparkles,
  Coffee,
  X,
  AlertCircle,
  Ban,
  PackageX,
  History,
  LayoutGrid,
  Radio,
  SlidersHorizontal,
  Utensils,
  ShoppingBag,
  Bike,
  MapPin,
  Loader2,
  Play,
  HandPlatter,
} from "lucide-react";
import {
  normalizeOrderType,
  getOrderTypeDetails,
  getOrderStatusLabel,
} from "@/lib/order-types";
import {
  averagePrepMinutes,
  deriveTicketStatus,
  formatElapsed,
  formatItemProgress,
  isSameLocalDay,
  parseTimestamp,
  type ItemStatus,
} from "@/lib/order-items";
import { formatPaise } from "@/lib/prepayment";
import { toast } from "sonner";
import { getCurrentKitchen, logoutKitchen, type User } from "@/lib/auth";
import {
  getAllBookings,
  getPublicClient,
  setOrderItemsStatus,
  updateKitchenOrderStatus,
  type BookingInput,
  type KitchenStatus,
  type OrderItem,
} from "@/lib/bookings.functions";
import {
  subscribeToKitchenEvents,
  playNewOrderSound,
  isSoundMuted,
  setSoundMuted,
  toggleFullscreen,
  isFullscreenActive,
  type KitchenEventPayload,
} from "@/lib/kitchen.sync";
import { getOutOfStockItemIds, toggleItemStock } from "@/lib/stock";
import { menu as rawMenu, categories as rawCategories, type MenuItem } from "@/data/menu";
import { getStoredMenu } from "@/lib/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/kitchen/")({
  component: KitchenDashboardPage,
});

type StationFilter = "All" | "Beverages" | "Momos" | "Fast Food" | "Desserts" | "Cocktails";
type OrderTypeFilter = "All" | "dine_in" | "takeaway" | "delivery";

/** Board columns; each active column shows only the items currently in its stage. */
type BoardColumn = "new" | "preparing" | "ready" | "completed" | "cancelled";
const COLUMN_ITEM_STATUS: Partial<Record<BoardColumn, ItemStatus>> = {
  new: "PENDING",
  preparing: "PREPARING",
  ready: "READY",
};

// Cross-device fallback refresh when Supabase Realtime is unavailable
const KDS_POLL_INTERVAL_MS = 10000;

function KitchenDashboardPage() {
  const navigate = useNavigate();
  const [kitchenUser, setKitchenUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<BookingInput[]>([]);
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<"board" | "history">("board");
  const [boardColumnFilter, setBoardColumnFilter] = useState<"all" | KitchenStatus>("all");

  // Filter states
  const [stationFilter, setStationFilter] = useState<StationFilter>("All");
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");

  // KDS settings & UI toggles
  const [soundEnabled, setSoundEnabled] = useState(!isSoundMuted());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "reconnecting">("connected");
  const [prepThresholdMinutes, setPrepThresholdMinutes] = useState(15);

  // Out of stock modal state
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockItemIds, setStockItemIds] = useState<string[]>([]);
  const [stockSearch, setStockSearch] = useState("");
  const [liveMenu, setLiveMenu] = useState<MenuItem[]>(() => getStoredMenu());
  const menuMap = useMemo(() => new Map<string, MenuItem>(liveMenu.map((m) => [m.id, m])), [liveMenu]);

  // Reject modal state
  const [rejectingOrder, setRejectingOrder] = useState<BookingInput | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectCustomReason, setRejectCustomReason] = useState("");

  // Action loading state
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);
  // Per-item loading ("CODE:itemId") so a double tap never fires twice
  const [busyItemKeys, setBusyItemKeys] = useState<Set<string>>(() => new Set());
  const busyItemKeysRef = useRef<Set<string>>(new Set());
  // Tickets already on the board (null until the first load, so the initial load doesn't chime)
  const knownTicketCodesRef = useRef<Set<string> | null>(null);
  // Item awaiting cancel confirmation ("CODE:itemId")
  const [confirmCancelKey, setConfirmCancelKey] = useState<string | null>(null);

  // 1. Route Guard
  useEffect(() => {
    const current = getCurrentKitchen();
    if (!current || (current.role !== "kitchen" && current.role !== "admin")) {
      toast.error("Access denied. Please authenticate as kitchen staff.");
      navigate({ to: "/kitchen/login" });
      return;
    }
    setKitchenUser(current);
    loadOrders();
    setStockItemIds(getOutOfStockItemIds());
  }, [navigate]);

  // 2. Live Second-by-Second Timer Ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. Fullscreen state tracking
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(isFullscreenActive());
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // 4. Real-time Kitchen Event Subscriber
  useEffect(() => {
    const unsubscribe = subscribeToKitchenEvents((event: KitchenEventPayload) => {
      if (event.type === "NEW_ORDER") {
        // The chime plays in loadOrders when the ticket actually appears on the board
        loadOrders(false);
      } else if (
        event.type === "ORDER_STATUS_CHANGED" ||
        event.type === "ITEM_STATUS_CHANGED" ||
        event.type === "ORDER_REJECTED"
      ) {
        loadOrders(false);
      } else if (event.type === "STOCK_CHANGED") {
        setStockItemIds(getOutOfStockItemIds());
      }
    });

    // Cross-device sync: the event bus above only reaches tabs in this browser,
    // so other KDS screens get changes via Supabase Realtime plus a polling fallback.
    const poll = setInterval(() => loadOrders(false), KDS_POLL_INTERVAL_MS);

    const supabase = getPublicClient();
    let realtimeChannel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      try {
        realtimeChannel = supabase
          .channel("kds-bookings-realtime")
          .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
            loadOrders(false);
          })
          .subscribe((status) => {
            setConnectionStatus(status === "SUBSCRIBED" || status === "CLOSED" ? "connected" : "reconnecting");
          });
      } catch (err) {
        console.warn("Could not establish KDS realtime channel:", err);
      }
    }

    return () => {
      unsubscribe();
      clearInterval(poll);
      if (realtimeChannel && supabase) supabase.removeChannel(realtimeChannel);
    };
  }, []);

  const loadOrders = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const data = await getAllBookings();
      // Kitchen-relevant tickets: orders with food/drink items. Pre-orders awaiting online
      // payment (or expired unpaid) never reach the kitchen.
      const kitchenTickets = data.filter(
        (b) => b.items && b.items.length > 0 && b.status !== "pending_payment" && b.status !== "expired"
      );

      // Chime for tickets that just appeared — new orders, and pre-orders whose payment
      // was confirmed (they arrive as an update, not an insert).
      const previous = knownTicketCodesRef.current;
      if (previous && kitchenTickets.some((t) => t.kitchenStatus === "new" && !previous.has(t.code))) {
        toast.info("🛎️ New order received in kitchen!", { duration: 4000 });
        playNewOrderSound();
      }
      knownTicketCodesRef.current = new Set(kitchenTickets.map((t) => t.code));

      setOrders(kitchenTickets);
      setConnectionStatus("connected");
    } catch {
      setConnectionStatus("reconnecting");
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  };

  const handleLogout = () => {
    logoutKitchen();
    toast.success("Kitchen terminal locked.");
    navigate({ to: "/kitchen/login" });
  };

  const toggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    setSoundMuted(!newState);
    if (newState) {
      playNewOrderSound();
      toast.success("KDS order chime enabled");
    } else {
      toast.info("KDS order chime muted");
    }
  };

  const handleFullscreenToggle = async () => {
    const active = await toggleFullscreen();
    setIsFullscreen(active);
  };

  // Status transitions
  const handleUpdateStatus = async (
    code: string,
    targetStatus: KitchenStatus,
    reason?: string
  ) => {
    setActionLoadingCode(code);
    try {
      const res = await updateKitchenOrderStatus({
        code,
        status: targetStatus,
        reason,
        cancelledBy: "kitchen",
      });
      if (res.success) {
        const labels: Record<KitchenStatus, string> = {
          new: "Order received",
          preparing: "Started preparing order",
          ready: "Order marked ready for runner & customer",
          completed: "Order completed",
          cancelled: "Order rejected by kitchen",
        };
        toast.success(labels[targetStatus] || "Status updated");
        await loadOrders(false);
      } else {
        toast.error(res.error || "Failed to update order status.");
      }
    } catch {
      toast.error("Failed to update status.");
    } finally {
      setActionLoadingCode(null);
      setRejectingOrder(null);
      setRejectReason("");
      setRejectCustomReason("");
    }
  };

  /**
   * Moves items (from one stage) of a ticket to `next`, optimistically.
   * The ticket is updated on screen immediately and rolled back if the server refuses.
   */
  const runItemUpdate = async (order: BookingInput, itemIds: string[], from: ItemStatus, next: ItemStatus) => {
    const keys = itemIds.map((id) => `${order.code}:${id}`);
    // Ref, not state: two taps in the same frame must not both get through
    if (itemIds.length === 0 || keys.some((k) => busyItemKeysRef.current.has(k))) return;
    keys.forEach((k) => busyItemKeysRef.current.add(k));
    setBusyItemKeys(new Set(busyItemKeysRef.current));
    setConfirmCancelKey(null);

    const ids = new Set(itemIds);
    const optimisticItems = order.items.map((i) => (ids.has(i.id) && i.status === from ? { ...i, status: next } : i));
    const replaceOrder = (replacement: BookingInput) =>
      setOrders((prev) => prev.map((o) => (o.code === order.code ? replacement : o)));
    replaceOrder({ ...order, items: optimisticItems, kitchenStatus: deriveTicketStatus(optimisticItems) });

    try {
      const res = await setOrderItemsStatus({ code: order.code, itemIds, status: next, expectedStatus: from });
      if (res.success && res.booking) {
        replaceOrder(res.booking);
      } else if (res.conflict && res.booking) {
        replaceOrder(res.booking);
        toast.warning(res.error);
      } else {
        replaceOrder(order);
        toast.error(res.error || "Failed to update item.");
      }
    } catch {
      replaceOrder(order);
      toast.error("Failed to update item. Check the connection and try again.");
    } finally {
      keys.forEach((k) => busyItemKeysRef.current.delete(k));
      setBusyItemKeys(new Set(busyItemKeysRef.current));
    }
  };

  const handleStockToggle = (itemId: string) => {
    toggleItemStock(itemId);
    setStockItemIds(getOutOfStockItemIds());
    toast.success("Stock status updated");
  };

  // Map menu categories to Station filters
  const matchesStation = (item: OrderItem, station: StationFilter): boolean => {
    if (station === "All") return true;
    const name = item.name.toLowerCase();
    const cat = (item.category || "").toLowerCase();

    if (station === "Beverages") {
      return (
        cat.includes("beverage") ||
        cat.includes("coffee") ||
        cat.includes("tea") ||
        cat.includes("drink") ||
        name.includes("latte") ||
        name.includes("cappuccino") ||
        name.includes("brew") ||
        name.includes("shake") ||
        name.includes("smoothie")
      );
    }
    if (station === "Momos") {
      return cat.includes("momo") || name.includes("momo") || name.includes("dumpling");
    }
    if (station === "Fast Food") {
      return (
        cat.includes("snack") ||
        cat.includes("starter") ||
        cat.includes("burger") ||
        cat.includes("sandwich") ||
        cat.includes("pizza") ||
        cat.includes("pasta") ||
        cat.includes("mains") ||
        cat.includes("bites") ||
        name.includes("fries") ||
        name.includes("nachos")
      );
    }
    if (station === "Desserts") {
      return (
        cat.includes("dessert") ||
        cat.includes("bakery") ||
        name.includes("brownie") ||
        name.includes("cake") ||
        name.includes("waffle") ||
        name.includes("pie") ||
        name.includes("scoop")
      );
    }
    if (station === "Cocktails") {
      return (
        cat.includes("cocktail") ||
        cat.includes("mocktail") ||
        name.includes("mojito") ||
        name.includes("margarita") ||
        name.includes("sangria") ||
        name.includes("punch") ||
        name.includes("cooler") ||
        name.includes("fizz")
      );
    }
    return true;
  };

  // Ticket-level filters: search and order type. Station filtering is per item (stationItems).
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          order.code.toLowerCase().includes(q) ||
          order.name.toLowerCase().includes(q) ||
          order.phone.includes(q) ||
          (order.seating && order.seating.toLowerCase().includes(q)) ||
          (order.tableNumber && order.tableNumber.toLowerCase().includes(q)) ||
          order.items?.some((i) => i.name.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      // 2. Order Type filter
      if (orderTypeFilter !== "All") {
        if (normalizeOrderType(order.orderType) !== normalizeOrderType(orderTypeFilter)) {
          return false;
        }
      }

      // 3. Station filter: order must have at least one item for this station
      if (stationFilter !== "All") {
        const hasStationItem = order.items?.some((item) => matchesStation(item, stationFilter));
        if (!hasStationItem) return false;
      }

      return true;
    });
  }, [orders, searchQuery, orderTypeFilter, stationFilter]);

  /** The items of a ticket that the selected station handles (stations only see their own items). */
  const stationItems = (order: BookingInput): OrderItem[] =>
    stationFilter === "All" ? order.items || [] : (order.items || []).filter((i) => matchesStation(i, stationFilter));

  const isClosedTicket = (o: BookingInput) => o.kitchenStatus === "completed" || o.kitchenStatus === "cancelled";

  // Active columns: a ticket appears in every column holding at least one of its items,
  // so a ticket with mixed item stages is split across columns under the same ticket ID.
  const ticketsByStage = useMemo(() => {
    const inStage = (status: ItemStatus) =>
      filteredOrders.filter((o) => !isClosedTicket(o) && stationItems(o).some((i) => i.status === status));
    return { new: inStage("PENDING"), preparing: inStage("PREPARING"), ready: inStage("READY") };
  }, [filteredOrders, stationFilter]);
  const newOrders = ticketsByStage.new;
  const preparingOrders = ticketsByStage.preparing;
  const readyOrders = ticketsByStage.ready;

  const byLatest = (field: "completedAt" | "createdAt") => (a: BookingInput, b: BookingInput) =>
    (parseTimestamp(b[field]) ?? 0) - (parseTimestamp(a[field]) ?? 0);
  const completedOrders = useMemo(
    () => filteredOrders.filter((o) => o.kitchenStatus === "completed").sort(byLatest("completedAt")),
    [filteredOrders]
  );
  const cancelledOrders = useMemo(
    () => filteredOrders.filter((o) => o.kitchenStatus === "cancelled").sort(byLatest("createdAt")),
    [filteredOrders]
  );

  // Top KPI calculations — item-based and scoped to the active filters/station
  const todayKey = new Date(now).toDateString();
  const kpis = useMemo(() => {
    const activeItems = filteredOrders.filter((o) => !isClosedTicket(o)).flatMap(stationItems);
    const readiedToday = filteredOrders
      .flatMap(stationItems)
      .filter((i) => isSameLocalDay(parseTimestamp(i.readyAt), Date.now()));
    return {
      activeQueue: activeItems.filter((i) => i.status === "PENDING" || i.status === "PREPARING").length,
      readyForTable: activeItems.filter((i) => i.status === "READY").length,
      avgPrepMinutes: averagePrepMinutes(readiedToday),
      completedToday: completedOrders.filter((o) => isSameLocalDay(parseTimestamp(o.completedAt), Date.now())).length,
    };
  }, [filteredOrders, completedOrders, stationFilter, todayKey]);

  // Elapsed time since the order was placed. Never derived from the reservation's
  // date/time, which can be days away from when the kitchen actually received it.
  const getTicketTimer = (order: BookingInput) => {
    const startMs = parseTimestamp(order.createdAt) ?? parseTimestamp(order.acceptedAt);
    if (startMs === null) return null;

    const elapsedSeconds = Math.max(0, Math.floor((now - startMs) / 1000));
    const targetSeconds = (order.estimatedPrepTime || prepThresholdMinutes) * 60;

    const percentElapsed = targetSeconds > 0 ? (elapsedSeconds / targetSeconds) * 100 : 0;
    const isOverdue = elapsedSeconds > targetSeconds;

    let timerColor = "text-emerald-400 bg-emerald-950/60 border-emerald-500/40";
    if (percentElapsed >= 50 && percentElapsed <= 100) {
      timerColor = "text-amber-300 bg-amber-950/60 border-amber-500/40";
    } else if (isOverdue) {
      timerColor = "text-rose-400 bg-rose-950/80 border-rose-500/60 animate-pulse";
    }

    return {
      formatted: formatElapsed(elapsedSeconds),
      elapsedSeconds,
      targetSeconds,
      percentElapsed,
      isOverdue,
      timerColor,
    };
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans select-none">
      {/* ─── KDS Header Bar ─── */}
      <header className="sticky top-0 z-40 bg-neutral-900/95 border-b border-neutral-800 backdrop-blur-md px-4 sm:px-6 py-3 shadow-md">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Connection State */}
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shadow-inner">
              <ChefHat className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-lg text-neutral-100 tracking-tight">
                  Cafe<span className="text-orange-500">Q</span> Kitchen Display
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                    connectionStatus === "connected"
                      ? "text-emerald-400 border-emerald-500/40 bg-emerald-950/40"
                      : "text-amber-400 border-amber-500/40 bg-amber-950/40 animate-pulse"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      connectionStatus === "connected" ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                  {connectionStatus === "connected" ? "Live KDS Online" : "Reconnecting..."}
                </Badge>
              </div>
              <p className="text-[11px] text-neutral-400">
                Staff: <span className="text-neutral-200 font-medium">{kitchenUser?.name || "Kitchen Terminal"}</span>{" "}
                • Shift Auto-Refresh Active
              </p>
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex items-center gap-2">
            {/* Out of Stock Manager Button */}
            <Button
              onClick={() => setShowStockModal(true)}
              variant="outline"
              size="sm"
              className="h-9 text-xs border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 flex items-center gap-1.5"
            >
              <PackageX className="size-4 text-orange-400" />
              <span>86 / Out of Stock ({stockItemIds.length})</span>
            </Button>

            {/* Audio Toggle */}
            <Button
              onClick={toggleSound}
              variant="outline"
              size="sm"
              className={`h-9 px-3 text-xs border-neutral-700 ${
                soundEnabled ? "text-orange-400 bg-orange-950/30 border-orange-600/40" : "text-neutral-500"
              }`}
              title={soundEnabled ? "Order chime active (click to mute)" : "Order chime muted"}
            >
              {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>

            {/* Fullscreen Toggle */}
            <Button
              onClick={handleFullscreenToggle}
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300"
              title="Toggle Fullscreen Wall Display"
            >
              {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </Button>

            {/* Manual Sync */}
            <Button
              onClick={() => loadOrders(true)}
              disabled={loading}
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300"
              title="Refresh tickets"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin text-orange-400" : ""}`} />
            </Button>

            {/* Lock / Sign Out */}
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-neutral-400 hover:text-rose-400 hover:bg-rose-950/20"
            >
              <LogOut className="size-4 mr-1" /> Lock
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Top KPI Bar ─── */}
      <section className="bg-neutral-900/60 border-b border-neutral-800/80 px-4 sm:px-6 py-2.5">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300">
              <Flame className="size-4 text-orange-400" />
              <span>Active Queue:</span>
              <strong className="text-base text-orange-100 font-mono font-bold">{kpis.activeQueue}</strong>
              <span className="text-[10px] text-orange-300/70">items</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              <CheckCircle2 className="size-4 text-emerald-400" />
              <span>Ready for Table:</span>
              <strong className="text-base text-emerald-100 font-mono font-bold">{kpis.readyForTable}</strong>
              <span className="text-[10px] text-emerald-300/70">items</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-800/80 border border-neutral-700/60 text-neutral-300">
              <Clock className="size-4 text-neutral-400" />
              <span>Avg Prep Time Today:</span>
              <strong className="text-sm text-neutral-100 font-mono font-semibold">
                {kpis.avgPrepMinutes === null ? "—" : `~${kpis.avgPrepMinutes} mins`}
              </strong>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-800/80 border border-neutral-700/60 text-neutral-300">
              <span>Completed Today:</span>
              <strong className="text-sm text-neutral-100 font-mono font-semibold">{kpis.completedToday}</strong>
            </div>
          </div>

          {/* Board vs History switch */}
          <div className="flex items-center gap-1.5 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => setActiveTab("board")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === "board"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <LayoutGrid className="size-3.5" /> Live KDS Board
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === "history"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <History className="size-3.5" /> Today's Archive
            </button>
          </div>
        </div>
      </section>

      {/* ─── Filters & Search Toolbar ─── */}
      <section className="bg-neutral-900/40 border-b border-neutral-800/60 px-4 sm:px-6 py-2.5">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Station Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold mr-1 flex items-center gap-1">
              <Filter className="size-3" /> Station:
            </span>
            {(["All", "Beverages", "Momos", "Fast Food", "Desserts", "Cocktails"] as StationFilter[]).map(
              (station) => (
                <button
                  key={station}
                  type="button"
                  onClick={() => setStationFilter(station)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    stationFilter === station
                      ? "bg-orange-500/20 text-orange-300 border border-orange-500/50 shadow-sm"
                      : "bg-neutral-900/80 text-neutral-400 hover:text-neutral-200 border border-neutral-800"
                  }`}
                >
                  {station}
                </button>
              )
            )}
          </div>

          {/* Order Type & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Order Type Pill */}
            <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800 text-[11px]">
              {(
                [
                  { id: "All", label: "All Types" },
                  { id: "dine_in", label: "Dine-in" },
                  { id: "takeaway", label: "Takeaway" },
                  { id: "delivery", label: "Delivery" },
                ] as const
              ).map((type) => (
                <button
                  key={type.id}
                  onClick={() => setOrderTypeFilter(type.id as OrderTypeFilter)}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    orderTypeFilter === type.id
                      ? "bg-neutral-800 text-neutral-100 font-medium"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            {/* Quick Search */}
            <div className="relative w-48 sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-neutral-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ticket #, guest, item..."
                className="h-8 pl-8 pr-3 text-xs bg-neutral-900 border-neutral-800 text-neutral-200 placeholder:text-neutral-500 rounded-lg"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Main Content Area ─── */}
      <main className="flex-1 p-4 sm:p-6 overflow-x-auto">
        {activeTab === "board" ? (
          /* ─── Kanban Grid: New -> Preparing -> Ready -> Completed ─── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-[320px]">
            {/* COLUMN 1: NEW ORDERS */}
            <div className="flex flex-col rounded-2xl bg-neutral-900/60 border border-neutral-800 p-3 min-h-[500px]">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-blue-500" />
                  <h2 className="font-bold text-sm text-neutral-100 uppercase tracking-wider">New Tickets</h2>
                </div>
                <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono text-xs">
                  {newOrders.length}
                </Badge>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {newOrders.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-neutral-500">
                    <CheckCircle2 className="size-8 stroke-1 text-neutral-600 mb-2" />
                    <p className="text-xs">No pending new orders</p>
                    <p className="text-[10px] text-neutral-600">Fresh bookings appear here in real time</p>
                  </div>
                ) : (
                  newOrders.map((order) => renderOrderCard(order, "new"))
                )}
              </div>
            </div>

            {/* COLUMN 2: PREPARING */}
            <div className="flex flex-col rounded-2xl bg-neutral-900/60 border border-neutral-800 p-3 min-h-[500px]">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-orange-500 animate-pulse" />
                  <h2 className="font-bold text-sm text-neutral-100 uppercase tracking-wider">In Prep</h2>
                </div>
                <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30 font-mono text-xs">
                  {preparingOrders.length}
                </Badge>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {preparingOrders.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-neutral-500">
                    <UtensilsCrossed className="size-8 stroke-1 text-neutral-600 mb-2" />
                    <p className="text-xs">Kitchen cooking queue is clear</p>
                    <p className="text-[10px] text-neutral-600">Start an item from New Tickets to begin preparation</p>
                  </div>
                ) : (
                  preparingOrders.map((order) => renderOrderCard(order, "preparing"))
                )}
              </div>
            </div>

            {/* COLUMN 3: READY FOR SERVE */}
            <div className="flex flex-col rounded-2xl bg-neutral-900/60 border border-neutral-800 p-3 min-h-[500px]">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-emerald-500" />
                  <h2 className="font-bold text-sm text-neutral-100 uppercase tracking-wider">Ready / Plated</h2>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono text-xs">
                  {readyOrders.length}
                </Badge>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {readyOrders.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-neutral-500">
                    <Check className="size-8 stroke-1 text-neutral-600 mb-2" />
                    <p className="text-xs">No orders waiting for runner</p>
                    <p className="text-[10px] text-neutral-600">Marked dishes will sit here until served</p>
                  </div>
                ) : (
                  readyOrders.map((order) => renderOrderCard(order, "ready"))
                )}
              </div>
            </div>

            {/* COLUMN 4: RECENTLY COMPLETED / REJECTED */}
            <div className="flex flex-col rounded-2xl bg-neutral-900/60 border border-neutral-800 p-3 min-h-[500px]">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-neutral-500" />
                  <h2 className="font-bold text-sm text-neutral-100 uppercase tracking-wider">Completed / Cancelled</h2>
                </div>
                <Badge className="bg-neutral-800 text-neutral-400 font-mono text-xs">
                  {completedOrders.length + cancelledOrders.length}
                </Badge>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {completedOrders.slice(0, 5).map((order) => renderOrderCard(order, "completed"))}
                {cancelledOrders.slice(0, 5).map((order) => renderOrderCard(order, "cancelled"))}

                {completedOrders.length === 0 && cancelledOrders.length === 0 && (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-neutral-500">
                    <History className="size-8 stroke-1 text-neutral-600 mb-2" />
                    <p className="text-xs">No completed tickets yet today</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ─── Archive / History Tab View ─── */
          <div className="max-w-5xl mx-auto bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-neutral-800 mb-6">
              <div>
                <h2 className="font-display font-bold text-xl text-neutral-100">Daily Kitchen Order History</h2>
                <p className="text-xs text-neutral-400">
                  Comprehensive audit trail of today's accepted, plated, served, and rejected orders
                </p>
              </div>
              <Badge className="bg-neutral-800 text-neutral-300 font-mono text-xs">
                Total Orders Logged: {filteredOrders.length}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 uppercase font-mono text-[10px]">
                    <th className="py-2.5 px-3">Ticket</th>
                    <th className="py-2.5 px-3">Table / Type</th>
                    <th className="py-2.5 px-3">Guest</th>
                    <th className="py-2.5 px-3">Items Summary</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Timeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {filteredOrders.map((o) => (
                    <tr key={o.code} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-orange-400">#{o.code}</td>
                      <td className="py-3 px-3">
                        {(() => {
                          const details = getOrderTypeDetails(o.orderType);
                          return (
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${details.badgeClass}`}>
                                {details.label}
                              </span>
                              <div className="font-medium text-neutral-200 text-xs">
                                {details.type === "DINE_IN" ? (
                                  `Table ${o.tableNumber || o.seating || "Assigned"}`
                                ) : details.type === "TAKEAWAY" ? (
                                  `Pickup: ${o.pickupTime || "ASAP"}`
                                ) : (
                                  <span className="truncate max-w-[140px] block" title={o.deliveryAddress || ""}>
                                    {o.deliveryAddress || "Delivery"}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3 text-neutral-300">
                        {o.name}
                        <span className="block text-[10px] text-neutral-500">{o.phone}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="max-w-xs space-y-0.5">
                          {o.items?.map((it, idx) => (
                            <span
                              key={idx}
                              className={`inline-block mr-2 text-[11px] ${
                                it.status === "CANCELLED" ? "text-neutral-500 line-through" : "text-neutral-300"
                              }`}
                            >
                              {it.qty}x {it.name}{" "}
                              <span className="text-[9px] font-mono uppercase text-neutral-500">{it.status.toLowerCase()}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium px-2 py-0.5 ${
                            o.kitchenStatus === "completed" || o.status === "completed"
                              ? "text-emerald-400 border-emerald-500/40 bg-emerald-950/40"
                              : o.kitchenStatus === "cancelled" || o.status === "cancelled"
                              ? "text-rose-400 border-rose-500/40 bg-rose-950/40"
                              : "text-orange-400 border-orange-500/40 bg-orange-950/40"
                          }`}
                        >
                          {getOrderStatusLabel(o.orderType, o.status, o.kitchenStatus)}
                        </Badge>
                        <span className="block text-[10px] text-neutral-500 mt-0.5">{formatItemProgress(o.items || [])}</span>
                        {o.cancellationReason && (
                          <span className="block text-[10px] text-rose-300 italic mt-0.5">
                            Reason: {o.cancellationReason}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] text-neutral-400 space-y-0.5">
                        <div>Time: {o.time}</div>
                        {o.readyAt && <div>Ready: {new Date(o.readyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ─── Out of Stock Management Modal ─── */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                  <PackageX className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-neutral-100">86 / Out of Stock Item Manager</h3>
                  <p className="text-xs text-neutral-400">
                    Toggle items unavailable in real-time. Automatically removed from customer menu & reservation booking.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowStockModal(false)}
                className="text-neutral-400 hover:text-neutral-100 rounded-lg p-1.5"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Search items */}
            <div className="my-4">
              <Input
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search dish or beverage name..."
                className="bg-neutral-950 border-neutral-800 text-neutral-200 text-xs h-10"
              />
            </div>

            {/* List of items */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {liveMenu
                .filter((m) => !stockSearch || m.name.toLowerCase().includes(stockSearch.toLowerCase()))
                .map((dish) => {
                  const isOutOfStock = stockItemIds.includes(dish.id);
                  return (
                    <div
                      key={dish.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-colors ${
                        isOutOfStock
                          ? "bg-rose-950/20 border-rose-900/50"
                          : "bg-neutral-950/60 border-neutral-800 hover:border-neutral-700"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={dish.image || "/uploads/menu/placeholder.webp"}
                          alt={dish.name}
                          onError={(e) => {
                            e.currentTarget.src = "/uploads/menu/placeholder.webp";
                          }}
                          className="size-10 rounded-xl object-cover shrink-0 border border-neutral-800 bg-neutral-900"
                        />
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: isOutOfStock ? "#f43f5e" : "#10b981" }} />
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold truncate ${isOutOfStock ? "line-through text-neutral-400" : "text-neutral-100"}`}>
                            {dish.name}
                          </p>
                          <span className="text-[11px] text-neutral-500">{dish.category} • ₹{dish.price}</span>
                        </div>
                      </div>

                      <Button
                        onClick={() => handleStockToggle(dish.id)}
                        size="sm"
                        variant={isOutOfStock ? "destructive" : "outline"}
                        className="text-xs font-medium h-8"
                      >
                        {isOutOfStock ? "Mark In Stock" : "Mark 86 (Out of Stock)"}
                      </Button>
                    </div>
                  );
                })}
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-800 flex justify-end">
              <Button onClick={() => setShowStockModal(false)} className="bg-orange-600 hover:bg-orange-500 text-white text-xs">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reject / Cancel Modal ─── */}
      {rejectingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 pb-3 border-b border-neutral-800">
              <div className="size-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <Ban className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-neutral-100">Reject / Cancel Ticket #{rejectingOrder.code}</h3>
                <p className="text-xs text-neutral-400">
                  Guest: {rejectingOrder.name} ({rejectingOrder.phone})
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <Label className="text-xs text-neutral-300">Select Rejection Reason (Shown to Guest & Admin):</Label>
              <div className="space-y-1.5">
                {[
                  "Key ingredients out of stock / 86",
                  "Kitchen capacity limit reached for this timeslot",
                  "Station equipment maintenance underway",
                  "Order placed past kitchen closing time",
                  "Custom reason below",
                ].map((reasonOption) => (
                  <button
                    key={reasonOption}
                    type="button"
                    onClick={() => {
                      setRejectReason(reasonOption);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs transition-colors ${
                      rejectReason === reasonOption
                        ? "bg-rose-950/40 border-rose-500 text-rose-200"
                        : "bg-neutral-950 border-neutral-800 text-neutral-300 hover:bg-neutral-800/50"
                    }`}
                  >
                    {reasonOption}
                  </button>
                ))}
              </div>

              {rejectReason === "Custom reason below" && (
                <div className="pt-2">
                  <Input
                    value={rejectCustomReason}
                    onChange={(e) => setRejectCustomReason(e.target.value)}
                    placeholder="Enter custom rejection reason..."
                    className="bg-neutral-950 border-neutral-800 text-neutral-200 text-xs h-10"
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-neutral-800 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRejectingOrder(null)}
                className="text-xs text-neutral-400 hover:text-neutral-200"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!rejectReason || (rejectReason === "Custom reason below" && !rejectCustomReason.trim())}
                onClick={() => {
                  const finalReason = rejectReason === "Custom reason below" ? rejectCustomReason.trim() : rejectReason;
                  handleUpdateStatus(rejectingOrder.code, "cancelled", finalReason);
                }}
                className="text-xs"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /**
   * Helper function to render a ticket card.
   * In the three active columns the card shows the full ticket header but only the
   * items currently in that column's stage; each item moves on its own.
   */
  function renderOrderCard(order: BookingInput, columnStatus: BoardColumn) {
    const timer = getTicketTimer(order);
    const isLoading = actionLoadingCode === order.code;
    const stageStatus = COLUMN_ITEM_STATUS[columnStatus];
    const ownItems = stationItems(order);
    const columnItems = stageStatus ? ownItems.filter((i) => i.status === stageStatus) : ownItems;
    const otherStageCount = stageStatus
      ? ownItems.filter((i) => i.status !== stageStatus && i.status !== "CANCELLED").length
      : 0;
    const columnItemsBusy = columnItems.some((i) => busyItemKeys.has(`${order.code}:${i.id}`));

    // Distinguish veg vs non-veg
    const isVegOrder = order.dietary?.includes("Vegetarian") || order.dietary?.includes("Vegan");

    const orderTypeMeta = getOrderTypeDetails(order.orderType);
    const normType = orderTypeMeta.type;

    const readyLabel = normType === "TAKEAWAY" ? "Ready" : normType === "DELIVERY" ? "Packed" : "Ready";
    const serveLabel = normType === "TAKEAWAY" ? "Picked up" : normType === "DELIVERY" ? "Dispatched" : "Served";

    return (
      <div
        key={`${order.code}-${columnStatus}`}
        className={`rounded-2xl border p-4 shadow-lg transition-all duration-300 relative flex flex-col justify-between ${
          columnStatus === "new"
            ? "bg-neutral-900 border-blue-500/50 shadow-blue-950/30"
            : columnStatus === "preparing"
            ? "bg-neutral-900 border-neutral-700 hover:border-orange-500/50"
            : columnStatus === "ready"
            ? "bg-neutral-900 border-emerald-500/40"
            : "bg-neutral-950/70 border-neutral-800 opacity-75"
        }`}
      >
        {/* Top Card Row */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-bold text-base text-neutral-100 tracking-tight">
                  #{order.code}
                </span>

                {columnStatus === "new" && order.kitchenStatus === "new" && (
                  <Badge className="bg-blue-500 text-white font-bold text-[10px] uppercase px-1.5 py-0.2 animate-bounce">
                    NEW
                  </Badge>
                )}

                {/* Veg / Non-Veg Indicator */}
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 font-medium ${
                    isVegOrder
                      ? "text-emerald-400 border-emerald-500/40 bg-emerald-950/40"
                      : "text-amber-400 border-amber-500/40 bg-amber-950/40"
                  }`}
                >
                  {isVegOrder ? "🟢 Veg" : "🟡 Standard"}
                </Badge>

                {/* Pre-order payment: deposit / fully paid, with what staff must still collect */}
                {order.paymentRequired && (order.paymentState === "PARTIALLY_PAID" || order.paymentState === "PAID") && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 font-semibold text-emerald-300 border-emerald-500/50 bg-emerald-950/50"
                    title={`Paid online ${formatPaise(order.amountPaidPaise)} of ${formatPaise(order.totalAmountPaise)}`}
                  >
                    {order.paymentState === "PAID"
                      ? "Fully paid"
                      : `Deposit paid · Collect ${formatPaise(order.balanceDuePaise)}`}
                  </Badge>
                )}
              </div>

              {/* Order Type Badge & Destination */}
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${orderTypeMeta.badgeClass}`}>
                  {orderTypeMeta.iconName === "Utensils" && <Utensils className="size-3" />}
                  {orderTypeMeta.iconName === "ShoppingBag" && <ShoppingBag className="size-3" />}
                  {orderTypeMeta.iconName === "Bike" && <Bike className="size-3" />}
                  {orderTypeMeta.label}
                </span>

                {normType === "DINE_IN" && (
                  <span className="text-xs font-semibold text-orange-400 flex items-center gap-1">
                    <Utensils className="size-3" />
                    Table {order.tableNumber || order.seating || "Assigned"}
                  </span>
                )}
                {normType === "TAKEAWAY" && (
                  <span className="text-xs font-medium text-blue-300 flex items-center gap-1">
                    <Clock className="size-3" />
                    Pickup: {order.pickupTime || "ASAP"}
                  </span>
                )}
                {normType === "DELIVERY" && (
                  <span className="text-xs font-medium text-purple-300 flex items-center gap-1">
                    <Bike className="size-3" />
                    Delivery
                  </span>
                )}
                <span className="text-neutral-500">•</span>
                <span className="text-xs text-neutral-400">{order.party || 1}p</span>
              </div>
            </div>

            {/* Live Running Timer (since the order was placed) */}
            {timer && columnStatus !== "completed" && columnStatus !== "cancelled" && (
              <div className={`px-2.5 py-1 rounded-xl border text-right font-mono shrink-0 ${timer.timerColor}`}>
                <div className="text-sm font-bold leading-tight">{timer.formatted}</div>
                <div className="text-[9px] uppercase tracking-wider opacity-80">
                  {timer.isOverdue ? "OVERDUE" : `Est: ${order.estimatedPrepTime || prepThresholdMinutes}m`}
                </div>
              </div>
            )}
          </div>

          {/* Guest Name & Phone */}
          <div className="text-[11px] text-neutral-400 mb-2">
            Guest: <strong className="text-neutral-200 font-medium">{order.name}</strong> • Time: {order.time}
            {normType !== "DINE_IN" && (
              <> • Phone: <strong className="text-neutral-300 font-mono">{order.customerPhone || order.phone}</strong></>
            )}
          </div>

          {/* Delivery Address & Instructions */}
          {normType === "DELIVERY" && order.deliveryAddress && (
            <div className="mb-2.5 p-2 rounded-xl bg-purple-950/30 border border-purple-800/40 text-purple-200 text-xs">
              <div className="flex items-start gap-1.5">
                <MapPin className="size-3.5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-purple-300">Deliver to: </span>
                  {order.deliveryAddress}
                </div>
              </div>
              {order.deliveryInstructions && (
                <div className="mt-1 pl-5 text-[11px] text-purple-300/80">
                  Note: {order.deliveryInstructions}
                </div>
              )}
            </div>
          )}

          {/* Customer Special Instructions / Notes Banner */}
          {order.notes && (
            <div className="mb-3 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-tight">
                <span className="font-semibold text-amber-300">Note: </span>
                {order.notes}
              </div>
            </div>
          )}

          {/* Cancellation reason if cancelled */}
          {order.cancellationReason && order.kitchenStatus === "cancelled" && (
            <div className="mb-3 p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-1.5">
              <Ban className="size-3.5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-rose-200">Cancelled by {order.cancelledBy || "Kitchen"}: </span>
                {order.cancellationReason}
              </div>
            </div>
          )}

          {/* Ticket progress across all stages */}
          <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
            <span>{formatItemProgress(order.items || [])}</span>
            {otherStageCount > 0 && <span>+{otherStageCount} in other stages</span>}
          </div>

          {/* Items in this stage — each one moves on its own */}
          <div className="space-y-1.5 my-2 pt-2 border-t border-neutral-800/80">
            {columnItems.map((item) => renderItemRow(order, item, columnStatus))}
          </div>
        </div>

        {/* ─── Ticket-level Actions ─── */}
        <div className="mt-3 pt-2.5 border-t border-neutral-800 flex items-center gap-2">
          {columnStatus === "new" && (
            <Button
              onClick={() => runItemUpdate(order, columnItems.map((i) => i.id), "PENDING", "PREPARING")}
              disabled={columnItemsBusy || columnItems.length === 0}
              className="flex-1 h-9 bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-orange-950/40"
            >
              <Flame className="size-3.5" /> Start All ({columnItems.length})
            </Button>
          )}

          {columnStatus === "ready" && (
            <Button
              onClick={() => runItemUpdate(order, columnItems.map((i) => i.id), "READY", "SERVED")}
              disabled={columnItemsBusy || columnItems.length === 0}
              className="flex-1 h-9 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 border border-neutral-700"
            >
              <Check className="size-3.5 text-emerald-400" /> {serveLabel} All ({columnItems.length})
            </Button>
          )}

          {(columnStatus === "new" || columnStatus === "preparing") && (
            <Button
              onClick={() => setRejectingOrder(order)}
              disabled={isLoading}
              variant="outline"
              className={`h-9 px-3 text-xs border-neutral-700 text-neutral-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-xl ${
                columnStatus === "preparing" ? "ml-auto" : ""
              }`}
              title="Reject / cancel the whole ticket"
            >
              <Ban className="size-3.5" />
              {columnStatus === "preparing" && <span className="ml-1">Cancel Ticket</span>}
            </Button>
          )}

          {columnStatus === "completed" && (
            <div className="w-full text-center text-[10px] text-neutral-500 font-mono">
              {normType === "TAKEAWAY"
                ? "Picked Up & Completed"
                : normType === "DELIVERY"
                ? "Delivered & Finished"
                : "Served & Finished"}
            </div>
          )}

          {columnStatus === "cancelled" && (
            <div className="w-full text-center text-[10px] text-rose-400 font-mono">
              Cancelled Ticket
            </div>
          )}
        </div>
      </div>
    );

    function renderItemRow(o: BookingInput, item: OrderItem, column: BoardColumn) {
      const key = `${o.code}:${item.id}`;
      const busy = busyItemKeys.has(key);
      const confirming = confirmCancelKey === key;
      const is86 = stockItemIds.includes(item.id) && (item.status === "PENDING" || item.status === "PREPARING");
      const finished = item.status === "SERVED" || item.status === "CANCELLED";

      // The checkbox mirrors the real item status and advances it one stage
      const action =
        item.status === "PENDING"
          ? { label: "Start", next: "PREPARING" as const, icon: <Play className="size-3" />, cls: "bg-orange-600 hover:bg-orange-500" }
          : item.status === "PREPARING"
          ? { label: `Mark ${readyLabel}`, next: "READY" as const, icon: <CheckCircle2 className="size-3" />, cls: "bg-emerald-600 hover:bg-emerald-500" }
          : item.status === "READY"
          ? { label: serveLabel, next: "SERVED" as const, icon: <HandPlatter className="size-3" />, cls: "bg-neutral-700 hover:bg-neutral-600" }
          : null;
      const advance = () => action && runItemUpdate(o, [item.id], item.status, action.next);

      return (
        <div
          key={item.id}
          className={`rounded-xl border text-xs transition-colors ${
            finished
              ? "bg-neutral-950/40 border-neutral-800/60 text-neutral-400"
              : is86
              ? "bg-rose-950/20 border-rose-800/50 text-neutral-100"
              : "bg-neutral-800/40 border-neutral-700/60 text-neutral-100"
          }`}
        >
          <div className="flex items-center justify-between gap-2 p-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={item.status === "READY" || item.status === "SERVED" ? true : item.status === "PREPARING" ? "mixed" : false}
                aria-label={action ? `${action.label}: ${item.name}` : item.name}
                disabled={!action || busy}
                onClick={advance}
                className={`size-6 rounded-md border flex items-center justify-center shrink-0 transition-colors disabled:cursor-default ${
                  item.status === "READY" || item.status === "SERVED"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : item.status === "PREPARING"
                    ? "bg-orange-600/30 border-orange-500 text-orange-300"
                    : item.status === "CANCELLED"
                    ? "bg-rose-950 border-rose-700 text-rose-400"
                    : "border-neutral-600 bg-neutral-900 hover:border-orange-500"
                }`}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : item.status === "READY" || item.status === "SERVED" ? (
                  <Check className="size-3.5 stroke-[3]" />
                ) : item.status === "PREPARING" ? (
                  <Flame className="size-3.5" />
                ) : item.status === "CANCELLED" ? (
                  <X className="size-3.5" />
                ) : null}
              </button>
              {/* Item Image Thumbnail on KDS Card */}
              <img
                src={
                  (item as any).image ||
                  menuMap.get(item.id)?.image ||
                  liveMenu.find((m) => m.name.toLowerCase() === item.name.toLowerCase())?.image ||
                  "/uploads/menu/placeholder.webp"
                }
                alt={item.name}
                onError={(e) => {
                  e.currentTarget.src = "/uploads/menu/placeholder.webp";
                }}
                className="size-8 rounded-lg object-cover shrink-0 border border-neutral-700 bg-neutral-900"
              />
              <div className="min-w-0">
                <span className={`font-medium block truncate ${finished ? "line-through opacity-60" : ""}`}>
                  <strong className="text-orange-400 font-mono mr-1.5">{item.qty}x</strong>
                  {item.name}
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">
                  ~{item.prepTimeMinutes || 5}m
                  {is86 && <span className="ml-1.5 text-rose-400 font-semibold">86'd — out of stock</span>}
                  {column === "completed" && item.status === "CANCELLED" && <span className="ml-1.5 text-rose-400">cancelled</span>}
                </span>
              </div>
            </div>

            {action && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  onClick={advance}
                  disabled={busy}
                  size="sm"
                  className={`h-8 px-2.5 text-[11px] font-semibold text-white rounded-lg gap-1 ${action.cls}`}
                >
                  {busy ? <Loader2 className="size-3 animate-spin" /> : action.icon}
                  {action.label}
                </Button>
                <Button
                  onClick={() => setConfirmCancelKey(confirming ? null : key)}
                  disabled={busy}
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-neutral-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg"
                  title="Cancel this item"
                  aria-label={`Cancel ${item.name}`}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            )}
          </div>

          {confirming && (
            <div className="flex items-center justify-between gap-2 px-2 pb-2 text-[11px] text-rose-200">
              <span>Cancel {item.qty}x {item.name}?</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmCancelKey(null)}
                  className="h-7 px-2 text-[11px] text-neutral-400"
                >
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => runItemUpdate(o, [item.id], item.status, "CANCELLED")}
                  className="h-7 px-2 text-[11px]"
                >
                  Cancel item
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    }
  }
}
