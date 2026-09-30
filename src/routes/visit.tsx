import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Clock,
  MapPin,
  Phone,
  Wifi,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  UtensilsCrossed,
  Sun,
  Laptop,
  Home,
  Coffee,
  Truck,
  Beer,
  Sunrise,
  Check,
  Star,
  Instagram,
  Mail,
  Users,
  IndianRupee,
} from "lucide-react";

import tableReserved from "@/assets/table-reserved.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/visit")({
  component: VisitPage,
});

// ─── Data ─────────────────────────────────────────────────────────────────────
const hours = [
  ["Monday – Thursday", "7:00 – 19:00"],
  ["Friday", "7:00 – 22:00"],
  ["Saturday", "8:00 – 22:00"],
  ["Sunday", "8:00 – 17:00"],
];

const notes = [
  {
    icon: MapPin,
    title: "238/25, Rajmahal Vilas Extension",
    body: "Old Tumkur Road, Near Sir C V Raman Road, Malleshwaram, Bangalore.",
  },
  { icon: Phone, title: "+91 7349540534", body: "Call for groups of 9 or more." },
  { icon: Wifi, title: "Laptops till 11am", body: "After that the tables go to shared seating." },
  { icon: Clock, title: "15-minute hold", body: "Running late? Reply to your booking SMS." },
];

const cuisines = ["Italian", "American", "Coffee"];

const facilities = [
  { icon: UtensilsCrossed, label: "Lunch" },
  { icon: Beer, label: "Serves alcohol" },
  { icon: Sun, label: "Outdoor seating" },
  { icon: Sunrise, label: "Breakfast" },
  { icon: Home, label: "Indoor seating" },
  { icon: Laptop, label: "Work friendly" },
  { icon: Truck, label: "Home delivery" },
  { icon: Coffee, label: "All day breakfast" },
  { icon: Coffee, label: "High tea" },
];

// ─── Owners ───────────────────────────────────────────────────────────────────
const owners = [
  {
    name: "Lekhana B S",
    role: "Co-Founder",
    bio:
      "Lekhana grew up watching her grandmother brew filter coffee before sunrise — and never stopped chasing that ritual. After years in tech and a stint learning espresso in Coorg, she brought both worlds together to build CAFEQ: a place where the Wi-Fi is fast and the coffee is even faster. She curates the beans, oversees sourcing, and still personally signs off on every new menu item.",
    placeholder: "LB",
    accent: "from-[--espresso] to-[--clay]",
  },
  {
    name: "Chandana Kashyap",
    role: "Co-Founder",
    bio:
      "Chandana is the architect behind CAFEQ's atmosphere. From the furniture choices to the playlist, she believes every detail shapes how a cup of coffee feels. A trained pastry chef who switched to hospitality design, she built the kitchen programme from scratch and made sure \"cozy\" and \"efficient\" were never mutually exclusive. She runs operations, the team culture, and yes — also makes the best croissants.",
    placeholder: "CK",
    accent: "from-[--clay] to-[--sage]",
  },
];

// ─── FAQ ─────────────────────────────────────────────────────────────────────
const faqs = [
  {
    q: "What are your opening hours?",
    a: "We're open Mon–Thu 7am–7pm, Fri 7am–10pm, Sat 8am–10pm, and Sun 8am–5pm.",
  },
  {
    q: "Is parking available?",
    a: "Yes — street parking is available on Rajmahal Vilas Extension. We also recommend Rapido or auto from Malleshwaram or Yeshwantpur metro stations (~5 min).",
  },
  {
    q: "Are pets allowed?",
    a: "Leashed, well-behaved pets are welcome at our outdoor courtyard seating. Please keep them off furniture.",
  },
  {
    q: "Is Wi-Fi available?",
    a: "Yes, free Wi-Fi for all guests. Laptop-friendly during mornings (7am–11am). After 11am, priority goes to groups and walkins for shared seating.",
  },
  {
    q: "Do you take reservations?",
    a: "Yes! Use our Reserve page to book any table type with optional food pre-order. Walk-ins are always welcome subject to availability.",
  },
  {
    q: "Do you have vegan/vegetarian options?",
    a: "Absolutely. Our menu clearly marks V (vegetarian) and VG (vegan) items. Most of our Fresh & Bowls section is fully plant-based.",
  },
  {
    q: "Do you have a minimum spend per table?",
    a: "No minimum spend. We believe every guest deserves a seat, whether you're here for a single espresso or a full brunch.",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/60">
      <button
        className="flex w-full items-center justify-between gap-3 py-4 text-left text-sm font-medium"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
      >
        <span>{q}</span>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{a}</p>
      )}
    </div>
  );
}

