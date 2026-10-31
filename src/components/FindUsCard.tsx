import { Clock, MapPin, Navigation, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CafeMap } from "@/components/CafeMap";
import { CAFE_DIRECTIONS_URL, CAFE_HOURS, CAFE_LOCATION, CAFE_PHONE_HREF } from "@/config/cafe-location";

/** "Find Us" card on the Reserve page: map, address, opening hours and directions. */
export function FindUsCard() {
  return (
    <section aria-labelledby="find-us-heading" className="rounded-2xl border border-border bg-card shadow-warm overflow-hidden">
      <div className="p-5 pb-4">
        <p className="eyebrow">Find us</p>
        <h3 id="find-us-heading" className="mt-1.5 text-lg font-display text-foreground">
          {CAFE_LOCATION.title}
        </h3>
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0 mt-0.5 text-accent" aria-hidden="true" />
          <span>{CAFE_LOCATION.address}</span>
        </p>
        <a href={CAFE_PHONE_HREF} className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground hover:text-accent">
          <Phone className="size-4 shrink-0 text-accent" aria-hidden="true" />
          {CAFE_LOCATION.phone}
        </a>
      </div>

      <CafeMap className="border-y border-border/60" />

      <div className="p-5 pt-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Clock className="size-3.5 text-accent" aria-hidden="true" /> Opening hours
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {CAFE_HOURS.map(([day, time]) => (
            <li key={day} className="flex justify-between gap-3">
              <span>{day}</span>
              <span className="text-muted-foreground">{time}</span>
            </li>
          ))}
        </ul>
        <Button asChild className="mt-4 w-full">
          <a href={CAFE_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
            <Navigation className="size-4 mr-1.5" aria-hidden="true" />
            Get Directions
          </a>
        </Button>
      </div>
    </section>
  );
}
