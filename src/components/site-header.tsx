import { Link, useNavigate } from "@tanstack/react-router";
import { Coffee, LogOut, User as UserIcon, Menu as MenuIcon, X, CalendarCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/menu", label: "Menu" },
  { to: "/events", label: "Events" },
  { to: "/visit", label: "Visit" },
  { to: "/reserve", label: "Reserve" },
] as const;

export function SiteHeader() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success("You have been signed out.");
    setMobileMenuOpen(false);
    navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 py-3.5">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group shrink-0">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
            <Coffee className="size-4 text-accent" aria-hidden="true" />
          </div>
          <span className="font-display text-xl tracking-tight font-bold text-foreground">
            Cafe<span className="text-accent">q</span>
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground font-semibold text-accent" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}

          {/* Show My Bookings link in desktop nav only if logged in */}
          {isAuthenticated && (
            <Link
              to="/history"
              className="text-muted-foreground transition-colors hover:text-foreground flex items-center gap-1.5"
              activeProps={{ className: "text-foreground font-semibold text-accent" }}
            >
              <CalendarCheck className="size-4 text-accent" />
              <span>My Bookings</span>
            </Link>
          )}
        </nav>

        {/* Desktop Auth Controls */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              {/* User greeting */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/70 border border-border/60 text-xs font-medium text-foreground">
                <div className="size-5 rounded-full bg-accent/20 text-accent flex items-center justify-center">
                  <UserIcon className="size-3" />
                </div>
                <span className="max-w-[120px] truncate">{user.name}</span>
              </div>

              {/* Logout Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="size-3.5 mr-1.5" />
                Logout
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="text-xs">
                <Link to="/login">Sign In</Link>
              </Button>
              <Button asChild size="sm" className="text-xs font-semibold shadow-sm">
                <Link to="/register">Register</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 focus:outline-none"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="size-6" /> : <MenuIcon className="size-6" />}
        </button>
      </div>

      {/* Mobile Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/60 bg-background/95 px-5 py-4 backdrop-blur-lg animate-in slide-in-from-top-2">
          {isAuthenticated && user && (
            <div className="mb-4 pb-3 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <div className="size-7 rounded-full bg-accent/20 text-accent flex items-center justify-center">
                  <UserIcon className="size-4" />
                </div>
                <div>
                  <p className="leading-tight">{user.name}</p>
                  <p className="text-[11px] font-normal text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <LogOut className="size-3 mr-1" /> Logout
              </Button>
            </div>
          )}

          <nav className="flex flex-col gap-2.5 text-sm font-medium">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground font-semibold text-accent" }}
                activeOptions={{ exact: l.to === "/" }}
              >
                {l.label}
              </Link>
            ))}

            {isAuthenticated ? (
              <Link
                to="/history"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-muted-foreground transition-colors hover:text-foreground flex items-center gap-2"
                activeProps={{ className: "text-foreground font-semibold text-accent" }}
              >
                <CalendarCheck className="size-4 text-accent" />
                <span>My Bookings</span>
              </Link>
            ) : (
              <div className="mt-3 pt-3 border-t border-border/60 flex flex-col gap-2">
                <Button asChild variant="outline" className="w-full justify-center text-xs">
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button asChild className="w-full justify-center text-xs font-semibold shadow-sm">
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                    Register
                  </Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