function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) return;
    const subs: string[] = JSON.parse(localStorage.getItem("cafeq_newsletter") ?? "[]");
    if (!subs.includes(email)) {
      subs.push(email);
      localStorage.setItem("cafeq_newsletter", JSON.stringify(subs));
    }
    setDone(true);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-7 shadow-warm text-center">
      <Mail className="mx-auto size-8 text-accent mb-3" aria-hidden="true" />
      <h3 className="text-xl font-semibold">Stay in the loop</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
        Get early access to events, new menu drops, and seasonal specials. No spam — just good coffee news.
      </p>
      {done ? (
        <div className="mt-5 flex items-center justify-center gap-2 text-green-600 font-medium">
          <Check className="size-4" /> You're subscribed!
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
            required
            aria-label="Email address for newsletter"
          />
          <Button type="submit">Subscribe</Button>
        </form>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function VisitPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 space-y-20">

      {/* ── ORIGINAL: Hours + House notes ─────────────────────────────── */}
      <div>
        <p className="eyebrow">Find us</p>
        <h1 className="mt-3 text-4xl sm:text-5xl">Visit Cafeq</h1>

        <div className="mt-12 grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl">Hours</h2>
            <ul className="mt-5 divide-y divide-border/60">
              {hours.map(([day, time]) => (
                <li key={day} className="flex justify-between py-3 text-sm">
                  <span>{day}</span>
                  <span className="text-muted-foreground">{time}</span>
                </li>
              ))}
            </ul>

            <h2 className="mt-12 text-2xl">House notes</h2>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              {notes.map((n) => (
                <div key={n.title}>
                  <n.icon className="size-4 text-accent" aria-hidden="true" />
                  <p className="mt-3 font-medium">{n.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                </div>
              ))}
            </div>

            <Button asChild className="mt-10">
              <Link to="/reserve">Reserve a table</Link>
            </Button>
          </div>

          <img
            src={tableReserved}
            alt="Café table for two by the window with a reserved card"
            width={1200}
            height={912}
            loading="lazy"
            className="w-full rounded-2xl object-cover shadow-warm"
          />
        </div>
      </div>

      {/* ── NEW: Restaurant Details Block ──────────────────────────────── */}
      <section>
        <p className="eyebrow">About the restaurant</p>
        <h2 className="mt-3 text-3xl sm:text-4xl">CAFEQ at a glance</h2>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Cost */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-warm">
            <IndianRupee className="size-5 text-accent" aria-hidden="true" />
            <p className="mt-3 font-semibold">Cost for two</p>
            <p className="text-2xl font-bold mt-1">₹1,400</p>
            <p className="text-xs text-muted-foreground mt-0.5">approximate, incl. drinks</p>
          </div>

          {/* Cuisines */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-warm">
            <UtensilsCrossed className="size-5 text-accent" aria-hidden="true" />
            <p className="mt-3 font-semibold">Cuisines</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {cuisines.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-accent/10 px-3 py-0.5 text-xs font-medium text-accent border border-accent/20"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-warm">
            <Phone className="size-5 text-accent" aria-hidden="true" />
            <p className="mt-3 font-semibold">Phone</p>
            <a
              href="tel:+917349540534"
              className="mt-1 block text-xl font-bold hover:text-accent transition-colors"
            >
              +91 7349540534
            </a>
            <p className="text-xs text-muted-foreground mt-0.5">Tap to call on mobile</p>
          </div>
        </div>

        {/* Facilities */}
        <div className="mt-8 rounded-xl border border-border bg-card p-5 shadow-warm">
          <h3 className="font-semibold mb-4 text-sm uppercase tracking-widest text-muted-foreground">
            Facilities &amp; Features
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {facilities.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <div className="flex size-7 items-center justify-center rounded-lg bg-accent/10 shrink-0">
                  <Icon className="size-3.5 text-accent" aria-hidden="true" />
                </div>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="mt-8 rounded-2xl overflow-hidden border border-border shadow-warm">
          <iframe
            title="CAFEQ location on Google Maps"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3887.312!2d77.565!3d13.003!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2s238%2F25%2C%20Rajmahal%20Vilas%20Extension%2C%20Malleshwaram%2C%20Bangalore!5e0!3m2!1sen!2sin!4v1000000000"
            width="100%"
            height="300"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-card border-t border-border/60 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4 shrink-0 text-accent" />
              <span>238/25, Rajmahal Vilas Extension, Malleshwaram, Bangalore</span>
            </div>
            <a
              href="https://www.google.com/maps/dir/?api=1&destination=238%2F25+Rajmahal+Vilas+Extension+Malleshwaram+Bangalore"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button size="sm" variant="outline">
                <ExternalLink className="size-3.5 mr-1.5" />
                Get Directions
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── NEW: About the Owners ─────────────────────────────────────── */}
      <section>
        <p className="eyebrow">The people behind it</p>
        <h2 className="mt-3 text-3xl sm:text-4xl">Meet the Co-Founders</h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          CAFEQ was born from a shared belief: that a café should feel like a second home —
          one where the coffee is honest, the food is made with care, and every guest is
          actually seen. Here's who made it happen.
        </p>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {owners.map((o) => (
            <div
              key={o.name}
              className="rounded-2xl border border-border bg-card shadow-warm overflow-hidden"
            >
              {/* Photo placeholder */}
              <div
                className={`flex h-48 items-center justify-center bg-gradient-to-br ${o.accent}`}
              >
                <div className="flex size-24 items-center justify-center rounded-full bg-white/20 text-white text-4xl font-bold">
                  {o.placeholder}
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-xl font-semibold">{o.name}</h3>
                  <span className="text-xs text-muted-foreground font-medium">{o.role}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{o.bio}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Why we started CAFEQ */}
        <blockquote className="mt-10 rounded-2xl border-l-4 border-accent bg-accent/5 px-6 py-5">
          <p className="text-base italic leading-relaxed">
            "We didn't start CAFEQ to open a café — we started it because every café we
            loved eventually became too loud, too generic, or too impersonal. We wanted
            one that stayed small on purpose. One where the coffee was so good it made
            Monday mornings survivable. That's still the only brief we follow."
          </p>
          <footer className="mt-3 text-sm font-medium text-accent">
            — Lekhana &amp; Chandana, Co-Founders
          </footer>
        </blockquote>
      </section>

      {/* ── NEW: Ratings teaser ──────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-7 shadow-warm flex flex-col sm:flex-row items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex">
            {[1,2,3,4,5].map((n) => (
              <Star key={n} className={`size-6 ${n <= 4 ? "fill-amber-400 text-amber-400" : "text-border"}`} />
            ))}
          </div>
          <div>
            <p className="text-2xl font-bold">4.5</p>
            <p className="text-xs text-muted-foreground">4 reviews</p>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            "Best latte art in Malleshwaram, highly recommend the outdoor seating."
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">— Anonymous ★★★★★</p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link to="/reviews">Read all reviews</Link>
        </Button>
      </section>

      {/* ── NEW: Instagram / Follow us ──────────────────────────────────── */}
      <section className="text-center">
        <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 mb-4">
          <Instagram className="size-7 text-white" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-semibold">Follow us on Instagram</h2>
        <p className="mt-2 text-muted-foreground text-sm max-w-sm mx-auto">
          Behind-the-scenes brews, seasonal specials, event highlights and latte art — straight from our counter to your feed.
        </p>
        <a
          href="https://www.instagram.com/cafeq.bangalore"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block"
        >
          <Button variant="outline">
            <Instagram className="size-4 mr-2" />
            @cafeq.bangalore
          </Button>
        </a>
        {/* Instagram feed embed placeholder — replace this div with an actual feed embed (e.g. Elfsight, Curator.io) when ready */}
        <div className="mt-8 grid grid-cols-3 sm:grid-cols-6 gap-2 max-w-2xl mx-auto">
          {[
            "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=200&q=70",
            "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=200&q=70",
            "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&q=70",
            "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=200&q=70",
            "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=200&q=70",
            "https://images.unsplash.com/photo-1498804103079-a6351b050096?w=200&q=70",
          ].map((src, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded-lg">
              <img src={src} alt="" aria-hidden="true" className="w-full h-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      </section>

      {/* ── NEW: FAQ ──────────────────────────────────────────────────── */}
      <section>
        <p className="eyebrow">Common questions</p>
        <h2 className="mt-3 text-3xl sm:text-4xl">FAQ</h2>
        <div className="mt-8 max-w-2xl">
          {faqs.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          More questions?{" "}
          <a href="tel:+917349540534" className="text-accent hover:underline">
            Call us
          </a>{" "}
          or{" "}
          <a
            href="mailto:hello@cafeq.in"
            className="text-accent hover:underline"
          >
            email hello@cafeq.in
          </a>
          .
        </p>
      </section>

      {/* ── NEW: Newsletter ────────────────────────────────────────────── */}
      <NewsletterSection />
    </div>
  );
}
