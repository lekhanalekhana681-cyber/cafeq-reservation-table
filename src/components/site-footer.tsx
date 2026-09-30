import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-secondary/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-base text-foreground font-semibold">Cafeq</p>
          <p className="text-xs mt-0.5">18 Kettle Lane, Indiranagar — open 7am to 7pm, daily</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-xs">
          <p>Reservations held for 15 minutes.</p>
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-1 text-muted-foreground/80 hover:text-accent font-medium transition-colors"
          >
            <ShieldCheck className="size-3.5" /> Staff Portal
          </Link>
        </div>
      </div>
    </footer>
  );
}
