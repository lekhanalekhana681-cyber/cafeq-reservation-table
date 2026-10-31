import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "./cafe-map.css";
import { CAFE_LOCATION } from "@/config/cafe-location";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Leaflet + OpenStreetMap map (no API key) centred on CAFE_LOCATION, with the CafeQ logo as the
 * marker. Scroll-zoom is off so the page scrolls smoothly on mobile; the +/− buttons stay.
 * If Leaflet or the map tiles fail to load, the static address is shown instead.
 */
export function CafeMap({ className = "" }: { className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    let tilesLoaded = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    import("leaflet")
      .then(({ default: L }) => {
        if (cancelled || !el.current) return;
        const { lat, lng, zoom, name, address, phone, logoUrl } = CAFE_LOCATION;

        map = L.map(el.current, { center: [lat, lng], zoom, scrollWheelZoom: false, zoomControl: true });
        const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        tiles.on("tileload", () => (tilesLoaded = true));
        // No tile at all after 10s (offline, blocked) → static fallback
        timer = setTimeout(() => !tilesLoaded && !cancelled && setFailed(true), 10000);

        // Logo marker; if the image is missing, a "Q" badge shows instead
        const icon = L.divIcon({
          className: "cafeq-marker",
          html: `<div class="cafeq-marker__pin"><img src="${esc(logoUrl)}" alt="" onerror="this.remove()" /><span>Q</span></div>`,
          iconSize: [48, 58],
          iconAnchor: [24, 58],
          popupAnchor: [0, -54],
        });
        L.marker([lat, lng], { icon, title: name, alt: `${name} location` })
          .addTo(map)
          .bindPopup(
            `<div class="cafeq-popup"><strong>${esc(name)}</strong><p>${esc(address)}</p>` +
              `<a href="tel:${esc(phone.replace(/\s+/g, ""))}">${esc(phone)}</a></div>`,
          );
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      map?.remove();
    };
  }, []);

  if (failed) {
    return (
      <div
        role="status"
        className={`flex h-[220px] sm:h-[300px] flex-col items-center justify-center gap-2 bg-muted/40 px-6 text-center ${className}`}
      >
        <MapPin className="size-6 text-accent" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">The map couldn't load.</p>
        <p className="text-sm text-muted-foreground">
          {CAFE_LOCATION.name} · {CAFE_LOCATION.address}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={el}
      role="region"
      aria-label={`Map showing ${CAFE_LOCATION.name}, ${CAFE_LOCATION.address}`}
      className={`cafeq-map relative z-0 h-[220px] sm:h-[300px] w-full bg-muted/40 ${className}`}
    />
  );
}
