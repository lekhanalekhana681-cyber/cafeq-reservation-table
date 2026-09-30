import { Link } from "@tanstack/react-router";
import { Coffee } from "lucide-react";

const links = [
  { to: "/", label: "Home" },
  { to: "/menu", label: "Menu" },
  { to: "/history", label: "My Bookings" },
  { to: "/about", label: "About" },
  { to: "/events", label: "Events" },
  { to: "/visit", label: "Visit" },
  { to: "/reserve", label: "Reserve" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4">
        <Link to="/" className="flex items-center gap-2">
          <Coffee className="size-5 text-accent" aria-hidden="true" />
          <span className="font-display text-lg tracking-tight font-semibold">Cafeq</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-5 text-sm overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-muted-foreground transition-colors hover:text-foreground whitespace-nowrap"
              activeProps={{ className: "text-foreground font-semibold" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
