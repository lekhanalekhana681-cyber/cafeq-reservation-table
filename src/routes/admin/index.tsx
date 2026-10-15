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
  KeyRound,
  ShieldAlert,
  Eye,
  EyeOff,
  Lock,
  X,
  AlertCircle,
  ChefHat,
  UserPlus,
  Power,
  Key,
  UtensilsCrossed,
  Wine,
  Save,
  Check,
  Tag,
  DollarSign,
  SlidersHorizontal,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  getCurrentAdmin,
  logoutAdmin,
  changeAdminPassword,
  getKitchenStaffUsers,
  createKitchenStaffAccount,
  toggleKitchenStaffStatus,
  resetKitchenStaffPassword,
  type User,
} from "@/lib/auth";
import {
  getAllBookings,
  updateBookingStatus,
  type BookingInput,
  type BookingStatus,
} from "@/lib/bookings.functions";
import { tableTypes, type MenuItem } from "@/data/menu";
import {
  getStoredMenu,
  updateMenuItemPrice,
  updateMenuItem,
  isCocktailsCategoryHidden,
  setCocktailsCategoryHidden,
  subscribeToMenuUpdates,
} from "@/lib/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  // Change password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Manage Kitchen Staff modal state
  const [showKitchenModal, setShowKitchenModal] = useState(false);
  const [kitchenStaff, setKitchenStaff] = useState<User[]>([]);
  const [newStaffUsername, setNewStaffUsername] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [resetStaffPasswordInput, setResetStaffPasswordInput] = useState("");

  // Top-level Admin View Tab ("reservations" | "menu")
  const [activeAdminTab, setActiveAdminTab] = useState<"reservations" | "menu">("reservations");

  // Menu Manager State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [vegFilter, setVegFilter] = useState<"all" | "veg" | "non-veg" | "alcoholic">("all");
  const [hideCocktails, setHideCocktails] = useState<boolean>(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);

  // Reservation Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "upcoming">("all");
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const refreshMenu = () => {
    try {
      const items = getStoredMenu();
      setMenuItems(items);
      setHideCocktails(isCocktailsCategoryHidden());
    } catch (err) {
      console.error("Failed to load menu in admin:", err);
    }
  };

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
    loadKitchenStaff();
    refreshMenu();

    const unsubMenu = subscribeToMenuUpdates(refreshMenu);
    return () => unsubMenu();
  }, [navigate]);

  const loadKitchenStaff = () => {
    try {
      const staff = getKitchenStaffUsers();
      setKitchenStaff(staff);
    } catch {
      // Ignore
    }
  };

  const handleCreateKitchenStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffUsername.trim() || !newStaffName.trim() || !newStaffPassword) {
      toast.error("Please fill in username, full name, and initial password.");
      return;
    }
    setCreatingStaff(true);
    try {
      const res = await createKitchenStaffAccount({
        username: newStaffUsername,
        name: newStaffName,
        password: newStaffPassword,
      });
      if (res.success) {
        toast.success(`Kitchen staff account created for @${newStaffUsername}`);
        setNewStaffUsername("");
        setNewStaffName("");
        setNewStaffPassword("");
        loadKitchenStaff();
      } else {
        toast.error(res.error || "Failed to create kitchen account.");
      }
    } catch {
      toast.error("Failed to create kitchen account.");
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleToggleStaffDisabled = async (userId: string, currentDisabled?: boolean) => {
    const res = await toggleKitchenStaffStatus(userId, !currentDisabled);
    if (res.success) {
      toast.success(currentDisabled ? "Staff account re-enabled" : "Staff account disabled");
      loadKitchenStaff();
    } else {
      toast.error(res.error || "Failed to update staff status.");
    }
  };

  const handleResetStaffPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !resetStaffPasswordInput || resetStaffPasswordInput.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    const res = await resetKitchenStaffPassword(resettingUser.id, resetStaffPasswordInput);
    if (res.success) {
      toast.success(`Password updated for ${resettingUser.name}`);
      setResettingUser(null);
      setResetStaffPasswordInput("");
    } else {
      toast.error(res.error || "Failed to reset password.");
    }
  };

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Please enter your current administrator password.");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match. Please verify.");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await changeAdminPassword({
        adminId: admin?.id,
        currentPassword,
        newPassword,
      });

      if (res.success) {
        setPasswordSuccess("Administrator password updated successfully!");
        toast.success("Admin password successfully updated.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordSuccess(null);
        }, 1200);
      } else {
        setPasswordError(res.error || "Failed to update password.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error updating password.";
      setPasswordError(msg);
    } finally {
      setChangingPassword(false);
    }
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

  // Menu Item Actions
  const handlePriceDraftChange = (id: string, val: string) => {
    setPriceDrafts((prev) => ({ ...prev, [id]: val }));
  };

  const handleSavePrice = (item: MenuItem) => {
    const draftVal = priceDrafts[item.id];
    const numPrice = draftVal !== undefined ? parseFloat(draftVal) : item.price;
    if (isNaN(numPrice) || numPrice < 0) {
      toast.error("Please enter a valid price in ₹.");
      return;
    }
    setSavingPriceId(item.id);
    const success = updateMenuItemPrice(item.id, numPrice);
    if (success) {
      toast.success(`Updated "${item.name}" price to ₹${Math.round(numPrice)}`);
      setPriceDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      refreshMenu();
    } else {
      toast.error("Failed to update price.");
    }
    setSavingPriceId(null);
  };

  const handleToggleItemAvailability = (item: MenuItem) => {
    const nextAvailability = !item.isAvailable;
    updateMenuItem(item.id, { isAvailable: nextAvailability });
    toast.success(
      `"${item.name}" is now marked ${nextAvailability ? "In Stock" : "86'd / Out of Stock"}`
    );
    refreshMenu();
  };

  const handleToggleCocktailsCategory = () => {
    const next = !hideCocktails;
    setCocktailsCategoryHidden(next);
    setHideCocktails(next);
    if (next) {
      toast.warning("Cocktails category HIDDEN from customer menu (Liquor license offline).");
    } else {
      toast.success("Cocktails category ACTIVE and visible to customers (18+ verification enforced).");
    }
  };

  const allCategories = useMemo(() => {
    const cats = new Set(menuItems.map((m) => m.category));
    return Array.from(cats);
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (menuSearch.trim()) {
        const q = menuSearch.toLowerCase().trim();
        const mName = item.name.toLowerCase().includes(q);
        const mDesc = item.description?.toLowerCase().includes(q);
        const mCat = item.category.toLowerCase().includes(q);
        if (!mName && !mDesc && !mCat) return false;
      }
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }
      if (vegFilter === "veg" && !item.isVeg) return false;
      if (vegFilter === "non-veg" && item.isVeg) return false;
      if (vegFilter === "alcoholic" && !item.isAlcoholic) return false;
      return true;
    });
  }, [menuItems, menuSearch, selectedCategory, vegFilter]);

  const menuStats = useMemo(() => {
    return {
      total: menuItems.length,
      veg: menuItems.filter((i) => i.isVeg).length,
      nonVeg: menuItems.filter((i) => !i.isVeg).length,
      alcoholic: menuItems.filter((i) => i.isAlcoholic).length,
      outOfStock: menuItems.filter((i) => !i.isAvailable).length,
    };
  }, [menuItems]);

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
            {/* Shortcut to Kitchen Display System */}
            <Button
              asChild
              variant="outline"
              size="sm"
              className="text-xs bg-orange-950/30 border-orange-600/40 text-orange-400 hover:text-orange-300 hover:bg-orange-900/40"
            >
              <Link to="/kitchen">
                <ChefHat className="size-3.5 mr-1.5" /> Kitchen KDS
              </Link>
            </Button>

            {/* Manage Kitchen Staff */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadKitchenStaff();
                setShowKitchenModal(true);
              }}
              className="text-xs bg-neutral-900 border-neutral-700 text-neutral-200 hover:text-white hover:bg-neutral-800"
            >
              <Users className="size-3.5 mr-1.5 text-orange-400" /> Manage Kitchen Staff
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPasswordError(null);
                setPasswordSuccess(null);
                setShowPasswordModal(true);
              }}
              className="text-xs bg-neutral-900 border-amber-500/30 text-amber-400 hover:text-amber-300 hover:bg-neutral-800"
            >
              <KeyRound className="size-3.5 mr-1.5 text-amber-400" /> Change Password
            </Button>

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
        {/* Production Deployment Security Banner */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 shadow-inner">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-amber-200">
                Security Notice: Default Administrator Password Active
              </h4>
              <p className="mt-0.5 text-xs text-neutral-300 leading-relaxed">
                The master administrator account is seeded with default dev credentials (<span className="font-mono text-amber-400">CafeQ</span> / <span className="font-mono text-amber-400">Cafe@123</span>).
                <strong className="text-amber-200"> This password must be changed before deploying to production.</strong>
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setPasswordError(null);
              setPasswordSuccess(null);
              setShowPasswordModal(true);
            }}
            className="shrink-0 bg-amber-600 hover:bg-amber-500 text-neutral-950 font-bold text-xs shadow-md shadow-amber-950/50"
          >
            <KeyRound className="size-3.5 mr-1.5" /> Update Password
          </Button>
        </div>

        {/* Admin Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2 rounded-2xl bg-neutral-900 p-1.5 border border-neutral-800">
            <button
              type="button"
              onClick={() => setActiveAdminTab("reservations")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeAdminTab === "reservations"
                  ? "bg-amber-600 text-neutral-950 shadow-md font-bold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <CalendarCheck className="size-4" />
              <span>Reservations & Orders</span>
              <span className="rounded-full bg-neutral-950/40 text-[10px] px-2 py-0.5 ml-1">
                {bookings.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveAdminTab("menu")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeAdminTab === "menu"
                  ? "bg-amber-600 text-neutral-950 shadow-md font-bold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <UtensilsCrossed className="size-4" />
              <span>Menu & Price Manager</span>
              <span className="rounded-full bg-neutral-950/40 text-[10px] px-2 py-0.5 ml-1">
                {menuItems.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {hideCocktails ? (
              <Badge className="bg-red-950/80 text-red-400 border border-red-700/50 text-[11px] py-1 px-3">
                🍷 Cocktails Category Hidden
              </Badge>
            ) : (
              <Badge className="bg-emerald-950/80 text-emerald-300 border border-emerald-600/50 text-[11px] py-1 px-3">
                🍷 Cocktails Active (18+)
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={refreshMenu}
              className="bg-neutral-900 border-neutral-800 text-neutral-300 text-xs hover:text-white"
              title="Refresh Menu State"
            >
              <RefreshCw className="size-3.5 mr-1" /> Reload Menu
            </Button>
          </div>
        </div>

        {/* Tab 1: Reservations & Orders */}
        {activeAdminTab === "reservations" && (
          <>
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
          </>
        )}

        {/* Tab 2: Menu & Price Manager */}
        {activeAdminTab === "menu" && (
          <div className="space-y-6">
            {/* Alcohol License / Cocktails Category Toggle Banner */}
            <div className="rounded-2xl border border-amber-500/30 bg-neutral-900/80 p-5 sm:p-6 backdrop-blur-md shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div
                    className={`size-12 rounded-2xl flex items-center justify-center shrink-0 border transition-all ${
                      hideCocktails
                        ? "bg-red-950/40 border-red-500/30 text-red-400"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-inner"
                    }`}
                  >
                    <Wine className="size-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-bold text-white font-display">
                        Bar & Liquor License Compliance
                      </h3>
                      {hideCocktails ? (
                        <Badge className="bg-red-950/80 text-red-300 border border-red-700/50 text-[10px]">
                          License Offline • Cocktails Hidden
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-950/80 text-emerald-300 border border-emerald-600/50 text-[10px]">
                          Active License • 18+ Verification Enforced
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-300 max-w-2xl leading-relaxed">
                      Statutory alcohol compliance: Under Indian liquor licensing laws, cocktails may only be served when an active bar license is in effect. When toggled OFF, the entire Cocktails category is instantly hidden from customer menus and reservation pre-orders.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleToggleCocktailsCategory}
                  className={`shrink-0 font-bold text-xs h-10 px-4 transition-all shadow-md ${
                    hideCocktails
                      ? "bg-emerald-600 hover:bg-emerald-500 text-neutral-950 shadow-emerald-950/50"
                      : "bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700/50"
                  }`}
                >
                  {hideCocktails ? (
                    <>
                      <Check className="size-4 mr-1.5" /> Enable Cocktails Category (18+)
                    </>
                  ) : (
                    <>
                      <EyeOff className="size-4 mr-1.5" /> Hide Cocktails Category (No License)
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Menu Statistics KPI Cards */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 shadow-sm">
                <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
                  <span>Total Menu Items</span>
                  <UtensilsCrossed className="size-4 text-amber-500" />
                </div>
                <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-white">
                  {menuStats.total}
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">Across {allCategories.length} categories</p>
              </div>

              <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-4 shadow-sm">
                <div className="flex items-center justify-between text-emerald-400 text-xs font-medium">
                  <span>Vegetarian</span>
                  <span className="size-2 rounded-full bg-emerald-400"></span>
                </div>
                <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-emerald-300">
                  {menuStats.veg}
                </p>
                <p className="mt-1 text-[11px] text-emerald-500/70">Pure veg items</p>
              </div>

              <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-4 shadow-sm">
                <div className="flex items-center justify-between text-rose-400 text-xs font-medium">
                  <span>Non-Vegetarian</span>
                  <span className="size-2 rounded-full bg-rose-400"></span>
                </div>
                <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-rose-300">
                  {menuStats.nonVeg}
                </p>
                <p className="mt-1 text-[11px] text-rose-500/70">Chicken & meat options</p>
              </div>

              <div className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 shadow-sm">
                <div className="flex items-center justify-between text-amber-400 text-xs font-medium">
                  <span>Cocktails (18+)</span>
                  <Wine className="size-4 text-amber-400" />
                </div>
                <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-amber-300">
                  {menuStats.alcoholic}
                </p>
                <p className="mt-1 text-[11px] text-amber-500/70">
                  {hideCocktails ? "Hidden from public" : "Available to 18+"}
                </p>
              </div>

              <div className="col-span-2 lg:col-span-1 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 shadow-sm">
                <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
                  <span>Out of Stock (86'd)</span>
                  <AlertTriangle className="size-4 text-amber-500" />
                </div>
                <p className="mt-2 text-2xl sm:text-3xl font-display font-bold text-neutral-300">
                  {menuStats.outOfStock}
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">Temporarily unavailable</p>
              </div>
            </section>

            {/* Menu Filter & Search Toolbar */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                <Input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Search dishes by name or description…"
                  className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 pl-10 text-xs h-10"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Category dropdown */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs px-3 py-2 focus:outline-none focus:border-amber-500"
                >
                  <option value="all">All Categories ({menuItems.length})</option>
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat} ({menuItems.filter((i) => i.category === cat).length})
                    </option>
                  ))}
                </select>

                {/* Dietary Filter Pills */}
                <div className="flex items-center rounded-xl bg-neutral-950 p-1 border border-neutral-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setVegFilter("all")}
                    className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
                      vegFilter === "all"
                        ? "bg-amber-600 text-neutral-950 font-bold"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setVegFilter("veg")}
                    className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1 ${
                      vegFilter === "veg"
                        ? "bg-emerald-600 text-neutral-950 font-bold"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-emerald-400"></span> Veg
                  </button>
                  <button
                    type="button"
                    onClick={() => setVegFilter("non-veg")}
                    className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1 ${
                      vegFilter === "non-veg"
                        ? "bg-rose-600 text-neutral-950 font-bold"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <span className="size-1.5 rounded-full bg-rose-400"></span> Non-Veg
                  </button>
                  <button
                    type="button"
                    onClick={() => setVegFilter("alcoholic")}
                    className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1 ${
                      vegFilter === "alcoholic"
                        ? "bg-amber-600 text-neutral-950 font-bold"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    🍷 18+
                  </button>
                </div>

                <span className="text-xs text-neutral-500 font-medium px-2">
                  {filteredMenuItems.length} items
                </span>
              </div>
            </section>

            {/* Menu Items Table */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl">
              <div className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display font-semibold text-base text-neutral-200">
                    Menu Items & Live Pricing ({filteredMenuItems.length})
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Price changes sync instantly across Customer Menu, Pre-orders, and KDS
                  </p>
                </div>
              </div>

              {filteredMenuItems.length === 0 ? (
                <div className="p-12 text-center text-neutral-500 text-sm">
                  No menu items found matching "{menuSearch}".
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-950/70 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="px-5 py-3.5 font-semibold">Photo</th>
                        <th className="px-5 py-3.5 font-semibold">Item & Details</th>
                        <th className="px-5 py-3.5 font-semibold">Category</th>
                        <th className="px-5 py-3.5 font-semibold">Dietary & Age</th>
                        <th className="px-5 py-3.5 font-semibold">Stock Status</th>
                        <th className="px-5 py-3.5 font-semibold text-right">Price (₹ INR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60 text-neutral-200">
                      {filteredMenuItems.map((item) => {
                        const draftVal =
                          priceDrafts[item.id] !== undefined
                            ? priceDrafts[item.id]
                            : String(item.price);
                        const isDirty =
                          priceDrafts[item.id] !== undefined &&
                          priceDrafts[item.id] !== String(item.price);
                        const isSaving = savingPriceId === item.id;

                        return (
                          <tr key={item.id} className="hover:bg-neutral-800/40 transition-colors">
                            {/* Photo Thumbnail */}
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <div className="relative size-14 rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950 flex items-center justify-center shrink-0 shadow-sm">
                                <img
                                  src={item.image || "/uploads/menu/placeholder.webp"}
                                  alt={item.name}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src =
                                      "/uploads/menu/placeholder.webp";
                                  }}
                                  className="size-full object-cover"
                                  loading="lazy"
                                />
                                {item.isAlcoholic && (
                                  <span className="absolute top-1 right-1 bg-neutral-950/90 text-amber-400 text-[9px] font-bold px-1 rounded border border-amber-500/40">
                                    18+
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Name & Details */}
                            <td className="px-5 py-3.5">
                              <div className="font-semibold text-white text-sm flex items-center gap-2">
                                <span>{item.name}</span>
                                {item.tag && (
                                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-normal">
                                    {item.tag}
                                  </span>
                                )}
                              </div>
                              <p className="text-neutral-400 text-[11px] line-clamp-1 mt-0.5 max-w-xs">
                                {item.description || "Freshly handcrafted"}
                              </p>
                              <span className="text-[10px] text-neutral-500 flex items-center gap-1 mt-1">
                                <Clock className="size-2.5" /> Prep: {item.prepTimeMinutes || 10} min
                              </span>
                            </td>

                            {/* Category */}
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className="border-neutral-700 bg-neutral-800/80 text-neutral-300 text-[11px]"
                              >
                                {item.category}
                              </Badge>
                            </td>

                            {/* Dietary & Age Badges */}
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <div className="flex flex-col gap-1 items-start">
                                {item.isVeg ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                    <span className="size-1.5 rounded-full bg-emerald-400"></span> Veg
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-400 bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded-full">
                                    <span className="size-1.5 rounded-full bg-rose-400"></span> Non-Veg
                                  </span>
                                )}

                                {item.isAlcoholic && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-full">
                                    🍷 18+ Alcoholic
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Stock Status Toggle */}
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleToggleItemAvailability(item)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                                  item.isAvailable
                                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-600/40 hover:bg-emerald-900/40"
                                    : "bg-red-950/50 text-red-300 border-red-600/40 hover:bg-red-900/40"
                                }`}
                              >
                                {item.isAvailable ? "In Stock" : "86'd / Sold Out"}
                              </button>
                            </td>

                            {/* Price & Save Action */}
                            <td className="px-5 py-3.5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="relative w-24">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-bold">
                                    ₹
                                  </span>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={draftVal}
                                    onChange={(e) =>
                                      handlePriceDraftChange(item.id, e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSavePrice(item);
                                    }}
                                    className={`pl-6 pr-2 h-9 text-xs font-bold font-mono text-right rounded-xl border ${
                                      isDirty
                                        ? "border-amber-500 bg-amber-950/20 text-amber-300"
                                        : "border-neutral-800 bg-neutral-950 text-white"
                                    }`}
                                  />
                                </div>

                                <Button
                                  size="sm"
                                  onClick={() => handleSavePrice(item)}
                                  disabled={isSaving || !isDirty}
                                  className={`h-9 px-3 text-xs font-bold rounded-xl transition-all ${
                                    isDirty
                                      ? "bg-amber-600 hover:bg-amber-500 text-neutral-950 shadow-md shadow-amber-950/50"
                                      : "bg-neutral-800 text-neutral-500 border border-neutral-700/50"
                                  }`}
                                  title={isDirty ? "Save price change" : "Price matches saved state"}
                                >
                                  {isSaving ? (
                                    <RefreshCw className="size-3.5 animate-spin" />
                                  ) : isDirty ? (
                                    <>
                                      <Save className="size-3.5 mr-1" /> Save
                                    </>
                                  ) : (
                                    <Check className="size-3.5 text-emerald-400" />
                                  )}
                                </Button>
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
          </div>
        )}
      </main>

      {/* Change Password Dialog Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                setShowPasswordModal(false);
                setPasswordError(null);
                setPasswordSuccess(null);
              }}
              className="absolute right-5 top-5 text-neutral-400 hover:text-neutral-100 transition-colors p-1 rounded-lg hover:bg-neutral-800"
              aria-label="Close modal"
            >
              <X className="size-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="size-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner">
                <KeyRound className="size-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-100 font-display">
                  Change Master Password
                </h3>
                <p className="text-xs text-neutral-400">
                  Update credentials for administrator <span className="text-amber-400 font-medium">{admin?.name}</span>
                </p>
              </div>
            </div>

            {/* Feedback alerts */}
            {passwordError && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300 flex items-start gap-2">
                <AlertCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
                <span>{passwordError}</span>
              </div>
            )}
            {passwordSuccess && (
              <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300 flex items-start gap-2">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <Label htmlFor="current-pw" className="text-xs font-semibold text-neutral-300">
                  Current Password
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="current-pw"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password (e.g. Cafe@123)"
                    className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500 pl-9 pr-10 h-10 text-sm"
                    autoComplete="current-password"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="new-pw" className="text-xs font-semibold text-neutral-300">
                  New Password
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="new-pw"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500 pl-9 pr-10 h-10 text-sm"
                    autoComplete="new-password"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="confirm-pw" className="text-xs font-semibold text-neutral-300">
                  Confirm New Password
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="confirm-pw"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-600 focus:border-amber-500 pl-9 h-10 text-sm"
                    autoComplete="new-password"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordError(null);
                    setPasswordSuccess(null);
                  }}
                  className="text-neutral-400 hover:text-white text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={changingPassword}
                  className="bg-amber-600 hover:bg-amber-500 text-neutral-950 font-bold px-5 text-xs shadow-md shadow-amber-950/40"
                >
                  {changingPassword ? "Updating…" : "Save Password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Manage Kitchen Staff Modal ─── */}
      {showKitchenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center">
                  <ChefHat className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-neutral-100">Manage Kitchen Staff Accounts</h3>
                  <p className="text-xs text-neutral-400">
                    Create kitchen logins, toggle active/disabled status, and reset staff passwords.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowKitchenModal(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* List of existing staff */}
            <div className="my-4 flex-1 overflow-y-auto space-y-2.5 pr-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Active & Registered Staff ({kitchenStaff.length})
              </h4>
              {kitchenStaff.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-500 border border-neutral-800 rounded-2xl">
                  No kitchen staff accounts registered yet.
                </div>
              ) : (
                kitchenStaff.map((staff) => (
                  <div
                    key={staff.id}
                    className="flex items-center justify-between p-3 rounded-2xl border border-neutral-800 bg-neutral-950/60"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-neutral-100">{staff.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-mono px-1.5 py-0 ${
                            staff.is_disabled
                              ? "text-rose-400 border-rose-500/40 bg-rose-950/40"
                              : "text-emerald-400 border-emerald-500/40 bg-emerald-950/40"
                          }`}
                        >
                          {staff.is_disabled ? "Disabled" : "Active"}
                        </Badge>
                      </div>
                      <div className="text-xs text-neutral-400 mt-0.5">
                        Username: <span className="text-orange-400 font-mono">@{staff.username || "kitchen"}</span> • {staff.email}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setResettingUser(staff);
                          setResetStaffPasswordInput("");
                        }}
                        className="text-xs h-8 border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white"
                      >
                        <Key className="size-3 mr-1" /> Reset Pass
                      </Button>
                      <Button
                        size="sm"
                        variant={staff.is_disabled ? "outline" : "destructive"}
                        onClick={() => handleToggleStaffDisabled(staff.id, staff.is_disabled)}
                        className="text-xs h-8"
                      >
                        <Power className="size-3 mr-1" />
                        {staff.is_disabled ? "Enable" : "Disable"}
                      </Button>
                    </div>
                  </div>
                ))
              )}

              {/* Add New Staff Form */}
              <div className="mt-5 pt-4 border-t border-neutral-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-orange-400 mb-3 flex items-center gap-1.5">
                  <UserPlus className="size-3.5" /> Provision New Kitchen Staff Member
                </h4>
                <form onSubmit={handleCreateKitchenStaff} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <Label className="text-[11px] text-neutral-400">Username</Label>
                    <Input
                      value={newStaffUsername}
                      onChange={(e) => setNewStaffUsername(e.target.value)}
                      placeholder="e.g. chef_john"
                      className="h-8 text-xs bg-neutral-950 border-neutral-800 text-neutral-200 mt-1"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-neutral-400">Full Name</Label>
                    <Input
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="h-8 text-xs bg-neutral-950 border-neutral-800 text-neutral-200 mt-1"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-neutral-400">Initial Password</Label>
                    <Input
                      type="password"
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="h-8 text-xs bg-neutral-950 border-neutral-800 text-neutral-200 mt-1"
                      required
                    />
                  </div>
                  <div className="sm:col-span-3 flex justify-end">
                    <Button
                      type="submit"
                      disabled={creatingStaff}
                      size="sm"
                      className="h-8 text-xs bg-orange-600 hover:bg-orange-500 text-white"
                    >
                      {creatingStaff ? "Creating..." : "Add Kitchen Staff"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-800 flex justify-end">
              <Button onClick={() => setShowKitchenModal(false)} className="text-xs bg-neutral-800 hover:bg-neutral-700">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reset Kitchen Password Sub-Modal ─── */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="font-bold text-base text-neutral-100">Reset Staff Password</h3>
            <p className="text-xs text-neutral-400 mt-1">
              Set new password for <span className="text-orange-400 font-semibold">{resettingUser.name}</span> (@{resettingUser.username})
            </p>

            <form onSubmit={handleResetStaffPassword} className="mt-4 space-y-3">
              <div>
                <Label className="text-xs text-neutral-300">New Password</Label>
                <Input
                  type="password"
                  value={resetStaffPasswordInput}
                  onChange={(e) => setResetStaffPasswordInput(e.target.value)}
                  placeholder="At least 6 characters"
                  className="bg-neutral-950 border-neutral-800 text-neutral-200 text-xs h-9 mt-1"
                  autoFocus
                  required
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setResettingUser(null)}
                  className="text-xs text-neutral-400"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="text-xs bg-orange-600 hover:bg-orange-500 text-white">
                  Save Password
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
