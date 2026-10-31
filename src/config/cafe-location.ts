/**
 * The cafe's location: the one place to change the address, coordinates and map links.
 * Used by the Visit page map section and the "Find Us" card on the Reserve page.
 *
 * TODO: set the exact values. The Google share link below could not be resolved automatically,
 * so lat/lng are the approximate centre of Rajajinagar, Bengaluru. To get the exact ones, open
 * the share link in a browser, right-click the pin → the first line is "lat, lng"; copy the
 * street address from the place card into `address`.
 */
export const CAFE_LOCATION = {
  name: "CafeQ",
  /** Heading shown above the map */
  title: "CafeQ, Rajajinagar, Bengaluru",
  // TODO: full street address (e.g. "No. 12, 3rd Main Road, Rajajinagar, Bengaluru, Karnataka 560010")
  address: "Rajajinagar, Bengaluru, Karnataka",
  area: "Rajajinagar",
  // TODO: exact coordinates of the cafe
  lat: 12.9916,
  lng: 77.552,
  zoom: 16,
  phone: "+91 7349540534",
  /** Google Maps share link ("Open in Google Maps") */
  mapsUrl: "https://share.google/1yqJIfJY5F0zyP3oh",
  /** Map marker image (put the file in /public/images) */
  logoUrl: "/images/cafeq-logo.png",
} as const;

export const CAFE_HOURS: ReadonlyArray<readonly [string, string]> = [
  ["Monday – Thursday", "7:00 – 19:00"],
  ["Friday", "7:00 – 22:00"],
  ["Saturday", "8:00 – 22:00"],
  ["Sunday", "8:00 – 17:00"],
];

/** Google Maps directions to the cafe coordinates (opens in a new tab). */
export const CAFE_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${CAFE_LOCATION.lat},${CAFE_LOCATION.lng}`;

export const CAFE_PHONE_HREF = `tel:${CAFE_LOCATION.phone.replace(/\s+/g, "")}`;
