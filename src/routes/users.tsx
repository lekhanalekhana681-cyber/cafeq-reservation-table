import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  User as UserIcon,
  Mail,
  Phone,
  Calendar,
  Clock,
  ShieldCheck,
  LogOut,
  Coffee,
  CalendarCheck,
  ChevronRight,
  ArrowRight,
  Receipt,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { getUserBookings, type BookingInput } from "@/lib/bookings.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageBackground } from "@/components/PageBackground";

export const Route = createFileRoute("/users")({
  component: UsersProfilePage,
});

function UsersProfilePage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [userBookings, setUserBookings] = useState<BookingInput[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Fetch real records whenever the authenticated user changes
  useEffect(() => {
    let isCancelled = false;

    if (user?.id) {
      setLoadingRecords(true);
      getUserBookings({
        userId: user.id,
        phone: user.phone,
        email: user.email,
      })
        .then((records) => {
          if (!isCancelled) {
            setUserBookings(records);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setUserBookings([]);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setLoadingRecords(false);
          }
        });
    } else {
      // Clear data completely on logout or when no user is authenticated
      setUserBookings([]);
    }

    return () => {
      isCancelled = true;
    };
  }, [user?.id, user?.email]);

  const handleLogout = () => {
    logout();
    toast.success("You have been signed out.");
    navigate({ to: "/login" });
  };

  if (isLoading) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading profile...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="relative min-h-[80vh] flex items-center justify-center px-4 py-16">
        <PageBackground />
        <div className="relative z-10 max-w-md w-full text-center bg-card/90 backdrop-blur-md border border-border/70 rounded-2xl p-8 shadow-warm">
          <div className="size-16 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto mb-4">
            <UserIcon className="size-8" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">User Profile</h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Please sign in to view your user profile, manage reservations, and access cloud-synced dining history.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild className="font-semibold shadow-sm">
              <Link to="/login" search={{ redirect: "/users" }}>
                Sign In
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">Create Account</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const upcomingBookings = userBookings.filter((b) => b.status === "confirmed");
  const pastBookings = userBookings.filter((b) => b.status !== "confirmed");

  return (
    <main className="relative min-h-screen py-10 px-4 sm:px-6">
      <PageBackground />
      <div className="relative z-10 max-w-5xl mx-auto space-y-8">
        {/* Profile Header Card */}
        <section className="bg-card/90 backdrop-blur-md border border-border/70 rounded-3xl p-6 sm:p-8 shadow-warm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-border/70">
            <div className="flex items-center gap-4">
              <div className="size-16 sm:size-20 rounded-2xl bg-gradient-to-tr from-accent/30 to-amber-500/20 text-accent flex items-center justify-center border border-accent/20 shadow-inner">
                <UserIcon className="size-8 sm:size-10" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                    {user.name}
                  </h1>
                  <Badge
                    variant="outline"
                    className="capitalize font-semibold text-xs border-accent/40 bg-accent/10 text-accent"
                  >
                    {user.role} Account
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 font-mono">
                  <span>ID:</span> <span className="text-foreground/80">{user.id}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                <Link to="/reserve">
                  <Coffee className="size-3.5 mr-1.5 text-accent" />
                  Book Table
                </Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleLogout}
                className="flex-1 sm:flex-none"
              >
                <LogOut className="size-3.5 mr-1.5" />
                Sign Out
              </Button>
            </div>
          </div>

          {/* User Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-secondary/50 border border-border/50">
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-accent">
                <Mail className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Email Address</p>
                <p className="text-sm font-semibold text-foreground truncate">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-secondary/50 border border-border/50">
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-accent">
                <Phone className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Phone Number</p>
                <p className="text-sm font-semibold text-foreground truncate">{user.phone || "Not provided"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-secondary/50 border border-border/50">
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-accent">
                <Calendar className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Member Since</p>
                <p className="text-sm font-semibold text-foreground truncate">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Active Member"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Cloud-Synced Activity & Reservations */}
        <section className="bg-card/90 backdrop-blur-md border border-border/70 rounded-3xl p-6 sm:p-8 shadow-warm space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-border/70">
            <div>
              <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                <CalendarCheck className="size-5 text-accent" />
                <span>Cloud-Synced Records</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Linked to User ID <span className="font-mono text-accent">{user.id}</span> • Synchronized across phone &amp; laptop
              </p>
            </div>

            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/history" className="flex items-center gap-1">
                <span>All Bookings</span>
                <ChevronRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {loadingRecords ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-xs">Fetching cloud records from database...</p>
            </div>
          ) : userBookings.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-border/80 bg-secondary/20 p-8">
              <Coffee className="size-10 text-muted-foreground/60 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground">No records found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                You haven&apos;t created any reservations with this account yet. Reserve your first table now!
              </p>
              <Button asChild size="sm" className="mt-4 font-semibold">
                <Link to="/reserve">Book a Table Now</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-secondary/40 border border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Upcoming Reservations</span>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                      {upcomingBookings.length} Active
                    </Badge>
                  </div>
                  <p className="font-display text-2xl font-bold mt-2 text-foreground">
                    {upcomingBookings.length}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-secondary/40 border border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Past &amp; Completed Visits</span>
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                      {pastBookings.length} Total
                    </Badge>
                  </div>
                  <p className="font-display text-2xl font-bold mt-2 text-foreground">
                    {pastBookings.length}
                  </p>
                </div>
              </div>

              {/* Recent Bookings List */}
              <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-background/50 overflow-hidden">
                {userBookings.slice(0, 5).map((b) => (
                  <div key={b.code} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-secondary/30 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-accent">#{b.code}</span>
                        <Badge
                          variant="outline"
                          className={
                            b.status === "confirmed"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]"
                              : "bg-muted text-muted-foreground text-[10px]"
                          }
                        >
                          {b.status}
                        </Badge>
                        {b.hasPreorder && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                            Pre-Ordered
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{b.date}</span>
                        <span>•</span>
                        <span>{b.time}</span>
                        <span>•</span>
                        <span>{b.party} {b.party === 1 ? "Guest" : "Guests"}</span>
                        <span>•</span>
                        <span className="capitalize">{b.seating || b.tableType}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <span className="font-display font-semibold text-sm text-foreground">
                        ₹{b.total}
                      </span>
                      <Button asChild size="sm" variant="outline" className="text-xs">
                        <Link to="/history" search={{ phone: b.phone }}>
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
