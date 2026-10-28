import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
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
  CheckCircle2,
  ShieldAlert,
  Wine,
  AlertCircle,
  CreditCard,
  Download,
  FileText,
  Banknote,
  ShoppingBag,
  Bike,
  MapPin,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-qr-code";

import { categories as categoriesRaw, menu as menuRaw, tableTypes as tableTypesRaw, type MenuItem } from "@/data/menu";
import { getOutOfStockItemIds } from "@/lib/stock";
import { subscribeToKitchenEvents } from "@/lib/kitchen.sync";
import {
  getStoredMenu,
  syncMenuFromSupabase,
  isCocktailsCategoryHidden,
  subscribeToMenuUpdates,
} from "@/lib/menu";
import {
  normalizeOrderType,
  getOrderTypeDetails,
  getOrderTypePipelineSteps,
  getOrderCharges,
  validateOrderDetails,
  formatDeliveryAddress,
  type OrderType,
  type OrderFieldErrors,
} from "@/lib/order-types";

const categories = categoriesRaw ?? [];
const menu = menuRaw ?? [];
const tableTypes = tableTypesRaw ?? [];
import {
  createBooking,
  evaluateSlotAndCustomer,
  getPublicClient,
  getUserBookings,
  updateBookingPaymentStatus,
  verifyAndCompleteRazorpayPayment,
  type OrderItem,
} from "@/lib/bookings.functions";
import { sendBookingConfirmationNotifications } from "@/lib/notifications.functions";
import { openRazorpayCheckout } from "@/lib/razorpay.service";
import { downloadReceiptPdf, getReceiptByBookingCode, type StoredReceipt } from "@/lib/receipt.service";
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
  // `table` comes from the on-table QR code (e.g. /reserve?table=T-04); aliases kept for older printed codes
  validateSearch: (search: Record<string, unknown>): {
    phone?: string;
    rebook?: string;
    table?: string;
    orderType?: string;
  } => ({
    phone: (search["phone"] as string) || undefined,
    rebook: (search["rebook"] as string) || undefined,
    table: String(search["table"] ?? search["tableNumber"] ?? search["tableno"] ?? "").trim() || undefined,
    orderType: (search["orderType"] as string) || undefined,
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

const inr = (val: number) => Math.round(val);
const today = () => new Date().toISOString().slice(0, 10);
const genCode = () => `CQ-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

type CartItemState = {
  qty: number;
  fulfillment: "pre_ordered" | "at_table";
};

function ReservePage() {
  const { data: settingsData } = useQuery({
    ...settingsQueryOptions,
    initialData: { upiId: "cafeq@upi", upiPayeeName: "The CAFEQ", deliveryFee: 40, packagingCharge: 0 },
  });
  const settings = settingsData ?? {
    upiId: "cafeq@upi",
    upiPayeeName: "The CAFEQ",
    deliveryFee: 40,
    packagingCharge: 0,
  };
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // A table from the QR code implies Dine-in, regardless of any orderType param
  const initialTable = search.table || "";
  const [orderType, setOrderType] = useState<OrderType>(() =>
    initialTable ? "DINE_IN" : normalizeOrderType(search.orderType)
  );
  const [tableNumber, setTableNumber] = useState(initialTable);
  const [tableFromQr, setTableFromQr] = useState(Boolean(initialTable));
  const [pickupTime, setPickupTime] = useState<string>("ASAP (~15-20 mins)");
  const [deliveryStreet, setDeliveryStreet] = useState<string>("");
  const [deliveryLandmark, setDeliveryLandmark] = useState<string>("");
  const [deliveryPincode, setDeliveryPincode] = useState<string>("");
  const [deliveryInstructions, setDeliveryInstructions] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<OrderFieldErrors>({});

  const [date, setDate] = useState(today());
  const [time, setTime] = useState("09:00");
  const [party, setParty] = useState(2);
  const [selectedTableType, setSelectedTableType] = useState<string>("window");
  const [hasPriorBookings, setHasPriorBookings] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(search.phone || user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");
  const [notes, setNotes] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [occasion, setOccasion] = useState("");
  const [accessibility, setAccessibility] = useState<string[]>([]);
  const [windowPriority, setWindowPriority] = useState(false);

  // Switching order type clears irrelevant fields
  const handleOrderTypeChange = (newType: OrderType) => {
    setOrderType(newType);
    setFieldErrors({});

    if (newType !== "DINE_IN") {
      setTableNumber("");
      setTableFromQr(false);
    } else {
      if (initialTable) {
        setTableNumber(initialTable);
        setTableFromQr(true);
      }
    }

    if (newType !== "TAKEAWAY") {
      setPickupTime("");
    } else {
      setPickupTime("ASAP (~15-20 mins)");
    }

    if (newType !== "DELIVERY") {
      setDeliveryStreet("");
      setDeliveryLandmark("");
      setDeliveryPincode("");
      setDeliveryInstructions("");
    }

    // Takeaway & Delivery always require food ordering
    if (newType !== "DINE_IN") {
      setWantFoodOnArrival(true);
    }
  };

  // Require login to reserve
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast.info("Please sign in or register to reserve a table.");
      navigate({ to: "/login", search: { redirect: "/reserve" } });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Dynamic pre-fill fields from authenticated user profile
  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setEmail(user.email || "");
    } else {
      setName("");
      setPhone("");
      setEmail("");
    }
  }, [user?.id, user?.name, user?.email, user?.phone]);

  // Menu items & real-time sync
  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => getStoredMenu());
  const [outOfStockIds, setOutOfStockIds] = useState<string[]>(() => getOutOfStockItemIds());
  const [hideCocktails, setHideCocktails] = useState<boolean>(() => isCocktailsCategoryHidden());
  const [ageConfirmItem, setAgeConfirmItem] = useState<MenuItem | null>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setMenuItems(getStoredMenu());
      setOutOfStockIds(getOutOfStockItemIds());
      setHideCocktails(isCocktailsCategoryHidden());

      // Background sync from Supabase if connected
      syncMenuFromSupabase()
        .then((latest) => {
          if (latest && latest.length > 0) {
            setMenuItems(latest);
            setOutOfStockIds(getOutOfStockItemIds());
          }
        })
        .catch(() => {});
    };

    // Initial load
    refresh();

    // 1. Cross-tab sync via BroadcastChannel and storage events
    const unsubMenu = subscribeToMenuUpdates(refresh);

    // 2. Kitchen sync events (STOCK_CHANGED)
    const unsubKitchen = subscribeToKitchenEvents((event) => {
      if (event.type === "STOCK_CHANGED") {
        setOutOfStockIds(getOutOfStockItemIds());
        setMenuItems(getStoredMenu());
      }
    });

    // 3. Refetch immediately on window focus and visibility change
    const handleFocus = () => refresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    // 4. Short polling (every 10 seconds)
    const pollInterval = setInterval(refresh, 10000);

    // 5. Supabase Realtime subscription (when Supabase is configured)
    const supabase = getPublicClient();
    let realtimeChannel: any = null;
    if (supabase) {
      try {
        realtimeChannel = supabase
          .channel("public-menu-stock-realtime")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "menu_items" },
            () => {
              refresh();
            }
          )
          .subscribe();
      } catch (err) {
        console.warn("Could not establish Supabase realtime channel:", err);
      }
    }

    return () => {
      unsubMenu();
      unsubKitchen();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(pollInterval);
      if (realtimeChannel && supabase) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  const availableCategories = useMemo(() => {
    const distinct = Array.from(new Set(menuItems.map((m) => m.category)));
    return distinct.filter((cat) => {
      if (hideCocktails && (cat.toLowerCase().includes("cocktail") || cat.includes("18+"))) {
        return false;
      }
      return true;
    });
  }, [menuItems, hideCocktails]);

  // Merged flow toggle
  const [wantFoodOnArrival, setWantFoodOnArrival] = useState(true);
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>("Hot Beverages");

  // Keep active category tab valid if categories change
  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(activeCategoryTab)) {
      setActiveCategoryTab(availableCategories[0]);
    }
  }, [availableCategories, activeCategoryTab]);

  // Cart
  const [cart, setCart] = useState<Record<string, CartItemState>>({});
  // Payment: online_razorpay vs upi_prepay vs pay_on_arrival
  const [paymentMethod, setPaymentMethod] = useState<"online_razorpay" | "upi_prepay" | "pay_on_arrival">("online_razorpay");
  const [code, setCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Post-booking QR and Online payment state
  const [qrPaymentStatus, setQrPaymentStatus] = useState<"pending" | "paid">("pending");
  const [txnRef, setTxnRef] = useState("");
  const [markingPaid, setMarkingPaid] = useState(false);
  const [payingOnline, setPayingOnline] = useState(false);
  const [receiptData, setReceiptData] = useState<StoredReceipt | null>(null);

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
          const removedNames: string[] = [];
          decoded.items.forEach((it: { id: string; name?: string; qty: number; fulfillment?: "pre_ordered" | "at_table" }) => {
            const exists = menuItems.some((m) => m.id === it.id);
            if (exists) {
              newCart[it.id] = { qty: it.qty, fulfillment: it.fulfillment || "pre_ordered" };
            } else {
              removedNames.push(it.name || it.id);
            }
          });
          setCart(newCart);
          setWantFoodOnArrival(Object.keys(newCart).length > 0);
          if (removedNames.length > 0) {
            toast.warning(
              `Some items from your previous booking (${removedNames.join(", ")}) are no longer on the menu and were removed.`
            );
          }
        }
        toast.info("Pre-filled your previous booking & favorite items!");
      } catch (err) {
        console.error("Failed to parse rebook query:", err);
      }
    }
  }, [search.rebook, menuItems]);

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
      .filter(([id, state]) => state.qty > 0 && menuItems.some((m) => m.id === id))
      .map(([id, state]) => {
        const menuItem = menuItems.find((m) => m.id === id)!;
        return {
          id,
          name: menuItem.name,
          qty: state.qty,
          price: inr(menuItem.price),
          prepTimeMinutes: menuItem.prepTimeMinutes,
          fulfillment: state.fulfillment,
          category: menuItem.category,
          status: "PENDING" as const,
          isVeg: menuItem.isVeg,
          image: menuItem.image || "/uploads/menu/placeholder.webp",
        };
      });
  }, [cart, wantFoodOnArrival, menuItems]);

  const preOrderedItems = useMemo(() => items.filter((i) => i.fulfillment === "pre_ordered"), [items]);
  const atTableItems = useMemo(() => items.filter((i) => i.fulfillment === "at_table"), [items]);
  const outOfStockInCart = useMemo(() => {
    return items.filter((it) => {
      const menuItem = menuItems.find((m) => m.id === it.id);
      return menuItem?.isAvailable === false || outOfStockIds.includes(it.id);
    });
  }, [items, menuItems, outOfStockIds]);

  const foodTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const { deliveryFee, packagingCharge } = getOrderCharges(orderType, settings);
  const depositAmount = orderType === "DINE_IN" && slotEvaluation.depositRequired ? slotEvaluation.depositAmount : 0;
  const totalWithDeposit = foodTotal + deliveryFee + packagingCharge + depositAmount;

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
    const item = menuItems.find((m) => m.id === id);
    if (!item) return;

    const isOutOfStock = item.isAvailable === false || outOfStockIds.includes(item.id);
    if (delta > 0 && isOutOfStock) {
      toast.error(`"${item.name}" is currently out of stock and cannot be added.`);
      return;
    }

    if (delta > 0 && item.isAlcoholic && (!cart[id] || cart[id].qty === 0) && !ageConfirmed) {
      setAgeConfirmItem(item);
      return;
    }

    setCart((prev) => {
      const current = prev[id] || { qty: 0, fulfillment: "pre_ordered" };
      const nextQty = Math.max(0, current.qty + delta);
      const copy = { ...prev };
      if (nextQty === 0) delete copy[id];
      else copy[id] = { ...current, qty: nextQty };
      return copy;
    });
  };

  const handleConfirmAgeAndAdd = () => {
    if (ageConfirmItem) {
      const isOutOfStock = ageConfirmItem.isAvailable === false || outOfStockIds.includes(ageConfirmItem.id);
      if (isOutOfStock) {
        toast.error(`"${ageConfirmItem.name}" is currently out of stock.`);
        setAgeConfirmItem(null);
        return;
      }

      setAgeConfirmed(true);
      const id = ageConfirmItem.id;
      setCart((prev) => {
        const current = prev[id] || { qty: 0, fulfillment: "pre_ordered" };
        return { ...prev, [id]: { ...current, qty: current.qty + 1 } };
      });
      setAgeConfirmItem(null);
      toast.success("Age verified: 18+ beverage added to order");
    }
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

    // 1. Validate required fields per Order Type (same rules createBooking enforces)
    const errors = validateOrderDetails({
      orderType,
      customerName: name,
      customerPhone: phone,
      tableNumber,
      itemCount: items.length,
      ...(orderType === "DELIVERY" && { deliveryStreet, deliveryPincode }),
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error(Object.values(errors)[0]);
      return;
    }
    setFieldErrors({});

    // Client-side guard: verify no out-of-stock items in pre-order
    const outOfStockInCart = items.filter((it) => {
      const menuItem = menuItems.find((m) => m.id === it.id);
      return menuItem?.isAvailable === false || outOfStockIds.includes(it.id);
    });
    if (outOfStockInCart.length > 0) {
      const names = outOfStockInCart.map((i) => i.name).join(", ");
      toast.error(`Cannot proceed: "${names}" is out of stock. Please remove it from your order.`);
      return;
    }

    setSubmitting(true);
    const bookingCode = genCode();
    const initialPaymentStatus =
      paymentMethod === "online_razorpay"
        ? "pending_online"
        : paymentMethod === "upi_prepay"
        ? "pending_qr"
        : "pending_cash";

    try {
      await createBooking({
        data: {
          code: bookingCode,
          orderType,
          tableNumber: orderType === "DINE_IN" ? tableNumber.trim() : null,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          deliveryAddress:
            orderType === "DELIVERY" ? formatDeliveryAddress(deliveryStreet, deliveryLandmark, deliveryPincode) : null,
          deliveryInstructions: orderType === "DELIVERY" ? deliveryInstructions.trim() || null : null,
          pickupTime: orderType === "TAKEAWAY" ? pickupTime.trim() || null : null,
          deliveryFee,
          packagingCharge,
          date,
          time: orderType === "DINE_IN" ? time : (orderType === "TAKEAWAY" ? (pickupTime.trim() || "ASAP") : "Standard Delivery"),
          party: orderType === "DINE_IN" ? party : 1,
          seating: orderType === "DINE_IN" ? (tableTypes.find((t) => t.id === selectedTableType)?.name || selectedTableType) : `Order: ${orderType}`,
          tableType: orderType === "DINE_IN" ? selectedTableType : "standard",
          hasPreorder: items.length > 0,
          estimatedPrepTime: readyTimeEstimate ? readyTimeEstimate.prepMinutes : 0,
          foodReadyTime: readyTimeEstimate ? readyTimeEstimate.readyTimeStr : null,
          isPeakHour: orderType === "DINE_IN" ? slotEvaluation.isPeakHour : false,
          depositRequired: orderType === "DINE_IN" ? slotEvaluation.depositRequired : false,
          depositAmount: depositAmount,
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
          userId: user?.id || null,
          status: "confirmed",
          kitchenStatus: "new" as const,
        },
      });

      try {
        await sendBookingConfirmationNotifications({
          name: name.trim(),
          phone: phone.trim(),
          date,
          time,
          tableType: orderType === "DINE_IN" ? (tableTypes.find((t) => t.id === selectedTableType)?.name || selectedTableType) : `Order (${orderType})`,
          partySize: orderType === "DINE_IN" ? party : 1,
          bookingCode,
          preOrdered: items.length > 0,
          totalAmount: totalWithDeposit,
        });
      } catch (err) {
        console.error("Failed to send notification:", err);
      }

      setCode(bookingCode);
      setQrPaymentStatus("pending");
      const successMsg =
        orderType === "DINE_IN"
          ? "Table reserved & order placed!"
          : orderType === "TAKEAWAY"
          ? "Takeaway order placed! We'll start prepping your food."
          : "Delivery order placed! Kitchen dispatch queued.";
      toast.success(successMsg);
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

      // Generate receipt
      const fetchedReceipt = await getReceiptByBookingCode(code);
      if (fetchedReceipt) setReceiptData(fetchedReceipt);

      toast.success("Payment marked as verified!");
    } catch (err) {
      toast.error("Could not update payment status.");
    } finally {
      setMarkingPaid(false);
    }
  };

  const handlePayWithRazorpay = async () => {
    if (!code) return;
    setPayingOnline(true);
    try {
      await openRazorpayCheckout({
        amount: totalWithDeposit,
        bookingCode: code,
        customerName: name,
        customerEmail: email || undefined,
        customerPhone: phone,
        description: `CafeQ Dining & Reservation — ${code}`,
        onSuccess: async (payment) => {
          toast.info("Verifying Razorpay payment signature…");
          const verification = await verifyAndCompleteRazorpayPayment({
            code,
            orderId: payment.razorpay_order_id,
            paymentId: payment.razorpay_payment_id,
            signature: payment.razorpay_signature,
          });

          if (verification.success) {
            setQrPaymentStatus("paid");
            if (verification.receipt) {
              setReceiptData(verification.receipt);
            }
            toast.success("Payment verified! Digital receipt generated & sent.");
          } else {
            toast.error(verification.error || "Payment verification failed.");
          }
          setPayingOnline(false);
        },
        onError: (err) => {
          toast.error(`Payment failed: ${err.description}`);
          setPayingOnline(false);
        },
        onDismiss: () => {
          setPayingOnline(false);
        },
      });
    } catch (err) {
      toast.error("Could not launch Razorpay checkout.");
      setPayingOnline(false);
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
    const typeDetails = getOrderTypeDetails(orderType);
    const pipelineSteps = getOrderTypePipelineSteps(orderType);

    return (
      <>
        <PageBackground imageUrl="https://images.unsplash.com/photo-1559525839-b184a4d698c7?q=80&w=2000&auto=format&fit=crop" />
        <div className="mx-auto max-w-xl px-5 py-20 text-center relative z-10 bg-background/80 backdrop-blur-md rounded-3xl mt-12 border border-border/50">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg">
            <Check className="size-7" aria-hidden="true" />
          </div>

          {/* Order Type Badge */}
          <div className="mt-4 flex justify-center">
            <Badge className={`px-3 py-1 text-xs font-semibold flex items-center gap-1.5 shadow-xs ${typeDetails.badgeClass}`}>
              {typeDetails.type === "DINE_IN" && <Utensils className="size-3.5" />}
              {typeDetails.type === "TAKEAWAY" && <ShoppingBag className="size-3.5" />}
              {typeDetails.type === "DELIVERY" && <Bike className="size-3.5" />}
              {typeDetails.label}
            </Badge>
          </div>

          <h1 className="mt-3 text-3xl sm:text-4xl font-display">
            {orderType === "DINE_IN" ? `You're Booked, ${name.split(" ")[0]}!` : `Order Placed, ${name.split(" ")[0]}!`}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {orderType === "DINE_IN" && (
              <>{tableNumber ? `Table ${tableNumber} · ` : ""}{party} {party === 1 ? "Guest" : "Guests"} · {tableTypes.find((t) => t.id === selectedTableType)?.name} · {date} at {time}</>
            )}
            {orderType === "TAKEAWAY" && (
              <>Takeaway Pickup: {pickupTime || "ASAP (~15-20 mins)"} · Collect at Counter</>
            )}
            {orderType === "DELIVERY" && (
              <>Delivery to: {deliveryStreet}{deliveryPincode ? ` (${deliveryPincode})` : ""}</>
            )}
          </p>

          {/* Status Flow Pipeline Tracker */}
          <div className="mt-6 rounded-2xl border border-border/80 bg-card p-4 text-left shadow-xs">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Order Status Flow ({typeDetails.label})
            </p>
            <div className="flex items-center justify-between relative">
              {pipelineSteps.map((step, idx) => {
                const isCurrent = idx === 0;
                return (
                  <div key={step} className="flex-1 flex flex-col items-center text-center relative z-10">
                    <div
                      className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        isCurrent
                          ? "bg-accent text-accent-foreground ring-4 ring-accent/20"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <span
                      className={`text-[11px] mt-1.5 font-medium ${
                        isCurrent ? "text-foreground font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
              <div className="absolute top-4 left-6 right-6 h-0.5 bg-border -z-0" />
            </div>
          </div>

          {/* Type-Specific Details Card */}
          {orderType === "DINE_IN" && tableNumber && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-left flex items-center justify-between">
              <span className="text-muted-foreground">Assigned Table:</span>
              <span className="font-bold text-foreground text-sm">Table #{tableNumber}</span>
            </div>
          )}
          {orderType === "TAKEAWAY" && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-3.5 text-xs text-left space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated Pickup:</span>
                <span className="font-bold text-foreground">{pickupTime || "ASAP (~15-20 mins)"}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Please present your booking code <strong>{code}</strong> at the front counter when you arrive.
              </p>
            </div>
          )}
          {orderType === "DELIVERY" && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-3.5 text-xs text-left space-y-1">
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground">Delivery Destination:</span>
                <span className="font-semibold text-foreground text-right max-w-[65%]">
                  {deliveryStreet}{deliveryLandmark ? `, ${deliveryLandmark}` : ""}{deliveryPincode ? ` - ${deliveryPincode}` : ""}
                </span>
              </div>
              {deliveryInstructions && (
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <strong>Instructions:</strong> {deliveryInstructions}
                </p>
              )}
              <div className="flex justify-between pt-1 border-t border-border/40 text-[11px]">
                <span className="text-muted-foreground">Contact:</span>
                <span className="font-medium text-foreground">{phone}</span>
              </div>
            </div>
          )}

          <div className="mt-6 inline-block rounded-xl bg-secondary/70 border border-border px-6 py-3">
            <p className="eyebrow text-[11px]">Booking Order Code</p>
            <p className="mt-1 font-display text-3xl tracking-widest text-foreground font-bold">{code}</p>
          </div>

        {/* Payment Confirmation Component: Razorpay vs QR Code vs Cash on Arrival */}
        {paymentMethod === "online_razorpay" ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-left shadow-warm">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow text-accent">Payment Gateway: Razorpay</p>
                <h3 className="text-lg font-semibold text-foreground mt-0.5">Total Amount: ₹{totalWithDeposit}</h3>
              </div>
              <Badge
                variant={qrPaymentStatus === "paid" ? "default" : "secondary"}
                className={qrPaymentStatus === "paid" ? "bg-emerald-600 text-white" : "bg-amber-500/10 text-amber-700"}
              >
                {qrPaymentStatus === "paid" ? "✅ Payment Verified" : "⏳ Pending Razorpay Payment"}
              </Badge>
            </div>

            {qrPaymentStatus === "pending" ? (
              <div className="mt-5 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Pay securely via <strong>Razorpay (UPI, Credit/Debit Cards, Netbanking, Wallets)</strong>. 
                  Test mode enabled. Once settled, your digital tax receipt will be generated automatically and attached to your confirmation email.
                </p>

                <div className="pt-2">
                  <Button
                    onClick={handlePayWithRazorpay}
                    disabled={payingOnline}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3 shadow-md"
                    size="lg"
                  >
                    <CreditCard className="size-4 mr-2" />
                    {payingOnline ? "Opening Razorpay Checkout…" : `Pay ₹${totalWithDeposit} with Razorpay`}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-5 text-center space-y-3">
                <div>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-base">
                    Online Payment Verified & Completed!
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your payment of ₹{totalWithDeposit} has been processed via Razorpay. Booking ref: {code}.
                  </p>
                </div>

                {receiptData && (
                  <div className="pt-2 flex justify-center">
                    <Button
                      onClick={() => downloadReceiptPdf(receiptData)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs shadow-sm"
                      size="sm"
                    >
                      <Download className="size-3.5 mr-1.5" /> Download Tax Receipt (PDF)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : paymentMethod === "upi_prepay" ? (
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
                {receiptData && (
                  <div className="pt-2 flex justify-center">
                    <Button
                      onClick={() => downloadReceiptPdf(receiptData)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs shadow-sm"
                      size="sm"
                    >
                      <Download className="size-3.5 mr-1.5" /> Download Tax Receipt (PDF)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-left shadow-warm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="size-5 text-accent" />
                <h3 className="font-semibold text-base text-foreground">
                  {orderType === "DELIVERY" ? "Cash on Delivery" : "Cash on Arrival"}
                </h3>
              </div>
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 text-xs">
                {orderType === "DELIVERY" ? "Pay the Rider" : "Pending Cash at Counter"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {orderType === "DINE_IN" && (
                <>Your table is reserved and dishes are queued. Settle your bill of <strong>₹{totalWithDeposit}</strong> in cash at the counter when you visit.</>
              )}
              {orderType === "TAKEAWAY" && (
                <>Your order is queued. Pay <strong>₹{totalWithDeposit}</strong> in cash at the counter when you collect it.</>
              )}
              {orderType === "DELIVERY" && (
                <>Your order is queued. Please keep <strong>₹{totalWithDeposit}</strong> ready to pay the rider on delivery.</>
              )}
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
      <form onSubmit={submit} className="mx-auto max-w-6xl px-4 sm:px-8 py-10 sm:py-16 relative z-10 bg-background/80 backdrop-blur-md my-8 sm:my-12 rounded-3xl border border-border/50">
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

      {/* TWO DISTINCT BLOCKS: Reservation Form Steps & Summary Card */}
      <div className="mt-10 flex flex-col lg:flex-row items-start gap-8">
        <div className="w-full flex-1 min-w-0 space-y-10">
          {/* STEP 1: ORDER TYPE SELECTOR */}
          <section className="rounded-3xl border border-border/80 bg-card/60 p-6 shadow-xs backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                  1
                </span>
                <h2 className="text-xl font-display">Select Order Type</h2>
              </div>
              <Badge variant="secondary" className="text-xs font-semibold">
                {orderType === "DINE_IN" ? "Dine-in (Default)" : orderType === "TAKEAWAY" ? "Takeaway Pickup" : "Doorstep Delivery"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose how you would like to enjoy your food & beverages. Default is Dine-in.
            </p>

            {/* Segmented Radio Cards with Icons */}
            <div role="radiogroup" aria-label="Order type" className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <button
                type="button"
                role="radio"
                aria-checked={orderType === "DINE_IN"}
                onClick={() => handleOrderTypeChange("DINE_IN")}
                className={`relative flex items-center sm:flex-col sm:items-start gap-3.5 p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  orderType === "DINE_IN"
                    ? "border-accent bg-accent/15 ring-2 ring-accent shadow-sm"
                    : "border-border/80 bg-card hover:bg-secondary/40 hover:border-border"
                }`}
              >
                <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${
                  orderType === "DINE_IN" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <Utensils className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-foreground">Dine-in</span>
                    {orderType === "DINE_IN" && (
                      <CheckCircle2 className="size-4 text-accent" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Eat at café & table service
                  </p>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={orderType === "TAKEAWAY"}
                onClick={() => handleOrderTypeChange("TAKEAWAY")}
                className={`relative flex items-center sm:flex-col sm:items-start gap-3.5 p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  orderType === "TAKEAWAY"
                    ? "border-accent bg-accent/15 ring-2 ring-accent shadow-sm"
                    : "border-border/80 bg-card hover:bg-secondary/40 hover:border-border"
                }`}
              >
                <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${
                  orderType === "TAKEAWAY" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <ShoppingBag className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-foreground">Takeaway</span>
                    {orderType === "TAKEAWAY" && (
                      <CheckCircle2 className="size-4 text-accent" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Self pickup at counter
                  </p>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={orderType === "DELIVERY"}
                onClick={() => handleOrderTypeChange("DELIVERY")}
                className={`relative flex items-center sm:flex-col sm:items-start gap-3.5 p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  orderType === "DELIVERY"
                    ? "border-accent bg-accent/15 ring-2 ring-accent shadow-sm"
                    : "border-border/80 bg-card hover:bg-secondary/40 hover:border-border"
                }`}
              >
                <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${
                  orderType === "DELIVERY" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <Bike className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-foreground">Delivery</span>
                    {orderType === "DELIVERY" && (
                      <CheckCircle2 className="size-4 text-accent" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Doorstep hot dispatch
                  </p>
                </div>
              </button>
            </div>

            {/* DYNAMIC EXTRA FIELDS FOR EACH TYPE */}
            {orderType === "DINE_IN" && (
              <div className="mt-5 p-4 sm:p-5 rounded-2xl bg-background/70 border border-border/80 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label htmlFor="tableNumber" className="text-xs font-semibold flex items-center gap-1.5">
                    <Utensils className="size-3.5 text-accent" /> Table Number (Required for Dine-in)
                  </Label>
                  {tableFromQr && (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 flex items-center gap-1">
                      <QrCode className="size-3" /> Auto-filled from Table QR
                    </Badge>
                  )}
                </div>
                <Input
                  id="tableNumber"
                  value={tableNumber}
                  onChange={(e) => {
                    setTableNumber(e.target.value);
                    if (fieldErrors.tableNumber) {
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.tableNumber;
                        return copy;
                      });
                    }
                  }}
                  placeholder="e.g. Table 4, T-08, or Window Booth 2"
                  className={fieldErrors.tableNumber ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {fieldErrors.tableNumber && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="size-3.5" /> {fieldErrors.tableNumber}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Look at your table plaque or scan your on-table QR code to route orders directly to your seating.
                </p>
              </div>
            )}

            {orderType === "TAKEAWAY" && (
              <div className="mt-5 p-4 sm:p-5 rounded-2xl bg-background/70 border border-border/80 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="takeawayName" className="text-xs font-semibold">
                      Customer Name (Required)
                    </Label>
                    <Input
                      id="takeawayName"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (fieldErrors.name) {
                          setFieldErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.name;
                            return copy;
                          });
                        }
                      }}
                      placeholder="Alex Morgan"
                      className={`mt-1.5 ${fieldErrors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {fieldErrors.name && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="size-3.5" /> {fieldErrors.name}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="takeawayPhone" className="text-xs font-semibold">
                      Phone Number (Required for pickup SMS)
                    </Label>
                    <Input
                      id="takeawayPhone"
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (fieldErrors.phone) {
                          setFieldErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.phone;
                            return copy;
                          });
                        }
                      }}
                      placeholder="+91 98765 43210"
                      className={`mt-1.5 ${fieldErrors.phone ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {fieldErrors.phone && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="size-3.5" /> {fieldErrors.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Clock className="size-3.5 text-accent" /> Estimated Pickup Time (Optional)
                  </Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["ASAP (~15-20 mins)", "In 30 mins", "In 45 mins", "In 1 hour"].map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        size="sm"
                        variant={pickupTime === preset ? "default" : "outline"}
                        onClick={() => setPickupTime(preset)}
                        className="text-xs h-8"
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                  <Input
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    placeholder="Or type custom pickup time (e.g. 1:30 PM)"
                    className="mt-2 text-xs"
                  />
                </div>

                <div className="rounded-xl bg-accent/10 border border-accent/20 p-3 text-xs text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Package className="size-3.5 text-accent" /> Insulated Eco-Packaging
                  </span>
                  <span className="font-semibold text-foreground">
                    {packagingCharge > 0 ? `₹${packagingCharge}` : "FREE (₹0)"}
                  </span>
                </div>
              </div>
            )}

            {orderType === "DELIVERY" && (
              <div className="mt-5 p-4 sm:p-5 rounded-2xl bg-background/70 border border-border/80 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="deliveryName" className="text-xs font-semibold">
                      Recipient Name (Required)
                    </Label>
                    <Input
                      id="deliveryName"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (fieldErrors.name) {
                          setFieldErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.name;
                            return copy;
                          });
                        }
                      }}
                      placeholder="Alex Morgan"
                      className={`mt-1.5 ${fieldErrors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {fieldErrors.name && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="size-3.5" /> {fieldErrors.name}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="deliveryPhone" className="text-xs font-semibold">
                      Phone Number (Required for rider)
                    </Label>
                    <Input
                      id="deliveryPhone"
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (fieldErrors.phone) {
                          setFieldErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.phone;
                            return copy;
                          });
                        }
                      }}
                      placeholder="+91 98765 43210"
                      className={`mt-1.5 ${fieldErrors.phone ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {fieldErrors.phone && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="size-3.5" /> {fieldErrors.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="deliveryStreet" className="text-xs font-semibold flex items-center gap-1">
                      <MapPin className="size-3.5 text-accent" /> Street Address / Flat / Building (Required)
                    </Label>
                    <Input
                      id="deliveryStreet"
                      value={deliveryStreet}
                      onChange={(e) => {
                        setDeliveryStreet(e.target.value);
                        if (fieldErrors.deliveryStreet) {
                          setFieldErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.deliveryStreet;
                            return copy;
                          });
                        }
                      }}
                      placeholder="Flat 302, Green Garden Apts, 5th Cross Road"
                      className={`mt-1.5 ${fieldErrors.deliveryStreet ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    />
                    {fieldErrors.deliveryStreet && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="size-3.5" /> {fieldErrors.deliveryStreet}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="deliveryLandmark" className="text-xs font-semibold">
                        Landmark / Area (Optional)
                      </Label>
                      <Input
                        id="deliveryLandmark"
                        value={deliveryLandmark}
                        onChange={(e) => setDeliveryLandmark(e.target.value)}
                        placeholder="Opposite Metro Gate 2"
                        className="mt-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="deliveryPincode" className="text-xs font-semibold">
                        Postal Pincode (6 digits, Required)
                      </Label>
                      <Input
                        id="deliveryPincode"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={6}
                        value={deliveryPincode}
                        onChange={(e) => {
                          setDeliveryPincode(e.target.value.replace(/\D/g, ""));
                          if (fieldErrors.deliveryPincode) {
                            setFieldErrors((prev) => {
                              const copy = { ...prev };
                              delete copy.deliveryPincode;
                              return copy;
                            });
                          }
                        }}
                        placeholder="560034"
                        className={`mt-1.5 text-xs ${fieldErrors.deliveryPincode ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      />
                      {fieldErrors.deliveryPincode && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="size-3.5" /> {fieldErrors.deliveryPincode}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="deliveryInstructions" className="text-xs font-semibold">
                      Delivery Instructions (Optional)
                    </Label>
                    <Input
                      id="deliveryInstructions"
                      value={deliveryInstructions}
                      onChange={(e) => setDeliveryInstructions(e.target.value)}
                      placeholder="Leave with security gate, ring bell twice, etc."
                      className="mt-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-accent/10 border border-accent/20 p-3 text-xs text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Bike className="size-3.5 text-accent" /> Doorstep Express Delivery
                  </span>
                  <span className="font-semibold text-foreground">
                    ₹{deliveryFee}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* DINE-IN SPECIFIC SECTIONS: Date, Time & Table Selection */}
          {orderType === "DINE_IN" && (
            <>
              {/* STEP 2: Date, Time & Party */}
              <section>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                    2
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

              {/* STEP 3: Table Type Selection */}
              <section>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                    3
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
            </>
          )}

          {/* STEP 4 (Dine-in) / STEP 2 (Takeaway, Delivery): Food & Drinks */}
          <section
            id="order-cart"
            className={`rounded-2xl border bg-secondary/30 p-6 shadow-xs ${
              fieldErrors.cart ? "border-destructive/60" : "border-border/80"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                  {orderType === "DINE_IN" ? 4 : 2}
                </span>
                <div>
                  <h2 className="text-xl font-display">
                    {orderType === "DINE_IN" ? "Food & Drinks Ready on Arrival?" : "Add Food & Drinks"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {orderType === "DINE_IN"
                      ? "Optional inline pre-order so coffees & bakery land the minute you sit down."
                      : `Add at least one item for your ${orderType === "TAKEAWAY" ? "takeaway" : "delivery"} order.`}
                  </p>
                </div>
              </div>

              {orderType === "DINE_IN" && (
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
              )}
            </div>

            {fieldErrors.cart && (
              <p role="alert" className="mt-4 text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="size-3.5" /> {fieldErrors.cart}
              </p>
            )}

            {wantFoodOnArrival && (
              <div className="mt-8 space-y-6 animate-in fade-in-50 duration-300">
                {orderType === "DINE_IN" && readyTimeEstimate && (
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
                  {availableCategories.map((cat) => (
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
                  {menuItems
                    .filter((m) => m.category === activeCategoryTab)
                    .map((item) => {
                      const itemCartState = cart[item.id];
                      const qty = itemCartState?.qty || 0;
                      const isPreorder = itemCartState?.fulfillment === "pre_ordered";
                      const isOutOfStock =
                        item.isAvailable === false || outOfStockIds.includes(item.id);

                      return (
                        <div
                          key={item.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-3.5 shadow-xs transition-colors ${
                            isOutOfStock
                              ? "border-border/40 bg-muted/30 opacity-60 grayscale-[40%]"
                              : "border-border/70 bg-card hover:border-accent/40"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative shrink-0">
                              <img
                                src={item.image || "/uploads/menu/placeholder.webp"}
                                alt={item.name}
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.src = "/uploads/menu/placeholder.webp";
                                }}
                                className={`size-16 rounded-xl object-cover border border-border/60 ${
                                  isOutOfStock ? "filter grayscale brightness-75" : ""
                                }`}
                              />
                              {isOutOfStock && (
                                <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] rounded-xl flex items-center justify-center p-1 text-center">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1 py-0.5 rounded bg-background/90 shadow-xs">
                                    Sold Out
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`size-2.5 rounded-full border inline-block shrink-0 ${
                                    item.isVeg
                                      ? "bg-emerald-500 border-emerald-600"
                                      : "bg-rose-500 border-rose-600"
                                  }`}
                                  title={item.isVeg ? "Vegetarian" : "Non-Vegetarian"}
                                />
                                <h4
                                  className={`font-medium text-sm truncate ${
                                    isOutOfStock
                                      ? "text-muted-foreground line-through"
                                      : "text-foreground"
                                  }`}
                                >
                                  {item.name}
                                </h4>
                                {isOutOfStock ? (
                                  <Badge
                                    variant="destructive"
                                    className="bg-red-500/15 text-red-500 dark:text-red-400 border border-red-500/30 text-[10px] font-semibold px-1.5 py-0"
                                  >
                                    Out of Stock
                                  </Badge>
                                ) : (
                                  <>
                                    {item.isAlcoholic && (
                                      <Badge className="bg-rose-600 text-white text-[9px] px-1 py-0 font-bold flex items-center gap-0.5">
                                        <Wine className="size-2.5" /> 18+
                                      </Badge>
                                    )}
                                    {item.tag && (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] font-normal px-1.5 py-0"
                                      >
                                        {item.tag}
                                      </Badge>
                                    )}
                                  </>
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
                            {isOutOfStock ? (
                              <div className="flex items-center gap-2">
                                {qty > 0 && (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-8 text-destructive border-destructive/30"
                                    aria-label={`Remove out of stock ${item.name}`}
                                    onClick={() => changeQty(item.id, -1)}
                                    title="Remove from selection"
                                  >
                                    <Minus className="size-3.5" />
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled
                                  className="h-8 px-3 text-xs font-semibold bg-muted/60 text-muted-foreground border-border/60 cursor-not-allowed opacity-80"
                                >
                                  Out of Stock
                                </Button>
                              </div>
                            ) : (
                              <>
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
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </section>

          {/* STEP 5 (Dine-in) / STEP 3: Preferences & Notes */}
          <section>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
                {orderType === "DINE_IN" ? 5 : 3}
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
        <aside className="w-full lg:w-[380px] lg:shrink-0">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-warm">
            <div className="flex items-center justify-between pb-3 border-b border-border/70">
              <h3 className="text-xl font-display text-foreground">Order Summary</h3>
              <Badge className={`px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1 shadow-xs ${getOrderTypeDetails(orderType).badgeClass}`}>
                {orderType === "DINE_IN" && <Utensils className="size-3" />}
                {orderType === "TAKEAWAY" && <ShoppingBag className="size-3" />}
                {orderType === "DELIVERY" && <Bike className="size-3" />}
                {getOrderTypeDetails(orderType).label}
              </Badge>
            </div>

            <div className="mt-3 text-xs space-y-1 text-muted-foreground">
              {orderType === "DINE_IN" && (
                <>
                  <p className="font-medium text-foreground">
                    {tableNumber ? `Table #${tableNumber}` : "Table pending"} · {party} {party === 1 ? "Guest" : "Guests"}
                  </p>
                  <p>{date} at {time} · {tableTypes.find((t) => t.id === selectedTableType)?.name}</p>
                </>
              )}
              {orderType === "TAKEAWAY" && (
                <>
                  <p className="font-medium text-foreground">Self Pickup: {pickupTime || "ASAP (~15-20 mins)"}</p>
                  <p>Collect hot & packed at front counter</p>
                </>
              )}
              {orderType === "DELIVERY" && (
                <>
                  <p className="font-medium text-foreground">
                    {deliveryStreet ? `${deliveryStreet}${deliveryPincode ? ` (${deliveryPincode})` : ""}` : "Delivery address required"}
                  </p>
                  <p>Express courier dispatch</p>
                </>
              )}
            </div>

            <div className="mt-5 space-y-4">
              {/* Takeaway & Delivery collect name/phone in their own panel above */}
              {orderType === "DINE_IN" && (
              <>
              <div>
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) {
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.name;
                        return copy;
                      });
                    }
                  }}
                  placeholder={user?.name || "e.g. Alex Morgan"}
                  className={`mt-1.5 ${fieldErrors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  required
                />
                {fieldErrors.name && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="size-3.5" /> {fieldErrors.name}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) {
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.phone;
                        return copy;
                      });
                    }
                  }}
                  placeholder={user?.phone || "+91 90000 00000"}
                  className={`mt-1.5 ${fieldErrors.phone ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  required
                />
                {fieldErrors.phone && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="size-3.5" /> {fieldErrors.phone}
                  </p>
                )}
                {hasPriorBookings && (
                  <p className="mt-1 text-[11px] text-emerald-600 flex items-center gap-1">
                    <ShieldCheck className="size-3.5" /> Welcome back! Repeat guest verified.
                  </p>
                )}
              </div>
              </>
              )}
              <div>
                <Label htmlFor="email">Email (Optional for tax receipt)</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={user?.email || "e.g. alex@example.com"}
                  className="mt-1.5 text-xs"
                />
              </div>
            </div>

            {items.length > 0 && (
              <div className="mt-6 border-t border-border/70 pt-4 text-xs space-y-3">
                <p className="eyebrow">Cart Items ({items.length} items)</p>

                {preOrderedItems.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-accent flex items-center gap-1 mb-1">
                      <Sparkles className="size-3" /> Ready on Arrival / Freshly Prepared:
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
                  <span>Food Items Subtotal</span>
                  <span>₹{foodTotal}</span>
                </div>

                {packagingCharge > 0 && (
                  <div className="flex justify-between text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Package className="size-3 text-accent" /> Packaging Charge
                    </span>
                    <span className="font-medium text-foreground">₹{packagingCharge}</span>
                  </div>
                )}

                {deliveryFee > 0 && (
                  <div className="flex justify-between text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Bike className="size-3 text-accent" /> Delivery Fee
                    </span>
                    <span className="font-medium text-foreground">₹{deliveryFee}</span>
                  </div>
                )}

                {depositAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="size-3 text-accent" /> Table Reservation Deposit
                    </span>
                    <span className="font-medium text-foreground">₹{depositAmount}</span>
                  </div>
                )}
              </div>
            )}

            {/* Payment Options: Razorpay Online vs QR Code vs Cash */}
            <div className="mt-5 space-y-2.5 border-t border-border/70 pt-4">
              <p className="text-xs font-semibold text-foreground">Payment Method</p>

              <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors text-xs ${
                paymentMethod === "online_razorpay" ? "border-accent bg-accent/10" : "border-border hover:bg-secondary/40"
              }`}>
                <input
                  type="radio"
                  name="payment"
                  className="mt-0.5"
                  checked={paymentMethod === "online_razorpay"}
                  onChange={() => setPaymentMethod("online_razorpay")}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground flex items-center gap-1">
                      <CreditCard className="size-3.5 text-accent" /> Razorpay Online (UPI, Cards, Wallets)
                    </p>
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600">Test Mode</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Cards, UPI, Netbanking & Wallets with instant digital PDF receipt.
                  </p>
                </div>
              </label>

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
                    Scan with UPI app on confirmation & mark as paid.
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
                    <Banknote className="size-3.5 text-muted-foreground" />
                    {orderType === "DELIVERY" ? "Cash on Delivery" : "Pay at Counter (Cash)"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {orderType === "DELIVERY" ? "Pay rider upon delivery arrival." : "Order confirmed for counter payment."}
                  </p>
                </div>
              </label>
            </div>

            <div className="mt-4 pt-3 border-t border-border/70 flex justify-between items-baseline">
              <span className="font-semibold text-sm">Total Due</span>
              <span className="font-bold text-accent text-xl">₹{totalWithDeposit}</span>
            </div>

            {outOfStockInCart.length > 0 && (
              <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Items Out of Stock</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed">
                    {outOfStockInCart.map((i) => `"${i.name}"`).join(", ")}{" "}
                    {outOfStockInCart.length === 1 ? "is" : "are"} currently out of stock. Please remove from your pre-order to proceed.
                  </p>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="mt-6 w-full shadow-md"
              size="lg"
              disabled={submitting || outOfStockInCart.length > 0}
            >
              {submitting
                ? "Placing Order…"
                : outOfStockInCart.length > 0
                ? "Remove Out of Stock Items to Confirm"
                : orderType === "DINE_IN"
                ? "Confirm Table & Place Order"
                : orderType === "TAKEAWAY"
                ? "Confirm & Place Takeaway Order"
                : "Confirm & Place Delivery Order"}
            </Button>
          </div>
        </aside>
      </div>
    </form>

    {/* ─── 18+ Cocktail Age Confirmation Modal ─── */}
    {ageConfirmItem && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl relative text-card-foreground">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="size-11 rounded-2xl bg-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
              <ShieldAlert className="size-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg font-display">Age Verification Required</h3>
              <p className="text-xs text-muted-foreground">
                Item: <strong className="text-foreground">{ageConfirmItem.name} (₹{ageConfirmItem.price})</strong>
              </p>
            </div>
          </div>

          <div className="my-4 space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <p>
              This item is an <strong>alcoholic beverage</strong> and is strictly restricted to guests aged <strong>18 years or older</strong>.
            </p>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>
                Please ensure you have a valid government-issued photo ID to present to staff upon seating.
              </span>
            </div>
            <p className="font-medium text-foreground">
              Do you confirm that you are 18 years of age or older?
            </p>
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAgeConfirmItem(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmAgeAndAdd}
              className="text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold"
            >
              <Check className="size-3.5 mr-1" /> Yes, I Am 18+
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
